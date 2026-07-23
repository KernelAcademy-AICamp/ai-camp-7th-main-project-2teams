import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuth } from '@/lib/auth'
import { generateTags, createEmbedding, buildWeakEmbeddingText, generateWeakSummary } from '@/lib/ai'
import { normalizeTags, extractTopCategory, resolveTopCategory } from '@/lib/tag-alias'
import { parseNetscapeBookmarks, type ParsedBookmark } from '@/lib/parseNetscapeBookmarks'
import { parseKakaoChat } from '@/lib/parseKakaoChat'
import { normalizeUrl } from '@/lib/normalizeUrl'
import { fetchMeta } from '@/lib/fetchMeta'
import { isSafeHttpUrl } from '@/lib/ssrf'

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
/** folder_hint 갱신 동시 처리 청크 크기 — 대량 중복(최대 500건) 시 update() 무제한 fan-out 방지 */
const FOLDER_UPDATE_CHUNK = 20

// file 필드 존재 + 타입 검증 (400). 크기는 별도 413 처리.
// HTML(Netscape 북마크) 또는 CSV(카카오톡 채팅 내보내기) 둘 다 허용.
const fileSchema = z.object({
  file: z
    .instanceof(File, { message: '파일 필드가 없습니다' })
    .refine(
      (f) =>
        f.type === 'text/html' ||
        f.name.endsWith('.html') ||
        f.type === 'text/csv' ||
        f.name.endsWith('.csv'),
      { message: 'HTML 또는 CSV 파일만 허용됩니다' },
    ),
})

