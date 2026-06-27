# 개발 플로우 가이드

**대상**: 북마크 AI 관리 서비스 개발팀  
**기준**: `.claude/rules/git.md` + 6주 MVP 일정

---

## 브랜치 구조

```
main          ← 배포용 (직접 push 금지)
develop       ← 통합 브랜치 (PR 머지 대상)
  ├── feature/<이슈번호>-<기능명>
  ├── fix/<이슈번호>-<내용>
  ├── docs/<내용>
  └── chore/<내용>
```

> `develop` → `main` PR은 배포 시점(Week 6)에 한 번.

---

## 태스크 1개 기준 플로우

```
1. GitHub Issues 생성
   제목: [A5] POST /api/bookmarks — 저장 + AI 태깅 + 임베딩
   라벨: feature / high

2. 브랜치 생성 (develop 기준)
   git checkout develop && git pull origin develop
   git checkout -b feature/5-bookmark-save-api

3. 개발 → 원자적 커밋
   git commit -m "feat(api): 북마크 저장 + GPT 태깅 + 임베딩 구현"

4. PR 생성 → develop 타겟
   제목: feat(api): 북마크 저장 API 구현
   본문 템플릿:
     ## 변경사항
     - ...
     ## 관련 이슈
     Closes #<이슈번호>
     ## 테스트 방법
     - [ ] ...

5. 코드 리뷰 (최소 1명 승인 필수)

6. Squash and merge → develop

7. 브랜치 삭제
```

---

## 주차별 병렬 개발 시나리오

### Week 1 — 인프라

| 담당 | 태스크 | 브랜치 예시 |
|------|--------|-------------|
| W (웹앱) | A1 DB 스키마, A2 Next.js 셋업, A3 withAuth | `chore/1-db-schema`, `chore/2-nextjs-setup` |
| E (익스텐션) | A17 Manifest V3, A18 Supabase Auth | `chore/17-mv3-setup`, `feature/18-extension-auth` |

### Week 2 — 핵심 API

```
develop
├─ W: feature/5-bookmark-save-api      (A5)  ─┐
├─ W: feature/6-bookmark-list-api      (A6)  ─┤ 병렬
├─ W: feature/7-search-api             (A7)  ─┤
├─ W: feature/27-favorite-toggle       (A27) ─┤
├─ W: feature/29-import-api            (A29) ─┘
│
├─ E: feature/20-tab-content           (A20) ─┐ 병렬
└─ E: feature/19-extension-login       (A19) ─┘
```

> UI 태스크(A9~A11)는 A5, A6 develop 머지 확인 후 시작.

### Week 3 — 컴플라이언스

| 담당 | 태스크 |
|------|--------|
| W | A8 본문 미저장 보장, A12 /privacy, A13 /terms |
| E | A23 최소 권한 검증, A25 Privacy Practices |

> ⚠️ A8은 A5 완료 즉시 착수. 본문 로그 마스킹 누락 시 배포 불가.

### Week 4 — 웹앱 UI

| 담당 | 태스크 |
|------|--------|
| W | A4 OAuth 로그인, A26 온보딩 페이지, A9 목록 홈, A10 검색 UI, A11 사이드바 |
| E | A21 북마크 저장 요청, A22 토스트 + 태그 미리보기 |

### Week 5 — UI 완성

| 담당 | 태스크 |
|------|--------|
| W | A28 즐겨찾기 UI, A30 파일 임포트 UI, A31 내 폴더 탭, A14 탈퇴 API, A16 탈퇴 UI |
| E | A24 로컬 데이터 파기 |

### Week 6 — QA + 배포

| 담당 | 작업 |
|------|------|
| W | A15 개인정보 열람 API, 통합 테스트, Vercel 배포 |
| E | 웹스토어 심사 제출 |
| 전체 | develop → main PR + v1.0.0 릴리즈 태그 |

---

## 크리티컬 패스

```
A1 → A3 → A5 → A8         ← 본문 미저장 보장 (법적 필수, Week 3 완료)
A3 → A6 → A11             ← 사이드바 필터 동작
A17 → A18 → A21 → A22     ← 익스텐션 핵심 흐름
A29 → A30 → A31           ← 파일 임포트 + 내 폴더
A4 → A26 → A9             ← 웹앱 진입 플로우
```

**병목**: A5가 Week 2 내 완료 안 되면 Week 4~5 UI 전체 블로킹.

---

## 충돌 방지 규칙

| 상황 | 대응 |
|------|------|
| 같은 파일 동시 작업 | 사전 담당 분리 (`front/` vs `extension/`) |
| develop 뒤처진 브랜치 | PR 전 `git rebase develop` 필수 |
| 긴급 수정 | `fix/<이슈>-<내용>` → PR → 즉시 머지 |
| API 계약 변경 | Bookmark 인터페이스 수정 전 팀 공유 필수 |

---

## 커밋 타입 → 브랜치 타입 매핑

| 작업 | 브랜치 접두사 | 커밋 타입 |
|------|--------------|-----------|
| 새 기능 | `feature/` | `feat` |
| 버그 수정 | `fix/` | `fix` |
| 문서 | `docs/` | `docs` |
| 설정/인프라 | `chore/` | `chore` |
| 리팩토링 | `refactor/` | `refactor` |
| 테스트 | `test/` | `test` |

---

## develop → main 배포 플로우

```
1. develop QA 통과 확인
2. PR: develop → main
   제목: chore: MVP v1.0 배포
3. Squash and merge
4. GitHub Release 태그: v1.0.0
5. Vercel 자동 배포 (main 연동)
6. 익스텐션 웹스토어 수동 제출
```

---

## 환경별 URL

| 환경 | URL | 트리거 |
|------|-----|--------|
| Preview | Vercel Preview URL | PR 생성 시 자동 |
| Production | 도메인 (TBD) | main 머지 시 자동 |
