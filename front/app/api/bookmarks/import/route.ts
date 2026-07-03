import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/auth'
import { generateTags, createEmbedding } from '@/lib/ai'
import { normalizeTags, extractTopCategory } from '@/lib/tag-alias'
import { parseNetscapeBookmarks, type ParsedBookmark } from '@/lib/parseNetscapeBookmarks'
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
/** 기존 URL 존재 여부 배치 조회 시 IN절 청크 크기 */
const EXISTING_LOOKUP_CHUNK = 200

// file 필드 존재 + 타입 검증 (400). 크기는 별도 413 처리.
const fileSchema = z.object({
  file: z
    .instanceof(File, { message: '파일 필드가 없습니다' })
    .refine(
      (f) => f.type === 'text/html' || f.name.endsWith('.html'),
      { message: 'HTML 파일만 허용됩니다' },
    ),
})

type CandidateBookmark = ParsedBookmark & { url: string }

// 배치 내부 중복 제거 — 동일 URL 재등장 시 마지막 등장으로 덮어씀(folder_hint 최신 반영).
// normalizeUrl 기준으로 키를 잡아 이후 단계(DB 조회·insert)에서 재정규화하지 않는다.
function dedupeBatch(
  items: ParsedBookmark[],
): { candidates: Map<string, CandidateBookmark>; duplicate: number } {
  const candidates = new Map<string, CandidateBookmark>()
  let duplicate = 0
  for (const item of items) {
    const url = normalizeUrl(item.url)
    if (candidates.has(url)) duplicate++
    candidates.set(url, { ...item, url })
  }
  return { candidates, duplicate }
}

// 기존 저장된 URL + folder_hint 배치 조회. 조회 실패(에러) 시 fail-open —
// 해당 청크는 중복 체크 없이 넘어가고 전체 임포트는 중단하지 않는다.
async function fetchExistingByUrl(
  supabase: SupabaseClient,
  userId: string,
  urls: string[],
): Promise<Map<string, string[] | null>> {
  const existing = new Map<string, string[] | null>()
  for (let i = 0; i < urls.length; i += EXISTING_LOOKUP_CHUNK) {
    const slice = urls.slice(i, i + EXISTING_LOOKUP_CHUNK)
    const { data, error } = await supabase
      .from('bookmarks')
      .select('url, folder_hint')
      .eq('user_id', userId)
      .in('url', slice)
    if (error) continue
    for (const row of (data ?? []) as Array<{ url: string; folder_hint: string[] | null }>) {
      existing.set(row.url, row.folder_hint)
    }
  }
  return existing
}

// null↔[] 동일 취급, 배열 순서까지 완전 일치해야 "같음"
function foldersEqual(a: string[] | null, b: string[] | null): boolean {
  const normA = a && a.length > 0 ? a : null
  const normB = b && b.length > 0 ? b : null
  return JSON.stringify(normA) === JSON.stringify(normB)
}

// FormData 'file' 필드로 Netscape 북마크 HTML을 받아 배치 저장.
// A52: 각 URL을 fetchMeta로 조회해 description 확보 → 태깅·임베딩 입력 보강.
//      description은 태깅/임베딩 스코프 내에서만 사용 후 파기 — DB 저장·로그 금지(프라이버시).
// 중복 URL(DB 기존·배치 내부)은 AI 호출 전에 걸러냄 — 완전 스킵하거나 folder_hint만 갱신.
// 응답: { imported, failed, skipped, duplicate } — embedding/content/description 절대 미포함.
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
    return NextResponse.json({ imported: 0, failed: 0, skipped: 0, duplicate: 0 })
  }

  // 상한 초과분은 잘라내고 skipped 카운트로 보고
  const skipped = Math.max(0, allBookmarks.length - MAX_ITEMS)
  const items = allBookmarks.slice(0, MAX_ITEMS)

  // 배치 내부 중복 제거 (마지막 등장의 folder_hint 채택)
  const { candidates, duplicate: batchDuplicate } = dedupeBatch(items)
  let duplicate = batchDuplicate

  // 기존 저장된 URL 배치 조회 — AI 호출 전 사전 필터링
  const existingByUrl = await fetchExistingByUrl(supabase, user.id, [...candidates.keys()])

  const toProcess: CandidateBookmark[] = []

  await Promise.all(
    [...candidates.values()].map(async (item) => {
      if (!existingByUrl.has(item.url)) {
        toProcess.push(item)
        return
      }

      // 이미 DB에 존재 — folder_hint 비교 후 완전 스킵 또는 folder_hint만 갱신
      duplicate++
      const existingFolderHint = existingByUrl.get(item.url) ?? null
      const newFolderHint = item.folder_hint.length > 0 ? item.folder_hint : null
      if (foldersEqual(existingFolderHint, newFolderHint)) return

      try {
        await supabase
          .from('bookmarks')
          .update({ folder_hint: newFolderHint })
          .eq('user_id', user.id)
          .eq('url', item.url)
      } catch {
        // fail-open — folder_hint 갱신 실패는 duplicate로만 집계, failed 증가 안 함
      }
    }),
  )

  let imported = 0
  let failed = 0

  // category_id 조회 메모이즈 — 최대 6대분류 고정이므로 N+1 방지
  const categoryCache = new Map<string, string | null>()

  // CHUNK_SIZE개씩 청크로 나눠 처리 — OpenAI rate limit 방어
  for (let i = 0; i < toProcess.length; i += CHUNK_SIZE) {
    const chunk = toProcess.slice(i, i + CHUNK_SIZE)

    await Promise.all(
      chunk.map(async ({ title, url, folder_hint }) => {
        try {
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

          // upsert — (user_id, url) unique 제약(A35). 사전 dedup을 통과한 URL만 여기 도달하므로
          // 정상 경로에선 충돌이 없고, ignoreDuplicates:true는 동시 요청 경합 시 마지막 방어선
          // (경합 시 조용히 무시 — 기존 데이터 덮어쓰지 않음, "완전 스킵" 원칙과 일치).
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
            { onConflict: 'user_id, url', ignoreDuplicates: true },
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

  return NextResponse.json({ imported, failed, skipped, duplicate })
})
