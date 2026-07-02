# Design System 구현 스펙 (Structured Teal)

시각 방향·팔레트·컴포넌트 명세는 루트 [`Design.md`](../../Design.md)가 **단일 출처(SSOT)**.
이 문서는 그 의도가 코드에서 **어떻게 구현되는지**만 다룬다. 색/폰트 값 재정의 금지 — Design.md 참조.

## 토큰 위치

전 토큰은 `front/app/globals.css` 한 파일. Tailwind v4 CSS-first(`@theme`), v3 `tailwind.config.js` 없음.

| 계층 | 정의 | 비고 |
| --- | --- | --- |
| 브랜드/폰트 | `@theme` (`--color-brand`, `--font-sans`, `--font-mono`) | `#0f766e` = Deep Teal |
| 시그니처 그라디언트 | `@utility gradient-brand` | `linear-gradient(135deg, #0f766e, #14b8a6)` |
| shadcn 시맨틱 | `@theme inline` + `:root`/`.dark` | oklch 변수(`--primary`, `--sidebar` 등) |
| radius 스케일 | `@theme inline` (`--radius-sm`~`4xl`) | base `--radius: 0.625rem` |

## 그라디언트 사용처 (남발 금지 원칙)

`gradient-brand` 클래스 적용 파일 — 상단바·프라이머리·아바타·심볼에만:

- `app/(dashboard)/layout.tsx` — 상단바
- `app/login/page.tsx` — 로그인 CTA
- `app/(dashboard)/page.tsx` — 정렬 토글/강조
- `app/(dashboard)/import/page.tsx` — 진행/완료
- `components/Favicon.tsx` — 파비콘 스퀘어
- `components/Sidebar.tsx` — 프로필 아바타
- `components/AddBookmarkModal.tsx` — 프라이머리

새 그라디언트 표면 추가 시 이 목록 갱신 + Design.md §7 원칙 확인.

## shadcn 시맨틱 컬러 (oklch)

`--primary`/`--ring` = `oklch(0.52 0.09 182)` ≈ Deep Teal. `:root`(라이트)·`.dark` 2벌.
shadcn 컴포넌트는 이 시맨틱 토큰만 참조. Design.md 팔레트와 **표현 방식만 다름**(hex↔oklch), 의도 동일.

## 카테고리 컬러코딩

`lib/categoryColor.ts` 단일 유틸. Design.md §2 지정 4색은 `FIXED` 맵 고정,
그 외 유저 카테고리는 이름 해시로 `PALETTE`(4색) 순환. `Sidebar.tsx`가 도트 색에 사용.

```ts
categoryColor('개발')      // '#0F766E' (FIXED)
categoryColor('AI/ML')     // 해시 → PALETTE 순환
```

색 추가 시 `FIXED`/`PALETTE`만 수정. 컴포넌트에서 카테고리별 색 하드코딩(`text-[#hex]`) 금지 — 이 유틸 경유.

> `import/page.tsx` 등의 `text-[#0F766E]`/`[#64748B]`는 **카테고리 색 아님**(브랜드/본문 텍스트) — 유틸 대상 아님.

## 폰트

- 본문/UI: **Pretendard** (`--font-sans`, `html { @apply font-sans }`)
- 모노(도메인·날짜·이메일·버전): `--font-mono` = Geist Mono → SF Mono fallback

## 드리프트 체크포인트

문서↔코드 정합 검증 시:

- [ ] Design.md 팔레트 hex ↔ `globals.css` oklch 변수 대응 유지
- [ ] `gradient-brand` 사용처 = 위 목록 (신규 남발 없음)
- [ ] 카테고리 색은 `lib/categoryColor.ts` 경유 (컴포넌트 하드코딩 금지)
