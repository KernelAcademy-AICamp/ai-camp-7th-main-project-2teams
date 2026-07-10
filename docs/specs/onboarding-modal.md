# 온보딩 모달 설계 스펙

**버전**: v0.1 (v1.1 예정)
**날짜**: 2026-06-26  
**관련 태스크**: A26(v1.1)

> **v1.1 예정 스펙.** MVP는 별도 온보딩 페이지(`/onboarding`)로 대체. 이 문서는 v1.1 Modal Wizard 설계 스펙.

---

## 개요

로그인 후 공통 레이아웃에서 트리거되는 5-step Modal Wizard. 신규 가입 유저에게 서비스 핵심 기능을 단계별로 안내한다.

---

## UI 패턴

**Modal Wizard** 채택.

| 패턴 | 이유 |
|------|------|
| Modal Wizard (채택) | 라이브러리 추가 없음. 레이아웃 미완성 상태에서도 구현 가능. `useState` 하나로 동작. |
| Spotlight Tour | intro.js 등 외부 라이브러리 필요. 레이아웃 완성 후에야 붙일 수 있음. v1.1 이후 고려. |
| Tooltip Tour | UI 앵커 좌표에 의존. 반응형 대응 복잡. |

---

## 노출 조건

- 최초 로그인 유저에게만 노출
- 한 번 완료(또는 건너뛰기) 후 재노출 없음

### 상태 저장 방식

**MVP**: `localStorage` 키 `onboarding_done_{userId}`

```ts
// usehooks-ts의 useLocalStorage 사용 (이미 설치된 라이브러리)
const [done, setDone] = useLocalStorage(`onboarding_done_${userId}`, false)
```

**v1.1 이후**: Supabase `user_metadata` 로 마이그레이션 (기기 간 동기화 필요 시)

```ts
// 완료 시
await supabase.auth.updateUser({ data: { onboarding_completed: true } })

// 체크 시
const { data: { user } } = await supabase.auth.getUser()
const done = user?.user_metadata?.onboarding_completed
```

---

## 스텝 구성 (5단계)

> **v0.1 → v0.2 변경**: 기존 스텝 2·3이 모두 익스텐션 전제였음(설치 안 한 유저는 스텝 3에서 안내가 붕 뜸). `ServiceFeatures` 컴포넌트가 이미 채택한 **웹/익스텐션 2트랙 탭** 패턴을 그대로 재사용해 스텝 2를 "저장 방법 선택"으로 통합 — 설치 없이 웹에서 바로 쓰는 경로를 기본값(첫 탭)으로 노출하고, 익스텐션은 "더 빠른 대안"으로 격하.

| 스텝 | 제목 | 내용 | 에셋 | CTA |
|------|------|------|------|-----|
| 1 | 환영합니다 | "저장한 북마크를 AI가 자동으로 정리합니다" | 서비스 일러스트 or 데모 GIF | 다음 → |
| 2 | 저장 방법 선택 | 웹/익스텐션 탭(`ServiceFeatures` 트랙 재사용). **웹 탭(기본)**: "설치 없이, 링크만 붙여넣으면 바로 저장됩니다." **익스텐션 탭**: "Chrome 익스텐션을 설치하면 어느 페이지에서든 클릭 한 번, `Cmd+Shift+S`로 저장할 수 있습니다." | 웹 탭: URL 붙여넣기 인풋 스크린샷 · 익스텐션 탭: 설치 화면 스크린샷 | 웹 탭: 다음 → / 익스텐션 탭: [설치하기 (새 탭)] + 다음 → |
| 3 | 저장하면 이렇게 | "저장과 동시에 AI가 제목·태그·카테고리를 자동으로 채워줍니다." (선택한 트랙과 무관하게 공통 데모) | AI 자동 태깅 리빌 GIF | 다음 → |
| 4 | 자연어 검색 | "검색창에 '리액트 훅 정리', '디자인 참고할 사이트' 처럼 자연어로 입력하면 관련 북마크를 찾아줍니다." | 검색 시연 GIF | 다음 → |
| 5 | 시작하기 | "준비됐어요! 첫 번째 북마크를 저장해보세요." | 없음 | [첫 북마크 저장하기] + [나중에 하기] |

