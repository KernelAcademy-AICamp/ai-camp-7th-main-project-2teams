# 개발 자동화 인프라 설계

**대상**: 북마크 AI 관리 서비스 개발팀
**연계**: `docs/specs/dev-flow.md` (브랜치/주차 시나리오) 위에 얹는 자동화 계층

---

## 1. 개요

6주 MVP(태스크 A1~A31)를 Claude Code 자동화로 가속한다. 핵심 목표:

- **반복 제거**: 브랜치 생성→구현→리뷰→커밋→PR 루프를 오케스트레이터로 자동화
- **품질 게이트**: 보안 3종 + 린트를 로컬 hook + CI 이중으로 강제
- **단일 소스**: Taskmaster를 태스크 소스로, `docs/specs/*`를 패턴 소스로 통일

### 기존 자산 (재사용)

| 자산 | 위치 | 비고 |
|------|------|------|
| `/git:commit`, `/git:pr` | `.claude/commands/git/` | Conventional Commits 한국어 |
| `code-reviewer-kr` | 상위 워크스페이스 `.claude/agents/` | 프로젝트로 승격 예정 |
| Discord 알림 hook | 상위 `.claude/hooks/` | Stop 이벤트 유지 |
| Taskmaster | `.taskmaster/`, `front/tasks.json`, `extension/tasks.json` | A1~A31 보유 |
| Supabase MCP | `.mcp.json` | DB 조작 |

---

## 2. 에이전트 (subagents)

기존 자산 재사용 + 프로젝트 특화만 신규. 빌더는 1개로 통합(과설계 방지).

| 에이전트 | 신규/재사용 | 역할 | 트리거 |
|----------|-------------|------|--------|
| `feature-builder` | 신규 | Taskmaster 태스크 1개 구현 + 테스트 동시 작성. 해당 spec 문서 읽고 패턴 준수 | 오케스트레이터 dispatch |
| `code-reviewer` | 재사용(승격) | diff 품질 리뷰(한국어, CLAUDE.md 표준) | dispatch / `/review` |
| `security-auditor` | 신규 ★핵심 | 보안 3종 + RLS + Zod 검증 검사. 위반 차단 | dispatch / hook / CI |
| `spec-guardian` | 신규(중) | 코드 ↔ docs/specs 정합성 검사 | `/spec-sync` |

### security-auditor 체크리스트

CLAUDE.md 보안 제약을 코드 레벨로 검증:

- [ ] `SERVICE_ROLE_KEY` / `OPENAI_API_KEY`에 `NEXT_PUBLIC_` 접두어 없음 + 클라이언트 번들 미유입
- [ ] API 응답 객체에 `embedding` 컬럼 미포함 (`match_bookmarks` RPC, GET /api/bookmarks)
- [ ] `content` DB 컬럼 없음 + 로그 출력 시 마스킹 (A8)
- [ ] Route Handler: `withAuth` HOF + Zod `safeParse` + RLS 정책 존재

### spec-guardian 검사 항목

- DB DDL ↔ `database.md` (컬럼, RLS, RPC 시그니처)
- Zod 스키마 ↔ `nextjs-supabase.md` (`bookmarkSchema`, `searchSchema` 등)
- 디렉토리 구조 ↔ spec 문서 + 태스크 ID(A-id) 매핑

---

## 3. 오케스트레이터 (Taskmaster 기반)

`/dev-task` 스킬 = 진입점. Taskmaster MCP + 서브에이전트 조율(별도 orchestrator 에이전트 불필요).

```
1. taskmaster next_task            → 다음 태스크(A-id) 획득
2. set_task_status in_progress
3. git checkout -b feature/<id>-<slug>   (develop 기준)
4. dispatch feature-builder        → 태스크 + 관련 spec 참조 전달 (코드 + 테스트 작성)
4.5 vitest run                     ← 테스트 게이트
     └ 실패 → step 4 재진입 (테스트 로그 전달)
5. dispatch 병렬:
     ├── security-auditor          (생성 diff 대상)
     └── code-reviewer
6. 리뷰 통과 → /git:commit → /git:pr   (develop 타겟)
7. set_task_status done
8. 결과 리포트                      (실패 시 step 4 재진입)
```

> Taskmaster 태스크 = 단일 소스. `front/tasks.json`/`extension/tasks.json`이 A1~A31 보유.
> 테스트 대상·기준은 `docs/specs/testing.md` 참조.

---

## 4. 스킬 카탈로그

