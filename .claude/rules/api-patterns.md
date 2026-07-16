# API / 메시지 패턴 (단일 출처)

`feature-builder` 에이전트 · `/api-route` 스킬이 참조하는 구현 보일러플레이트. 상세 타입은 `docs/specs/nextjs-supabase.md`.

## Route Handler (front/app/api/**/route.ts)

```ts
import { withAuth } from '@/lib/auth'
import { z } from 'zod'

const bodySchema = z.object({ /* ... */ })

export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // 명시적 컬럼 select — embedding 제외
  const { data, error } = await supabase
    .from('bookmarks')
    .insert({ ...parsed.data, user_id: user.id })
    .select('id, url, title, tags, category_id, folder_hint, is_favorite, created_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ bookmark: data })
})
```

규칙:
- `withAuth` 필수 (미인증 401)
- 입력 `safeParse` 필수 (검증 실패 400)
- `select('*')` 금지 → embedding 누출 방지, 명시 컬럼만
- 서버 전용 키(`SERVICE_ROLE`/`OPENAI_API_KEY`)는 Route Handler·서버 모듈에서만
- `content`는 처리 후 변수 스코프 종료로 파기, DB·로그 금지

## Extension 메시지 패턴 (MV3)

```ts
// background ↔ content/popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SAVE_BOOKMARK') {
    saveBookmark(msg.payload).then(sendResponse)
    return true // async 응답 유지
  }
})
```

규칙:
- 메시지는 `{ type, payload }` 형태
- async 핸들러는 `return true`로 채널 유지
- 토큰은 `chrome.storage.local`, 서버 키는 extension에 절대 미포함
- `manifest.json` 최소 권한 원칙 (A23)
