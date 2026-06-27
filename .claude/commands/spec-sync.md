---
description: "spec-guardian로 코드↔docs/specs 정합성 검사"
allowed-tools: ["Bash(git diff:*)", "Bash(git status:*)"]
---

# /spec-sync

`spec-guardian` 에이전트를 dispatch해 코드와 명세 문서 드리프트를 검사한다.

## 프로세스

1. 검사 범위 결정 (인자 없으면 전체, 있으면 해당 영역)
2. `spec-guardian` dispatch
   - DB DDL ↔ `database.md`
   - Zod/인터페이스 ↔ `nextjs-supabase.md`
   - 디렉토리/A-id ↔ `tasks/README.md`
3. 드리프트 보고 (수정 방향은 사용자 결정 — 자동 수정 안 함)

## 규칙

- front 미스캐폴드면 문서 간 정합 + 태스크 매핑만 검사
- 어느 쪽이 옳은지 단정하지 않고 차이만 제시
