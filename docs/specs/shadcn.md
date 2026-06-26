# shadcn/ui 스펙

**관련 태스크**: A4, A9, A10, A11, A16

---

## 핵심 개념

shadcn/ui는 패키지 설치가 아님 — CLI가 컴포넌트 소스를 프로젝트에 직접 복사. 소유권 완전히 보유, 자유 수정 가능.

---

## 설치

```bash
# -d 필수 (non-interactive, 대화형 프롬프트 생략)
npx shadcn@latest init -d
```

> `-y`/`--yes`는 라이브러리 선택 프롬프트를 생략하지 않음 — 반드시 `-d` 사용.

---

## components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

## Tailwind v4 init 후 필수 수정

`shadcn init` 실행 후 `globals.css`의 폰트 선언이 순환 참조로 깨짐. 반드시 수정:

```css
/* app/globals.css — @theme inline 내 */

/* 수정 전 (broken) */
--font-sans: var(--font-sans);

/* 수정 후 (literal 이름) */
--font-sans: "Pretendard", "Geist", ui-sans-serif, system-ui, sans-serif;
--font-mono: "Geist Mono", ui-monospace, monospace;
```

`layout.tsx`에서 폰트 variable을 `<body>` → `<html>`로 이동:

```tsx
// app/layout.tsx
<html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
  <body className="antialiased">
    {children}
  </body>
</html>
```

---

## UI 컴포넌트 생성 규칙

```
1. shadcn에 있는지 먼저 확인
   → npx shadcn@latest search <name>
   → npx shadcn@latest docs <name>   (코드 예시 포함 확인)

2. 있으면 → npx shadcn@latest add <name>

3. 없으면 → components/ui/<name>.tsx 직접 생성
```

**shadcn 컴포넌트를 직접 수정해야 할 경우**: `components/ui/` 내 소스 직접 편집 (소유권 보유).

---

## 프로젝트 컴포넌트 매핑

| 화면 / 기능 | shadcn 컴포넌트 | 커스텀 필요 |
|---|---|---|
| 로그인·회원가입 (A4) | `Card` + `Input` + `Button` + `Label` + `Alert` | 체크박스 2개 동의 |
| 북마크 목록 (A9) | `Card` + `Badge` + `Skeleton` | — |
| 자연어 검색 (A10) | `Command` + `Dialog` | debounce 훅 |
| 사이드바 필터 (A11) | `Sheet` (모바일) + `Select` + `Badge` | — |
| 탈퇴 확인 (A16) | `AlertDialog` | — |
| 저장 완료 토스트 | `Sonner` (`toast`) | — |
| 로딩 상태 | `Skeleton` | — |
| 태그 표시 | `Badge` | — |
| 카테고리 드롭다운 | `DropdownMenu` | — |
| 툴팁 | `Tooltip` + `TooltipProvider` | — |

> 파괴적 작업 확인 다이얼로그는 `Dialog` 대신 `AlertDialog` 사용.

---

## 컴포넌트 설치 명령어

```bash
# 한 번에 여러 개 설치
npx shadcn@latest add card badge skeleton input button label alert
npx shadcn@latest add command dialog sheet select dropdown-menu
npx shadcn@latest add alert-dialog tooltip sonner
```

---

## TooltipProvider 루트 설정

```tsx
// app/layout.tsx
import { TooltipProvider } from '@/components/ui/tooltip'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${geistSans.variable}`}>
      <body className="antialiased">
        <Providers>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  )
}
```

---

## 컴포넌트 확장 패턴

shadcn 컴포넌트 소스 직접 편집:

```tsx
// components/ui/badge.tsx — 카테고리별 색상 variant 추가
const badgeVariants = cva('...기존...', {
  variants: {
    variant: {
      default: '...',
      // 북마크 카테고리 variant 추가
      개발: 'bg-blue-100 text-blue-800',
      디자인: 'bg-purple-100 text-purple-800',
      비즈니스: 'bg-green-100 text-green-800',
    },
  },
})
```

---

## 테마 토큰 (globals.css)

```css
@theme inline {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.145 0 0);
  --color-primary: oklch(0.488 0.243 264.376);   /* 브랜드 컬러 */
  --color-primary-foreground: oklch(0.985 0 0);
  --color-muted: oklch(0.961 0 0);
  --color-muted-foreground: oklch(0.556 0 0);
  --color-border: oklch(0.922 0 0);
  --radius: 0.625rem;
}
```

---

## lucide-react 아이콘 (v1.21.0)

shadcn 기본 아이콘 라이브러리. `h-4 w-4` 기본 사이즈 고정.

```tsx
import { Bookmark, Search, Tag, Trash2, LogOut, Settings } from 'lucide-react'

// 기본 사용
<Search className="h-4 w-4" />

// 버튼 내부
<Button>
  <Bookmark className="h-4 w-4 mr-2" />
  저장
</Button>
```

| 아이콘 | 용도 |
|---|---|
| `Bookmark` | 북마크 저장 버튼 |
| `Search` | 검색창 |
| `Tag` | 태그 표시 |
| `Trash2` | 삭제 |
| `LogOut` | 로그아웃 |
| `Settings` | 설정 |
| `Loader2` | 로딩 스피너 (`animate-spin`) |
| `X` | 모달 닫기, 태그 삭제 |
| `ChevronDown` | 드롭다운 |
| `Check` | 완료 상태 |

```tsx
// 로딩 스피너 패턴
<Loader2 className="h-4 w-4 animate-spin" />
```

---

## 참고

- 컴포넌트 목록: https://ui.shadcn.com/docs/components
- CLI 문서: https://ui.shadcn.com/docs/cli
- 컴포넌트 소스: `components/ui/` 디렉토리 직접 확인