// 확장자/MIME으로 HTML(Netscape 북마크) vs CSV(카카오톡 채팅) 판별
function isCsvFile(file: File): boolean {
  return file.type === 'text/csv' || file.name.endsWith('.csv')
}

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
    // 카톡 CSV는 title=url placeholder(parseKakaoChat) — url을 canonical로 바꾸면 title(원본)과
    // 어긋나 아래 승격 조건(parsedTitle === url)이 깨진다. placeholder면 title도 canonical로 통일.
    // 유튜브 공유링크(youtu.be·?si=)는 normalizeUrl이 항상 형태를 바꿔 이 케이스에 반드시 걸림.
    const title = item.title === item.url ? url : item.title
    candidates.set(url, { ...item, url, title })
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
// A52: 각 URL을 fetchMeta로 조회해 description(카드 표시용)·content(임베딩 입력, 2000자) 확보.
//      description은 DB 저장(기본값). content(본문 텍스트)는 태깅/임베딩 스코프 내에서만
//      사용 후 파기 — DB 저장·로그 금지(프라이버시).
// 중복 URL(DB 기존·배치 내부)은 AI 호출 전에 걸러냄 — 완전 스킵하거나 folder_hint만 갱신.
// 파일 검증(400/413)과 빈 파싱(0건) 경로는 즉시 JSON 응답. 실제 처리 단계는 SSE 스트림으로
// 항목이 종결 처리될 때마다 progress 이벤트 전송, 마지막에 done 이벤트로 최종 결과 전달.
// progress/done 이벤트 모두 embedding/content/description 절대 미포함.
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

  const text = await file.text()
  const allBookmarks = isCsvFile(file) ? parseKakaoChat(text) : parseNetscapeBookmarks(text)

  // 0건은 처리할 것도, 스트리밍할 것도 없으므로 즉시 JSON 응답 (스트림 진입 안 함)
  if (allBookmarks.length === 0) {
    return NextResponse.json({ imported: 0, failed: 0, skipped: 0, duplicate: 0 })
  }

  // 상한 초과분은 잘라내고 skipped 카운트로 보고
  const skipped = Math.max(0, allBookmarks.length - MAX_ITEMS)
  const items = allBookmarks.slice(0, MAX_ITEMS)

  // 배치 내부 중복 제거 (마지막 등장의 folder_hint 채택) — 스트림 진입 전 동기 계산
  const { candidates, duplicate: batchDuplicate } = dedupeBatch(items)
  const total = candidates.size

  const encoder = new TextEncoder()
  function send(controller: ReadableStreamDefaultController, event: Record<string, unknown>) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
  }

  const stream = new ReadableStream({
    async start(controller) {
      let duplicate = batchDuplicate
      let imported = 0
      let failed = 0
      let done = 0
      // A61: 실패 항목 상세 — 어떤 URL이 왜 실패했는지(고정 문구 3종). done 이벤트에서만 전달.
      const failedItems: { url: string; reason: string }[] = []

      try {
        // 기존 저장된 URL 배치 조회 — AI 호출 전 사전 필터링
        const existingByUrl = await fetchExistingByUrl(supabase, user.id, [...candidates.keys()])

        // 신규 처리 대상과 folder_hint만 갱신할 대상을 먼저 동기적으로 분류(await 없음) —
        // toProcess는 원본 순서를 그대로 보존해야 하므로(임베딩 실패 순서 테스트 등) 비동기 fan-out 이전에 확정한다.
        const toProcess: CandidateBookmark[] = []
        const needsFolderUpdate: Array<{ url: string; newFolderHint: string[] | null }> = []

        for (const item of candidates.values()) {
          if (!existingByUrl.has(item.url)) {
            toProcess.push(item)
            continue
          }

          // 이미 DB에 존재 — folder_hint 비교 후 완전 스킵 또는 folder_hint만 갱신
          duplicate++
          const existingFolderHint = existingByUrl.get(item.url) ?? null
          const newFolderHint = item.folder_hint.length > 0 ? item.folder_hint : null
          if (foldersEqual(existingFolderHint, newFolderHint)) {
            // 네트워크 작업 없이 즉시 종결 — progress 이벤트도 즉시 전송
            done++
            send(controller, { type: 'progress', total, done, imported, duplicate, failed, skipped })
            continue
          }

          needsFolderUpdate.push({ url: item.url, newFolderHint })
        }

        // FOLDER_UPDATE_CHUNK개씩 청크로 나눠 처리 — 최대 500건이 한꺼번에 몰려도
        // update() 커넥션이 무제한 fan-out 되지 않도록 방어(AI 처리 루프의 CHUNK_SIZE와 동일한 스로틀링 패턴)
        for (let i = 0; i < needsFolderUpdate.length; i += FOLDER_UPDATE_CHUNK) {
          const chunk = needsFolderUpdate.slice(i, i + FOLDER_UPDATE_CHUNK)
          await Promise.all(
            chunk.map(async ({ url, newFolderHint }) => {
              try {
                // supabase-js 쿼리 빌더는 DB 에러를 throw하지 않고 { error } 필드로 resolve한다.
                // 여기서 error를 의도적으로 확인하지 않는 것 자체가 fail-open 처리다 — 실패해도
                // duplicate 집계만 유지하고 failed는 증가시키지 않는다. try/catch는 그와 별개로
                // 네트워크 단절 등 실제 예외 상황에 대한 방어선일 뿐이다.
                await supabase
                  .from('bookmarks')
                  .update({ folder_hint: newFolderHint })
                  .eq('user_id', user.id)
                  .eq('url', url)
              } catch {
                // 실제 예외(네트워크 등) 방어 — 위 주석 참고, 여기도 failed 증가 안 함
              } finally {
                // 항목 단위 진행률 — 청크(Promise.all) 전체를 기다리지 않고 이 항목이 끝나는 즉시 전송
                done++
                send(controller, { type: 'progress', total, done, imported, duplicate, failed, skipped })
              }
            }),
          )
        }

        // category_id 조회 메모이즈 — 대분류 13종(TOP_CATEGORIES) 고정이므로 N+1 방지
        const categoryCache = new Map<string, string | null>()

        // CHUNK_SIZE개씩 청크로 나눠 처리 — OpenAI rate limit 방어
        for (let i = 0; i < toProcess.length; i += CHUNK_SIZE) {
          const chunk = toProcess.slice(i, i + CHUNK_SIZE)

          await Promise.all(
            chunk.map(async ({ title: parsedTitle, url, folder_hint, tags: htmlTags, category_name }) => {
              try {
                // A52: URL 메타 조회 → description(카드 표시용)·content(임베딩 입력) 확보.
                // fetchMeta는 throw 안 함(실패=빈 값), 내부 5s 타임아웃.
                // ponytail: 항목당 최대 5s(죽은 URL) 추가 — 청크 동시성(CHUNK_SIZE)이 상한. 대량+저속 URL로
                //           maxDuration(300s) 압박 시 백그라운드 큐로 승격(현재는 인라인으로 충분).
                const meta = await fetchMeta(url)
                const description = meta.description || undefined
                // 임베딩 입력 — description(짧은 요약)이 아니라 content(본문 포함, 2000자 상한) 사용.
                // 태깅·임베딩 스코프 내에서만 사용 후 파기 — DB 저장·로그 금지(프라이버시).
                const embeddingContent = meta.content || undefined

                // 카카오톡 CSV는 실제 title이 없어 parseKakaoChat이 title=url로 채워 넘김 —
                // 그 placeholder를 여기서 fetchMeta 실제 title로 승격(단건 추가 경로와 동일 패턴).
                // HTML 임포트는 원래 title이 이미 유의미하므로(=url인 경우만 예외) 그대로 유지.
                const title = parsedTitle === url && meta.title ? meta.title : parsedTitle

                // 자체 내보내기 HTML(TAGS 속성 포함)은 AI 재태깅 없이 그대로 복원 — 일반 브라우저
                // 내보내기(TAGS 없음)만 기존처럼 generateTags 호출.
                const tagsPromise = htmlTags
                  ? Promise.resolve(htmlTags)
                  : generateTags({ title, url, description: embeddingContent })

                // content 없으면(weak-vector) 태그를 먼저 받아 임베딩에 포함 — 단건 추가(POST)와 동일 규약.
                const [tagsResult, embeddingResult] = await Promise.allSettled([
                  tagsPromise,
                  embeddingContent
                    ? createEmbedding(`${title}\n${embeddingContent}`)
                    : Promise.all([
                        tagsPromise.catch(() => [] as string[]),
                        generateWeakSummary({ title, url }),
                      ]).then(([tags, summary]) =>
                        createEmbedding(buildWeakEmbeddingText(title, normalizeTags(tags), summary)),
                      ),
                ])

                // 임베딩 실패 → 검색 불가 북마크 → 해당 항목만 실패 처리, 전체 중단 금지
                if (embeddingResult.status === 'rejected') {
                  failed++
                  failedItems.push({ url, reason: '임베딩 생성 실패' })
                  return
                }

                const embedding = embeddingResult.value
                // 태깅 실패는 빈 태그로 degrade.
                // A5(단건)와 달리 임포트는 임베딩 실패 시에도 전체 중단하지 않고 해당 항목만 실패 처리.
                const rawTags = tagsResult.status === 'fulfilled' ? tagsResult.value : []
                // DATA_CATEGORY 복원분은 이미 대분류/중분류가 분리돼 있으므로 extractTopCategory(재분리) 불필요 —
                // resolveTopCategory로 유효성만 검증(별칭 매핑 포함, 13종 외 값은 null=미분류).
                const { category: top, midTags: tags } = category_name
                  ? { category: resolveTopCategory(category_name), midTags: normalizeTags(rawTags) }
                  : extractTopCategory(normalizeTags(rawTags))
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
                    description: description ?? null,
                    tags,
                    category_id,
                    // 루트 항목(빈 배열)은 null 저장 — A5 패턴과 통일
                    folder_hint: folder_hint.length > 0 ? folder_hint : null,
                    embedding,
                    thumbnail_url: isSafeHttpUrl(meta.thumbnailUrl) ? meta.thumbnailUrl : null,
                  },
                  { onConflict: 'user_id, url', ignoreDuplicates: true },
                )

                if (error) {
                  // DB 에러 원문(error.message)은 로그에만 남기고 클라이언트엔 고정 문구만 전달
                  // — 스키마·내부 구조 유출 방지(security.md 3번 원칙)
                  failed++
                  failedItems.push({ url, reason: '저장 실패' })
                } else {
                  imported++
                }
              } catch {
                // 개별 항목 예외 → 실패 카운트만 증가, 전체 배치 계속
                failed++
                failedItems.push({ url, reason: '처리 중 오류' })
              } finally {
                // 항목 단위 진행률 — 청크 전체를 기다리지 않고 이 항목이 끝나는 즉시 전송
                done++
                send(controller, { type: 'progress', total, done, imported, duplicate, failed, skipped })
              }
            }),
          )
        }

        send(controller, { type: 'done', imported, failed, skipped, duplicate, failedItems })
        controller.close()
      } catch (err) {
        // 스트림 처리 중 예상 못한 예외 — error 이벤트로 명시 전달 후 종료(무한 대기 방지)
        send(controller, {
          type: 'error',
          message: err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.',
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})
