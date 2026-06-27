---
description: "Taskmaster 다음 태스크 1개를 브랜치→구현→테스트→리뷰→PR까지 자동 처리하는 오케스트레이터"
---

# /dev-task

Taskmaster 태스크 1개를 end-to-end 처리한다. MCP + 서브에이전트 조율 (별도 orchestrator 에이전트 없음).

## 흐름

```
1. taskmaster next_task              → 다음 태스크(A-id) 획득 (인자로 ID 지정 시 get_task)
2. set_task_status in_progress
3. git checkout develop && git pull → git checkout -b feature/<id>-<slug>
4. dispatch feature-builder          → 태스크 + 관련 docs/specs 경로 전달 (코드 + 테스트)
5. 테스트 게이트 (가드)
     - 패키지 package.json 있으면: vitest related --run
       └ 실패 → step 4 재dispatch (테스트 로그 전달)
     - 없으면(미스캐폴드): skip, "vitest 미실행" 기록
6. dispatch 병렬:
     ├── security-auditor  (생성 diff 대상, BLOCK이면 step 4 복귀)
     └── code-reviewer
7. 리뷰 통과 → /git:commit → /git:pr  (develop 타겟)
8. set_task_status done
9. 결과 리포트
```

## 규칙

- 태스크 소스 = Taskmaster (`front/tasks.json`/`extension/tasks.json`). 임의 태스크 생성 금지.
- 브랜치는 항상 develop 기준 (`.claude/rules/git.md`)
- security-auditor BLOCK 시 commit/PR 진행 금지
- 한 번에 태스크 1개. 완료 후 종료 — 다음 태스크는 재실행.
