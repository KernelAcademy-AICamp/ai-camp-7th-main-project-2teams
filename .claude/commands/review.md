---
description: "현재 diff에 code-reviewer + security-auditor를 실행"
allowed-tools: ["Bash(git diff:*)", "Bash(git status:*)"]
---

# /review

현재 변경사항(staged 우선, 없으면 working tree)에 두 에이전트를 병렬 dispatch한다.

## 프로세스

1. `git status` + `git diff` 로 변경 범위 확인
2. 병렬 dispatch:
   - `security-auditor` — 보안 3종 + Route 패턴 (BLOCK 가능)
   - `code-reviewer` — 품질 리뷰 (한국어)
3. 결과 통합 보고
   - security가 BLOCK이면 최상단에 🚨 강조 + 커밋 보류 권고

## 규칙

- security-auditor BLOCK 시 커밋 전 반드시 수정
- 변경 없으면 안내 후 종료