| 스킬 | 신규/기존 | 용도 |
|------|-----------|------|
| `/git:commit` | 기존 | Conventional Commits 한국어 |
| `/git:pr` | 기존 | PR 생성 |
| `/dev-task` | 신규 | 오케스트레이터 진입점(§3 흐름) |
| `/new-feature` | 신규 | 이슈+브랜치+Taskmaster status (수동 경로) |
| `/review` | 신규 | 현재 diff에 code-reviewer + security-auditor 실행 |
| `/api-route` | 신규 | Route Handler 스캐폴드(withAuth+Zod+supabase) |
| `/spec-sync` | 신규 | spec-guardian 래핑, 문서↔코드 정합 검사 |
| `/e2e` | 신규 | Playwright MCP로 `docs/specs/e2e/*.md` 시나리오 구동 |

---

## 5. Hooks (로컬 + CI 이중)

### 로컬 — Claude Code hooks (`.claude/settings.json`)

| 이벤트 | matcher | 동작 |
|--------|---------|------|
| PreToolUse | `Bash(git commit:*)` | `npm run lint` + `vitest related --run`(변경 파일 관련만, 수초), 실패 시 차단 — git-rules 준수 |
| PreToolUse | `Edit\|Write` | secret-scan: `NEXT_PUBLIC_`+(`SERVICE_ROLE`\|`OPENAI_API_KEY`) 또는 content 로깅 패턴 차단 |
| PreToolUse | `Bash(git push:*)` | security-auditor 퀵체크 + lint, 위반 차단 |
| Stop | — | 기존 Discord 알림 유지 |

### CI — GitHub Actions

| 워크플로 | 트리거 | 동작 |
|----------|--------|------|
| `.github/workflows/claude-review.yml` | `pull_request` | Claude Code Action이 code-reviewer + security-auditor 기준 리뷰 코멘트. `ANTHROPIC_API_KEY` secret 필요 |
| `.github/workflows/ci.yml` | `pull_request` | lint + typecheck + `vitest run --coverage` + build 게이트(비-Claude) |
| E2E (`/e2e` 스킬) | PR preview 배포 후 | Playwright MCP로 핵심 플로우 시나리오 구동. preview URL 대상 |

### 보안 3종 × 3계층 매핑

| 보안 제약 | security-auditor | 로컬 hook | CI |
|-----------|:---:|:---:|:---:|
| 키 노출 금지 | ✓ | ✓ (Edit/Write) | ✓ |
| embedding 응답 금지 | ✓ | — | ✓ |
| content 저장·로그 금지 | ✓ | ✓ (Edit/Write) | ✓ |

---

## 6. 공유 규칙 출처

중복 정의 제거 — 에이전트·스킬·hook이 단일 파일 참조:

| 규칙 파일 | 내용 | 참조처 |
|-----------|------|--------|
| `.claude/rules/git.md` | 브랜치·커밋·PR (기존) | /git:*, /dev-task |
| `.claude/rules/security.md` | 보안 3종 체크리스트 (신규) | security-auditor, hooks, CI |
| `.claude/rules/api-patterns.md` | Route Handler·MV3 메시지 패턴 (신규) | feature-builder, /api-route |

---

## 7. 추가 인프라

- **CI 파이프라인**: lint/typecheck/build — PR 머지 게이트 (`ci.yml`)
- **secret-scanning hook**: 키 유출 사전 차단 (§5 Edit/Write hook)
- **PR/이슈 템플릿**: `.github/PULL_REQUEST_TEMPLATE.md`(git.md PR 형식), `.github/ISSUE_TEMPLATE/`
- **브랜치 보호**: main은 PR필수+잠금(직접 push 시 bypass 경고). develop 규칙 명문화
- **테스트 (Vitest + MSW + Playwright MCP)**: 유닛/통합(`*.test.ts`) + E2E(시나리오 MD). 5지점 게이트(빌더→commit hook→오케스트레이터→CI→E2E). 상세 `docs/specs/testing.md`

---

## 8. 구현 우선순위

```
1순위 (안전망): security-auditor 에이전트 + lint hook + secret-scan hook
                → 이후 모든 작업이 게이트 통과
2순위 (가속):   Vitest 셋업 + /dev-task 오케스트레이터 + feature-builder
                → 태스크 자동 처리 루프(테스트 게이트 포함) 가동
3순위 (협업):   CI(ci.yml + claude-review.yml) + PR/이슈 템플릿
                → 팀 PR 흐름 표준화
4순위 (정합):   spec-guardian + /spec-sync
                → 문서↔코드 드리프트 방지
```