> 스텝 5의 [첫 북마크 저장하기] 클릭 시 → 모달 닫기 + 헤더 "북마크 추가" 모달 자동 오픈
> 스텝 2에서 고른 트랙은 스텝 3 데모 카피에 영향 안 줌 — AI 자동 태깅은 저장 경로(웹/익스텐션) 무관하게 동일 동작이라 분기 불필요.

---

## UX 규칙

| 규칙 | 이유 |
|------|------|
| 건너뛰기 버튼 항상 우상단 노출 | 강제 온보딩은 이탈 유발 |
| ESC / 배경 클릭 → 닫힘 (완료 처리) | 기본 Dialog 동작과 일치 |
| 익스텐션 설치 버튼은 `target="_blank"` | 모달 유지 상태로 새 탭 열기 |
| 익스텐션 설치 확인 로직 없음 | 설치 여부 체크 복잡, UX 방해 |
| 하단 점(dot indicator) 표시 | 전체 단계 수 인지 → 이탈 감소 |
| 이전 버튼 스텝 1에서 숨김 | 불필요한 UI 제거 |

---

## 컴포넌트 구조

```
OnboardingModal          # 노출 제어 + 스텝 상태 관리
└── OnboardingStep       # 개별 스텝 콘텐츠 렌더
└── OnboardingProgress   # 하단 dot indicator
└── OnboardingActions    # 이전/다음/완료/건너뛰기 버튼
```

### 파일 위치

```
front/
├── components/
│   └── onboarding/
│       ├── OnboardingModal.tsx     # 진입점, 노출 제어
│       ├── OnboardingStep.tsx      # 스텝 콘텐츠
│       └── steps.ts                # STEPS 배열 정의 (타입 + 데이터)
└── public/
    └── onboarding/
        ├── step1.gif               # 또는 .png
        ├── step2.png
        ├── step3.gif
        └── step4.gif
```

### 핵심 인터페이스

```ts
// steps.ts
interface OnboardingStep {
  title: string
  description: string
  image?: string          // public/onboarding/ 경로
  cta?: {
    label: string
    href: string          // 외부 링크 (설치 등)
  }
  primaryAction?: 'open-add-modal'  // 스텝 5 전용
  // 스텝 2 전용 — ServiceFeatures의 TrackKey('web' | 'ext')를 그대로 재사용해
  // description/image/cta를 트랙별로 오버라이드. 없으면 위 필드 그대로 사용.
  tracks?: Record<'web' | 'ext', Pick<OnboardingStep, 'description' | 'image' | 'cta'>>
}

const STEPS: OnboardingStep[] = [ ... ]
```

### 마운트 위치

```tsx
// front/app/(dashboard)/layout.tsx 또는 page.tsx
// 서버 컴포넌트에서 userId 추출 후 전달
<OnboardingModal userId={user.id} />
```

---

## 스케치 (ASCII)

```
┌─────────────────────────────────────────┐
│                          [건너뛰기 ✕]   │
│                                         │
│         [GIF / 이미지 영역]             │
│                                         │
│  제목                                   │
│  설명 텍스트 2~3줄                      │
│                                         │
│  ● ○ ○ ○ ○        [이전]  [다음 →]    │
└─────────────────────────────────────────┘

스텝 5 (마지막):
┌─────────────────────────────────────────┐
│                          [건너뛰기 ✕]   │
│                                         │
│              🎉                         │
│                                         │
│  시작하기                               │
│  준비됐어요! 첫 번째 북마크를           │
│  저장해보세요.                          │
│                                         │
│  ● ● ● ● ●   [이전]  [첫 북마크 저장] │
│               [나중에 하기]             │
└─────────────────────────────────────────┘
```

---

## 미결 사항

| 항목 | 결정 필요 |
|------|-----------|
| 에셋 형태 | GIF vs Lottie vs 정적 이미지 |
| 모바일 대응 | 모달 풀스크린 처리 여부 (MVP는 데스크탑 전용) |
| 상태 저장 | localStorage(MVP) vs user_metadata(v1.1) 전환 시점 |
| 재노출 트리거 | 명시적 "다시 보기" 기능 필요 여부 (설정 페이지 연동) |

---

_작성: 2026-06-26_
