import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth'
import { generateTags, createEmbedding } from '@/lib/ai'
import { normalizeTags, extractTopCategory } from '@/lib/tag-alias'
import { parseNetscapeBookmarks } from '@/lib/parseNetscapeBookmarks'
import { normalizeUrl } from '@/lib/normalizeUrl'
import { fetchMeta } from '@/lib/fetchMeta'

// 대량 임포트 중 OpenAI 호출이 누적되므로 Vercel Pro 최대값(300s) 지정
export const maxDuration = 300

/** 허용 파일 크기 상한 (5MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024
/** 처리량 상한 — 초과분은 skipped로 보고 */
const MAX_ITEMS = 500
/** OpenAI rate limit 방어를 위한 동시 처리 청크 크기 */
const CHUNK_SIZE = 5

// file 필드 존재 + 타입 검증 (400). 크기는 별도 413 처리.
const fileSchema = z.object({
  file: z
    .instanceof(File, { message: '파일 필드가 없습니다' })
    .refine(
      (f) => f.type === 'text/html' || f.name.endsWith('.html'),
      { message: 'HTML 파일만 허용됩니다' },
    ),
})

// FormData 'file' 필드로 Netscape 북마크 HTML을 받아 배치 저장.
// A52: 각 URL을 fetchMeta로 조회해 description 확보 → 태깅·임베딩 입력 보강.
//      description은 태깅/임베딩 스코프 내에서만 사용 후 파기 — DB 저장·로그 금지(프라이버시).
// 응답: { imported, failed, skipped } — embedding/content/description 절대 미포함.
export const POST = withAuth(async (req, { user, supabase }) => {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: '파일 업로드 파싱 실패' }, { status: 400 })
  }

  // Zod safeParse: 파일 존재 여부 + MIME/확장자 검증 → 400
  const parsed = fileSchema.safeParse({ file: formData.get('file') })
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  const file = parsed.data.file

  // 크기 초과는 HTTP 의미론적으로 413 (Zod와 별도 처리)
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: '파일 크기가 5MB를 초과합니다' },
      { status: 413 },
    )
  }

  const html = await file.text()
  const allBookmarks = parseNetscapeBookmarks(html)

  if (allBookmarks.length === 0) {
    return NextResponse.json({ imported: 0, failed: 0, skipped: 0 })
  }

  // 상한 초과분은 잘라내고 skipped 카운트로 보고
  const skipped = Math.max(0, allBookmarks.length - MAX_ITEMS)
  const items = allBookmarks.slice(0, MAX_ITEMS)

  let imported = 0
  let failed = 0

  // category_id 조회 메모이즈 — 최대 6대분류 고정이므로 N+1 방지
  const categoryCache = new Map<string, string | null>()

  // CHUNK_SIZE개씩 청크로 나눠 처리 — OpenAI rate limit 방어
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE)

    await Promise.all(
      chunk.map(async ({ title, url: rawUrl, folder_hint }) => {
        try {
          // 중복 방지: 단건 저장(A5)과 동일하게 canonical URL로 정규화
          const url = normalizeUrl(rawUrl)

          // A52: URL 메타 조회 → description 확보(태깅 굶김 해소). fetchMeta는 throw 안 함(실패=빈 값),
          // 내부 5s 타임아웃. description은 아래 태깅·임베딩 입력으로만 쓰고 저장·로그하지 않음.
          // ponytail: 항목당 최대 5s(죽은 URL) 추가 — 청크 동시성(CHUNK_SIZE)이 상한. 대량+저속 URL로
          //           maxDuration(300s) 압박 시 백그라운드 큐로 승격(현재는 인라인으로 충분).
          const meta = await fetchMeta(url)
          const description = meta.description || undefined

          const [tagsResult, embeddingResult] = await Promise.allSettled([
            generateTags({ title, url, description }),
            createEmbedding(description ? `${title}\n${description}` : title),
          ])

          // 임베딩 실패 → 검색 불가 북마크 → 해당 항목만 실패 처리, 전체 중단 금지
          if (embeddingResult.status === 'rejected') {
            failed++
            return
          }

          const embedding = embeddingResult.value
          // 태깅 실패는 빈 태그로 degrade.
          // A5(단건)와 달리 임포트는 임베딩 실패 시에도 전체 중단하지 않고 해당 항목만 실패 처리.
          const rawTags = tagsResult.status === 'fulfilled' ? tagsResult.value : []
          const { category: top, midTags: tags } = extractTopCategory(normalizeTags(rawTags))
          let category_id: string | null = null
          if (top) {
            if (categoryCache.has(top)) {
              category_id = categoryCache.get(top)!
            } else {
              // 유저 카테고리 upsert (없으면 생성, 있으면 id만 반환)
              const { data: category } = await supabase
                .from('categories')
                .upsert({ name: top, user_id: user.id }, { onConflict: 'user_id,name' })
                .select('id')
                .single()
              category_id = category?.id ?? null
              categoryCache.set(top, category_id)
            }
          }

          // upsert — (user_id, url) unique 제약(A35), 재임포트 시 AI 태깅·임베딩 갱신
          const { error } = await supabase.from('bookmarks').upsert(
            {
              user_id: user.id,
              title,
              url,
              tags,
              category_id,
              // 루트 항목(빈 배열)은 null 저장 — A5 패턴과 통일
              folder_hint: folder_hint.length > 0 ? folder_hint : null,
              embedding,
            },
            { onConflict: 'user_id, url', ignoreDuplicates: false },
          )

          if (error) {
            failed++
          } else {
            imported++
          }
        } catch {
          // 개별 항목 예외 → 실패 카운트만 증가, 전체 배치 계속
          failed++
        }
      }),
    )
  }

  return NextResponse.json({ imported, failed, skipped })
})
