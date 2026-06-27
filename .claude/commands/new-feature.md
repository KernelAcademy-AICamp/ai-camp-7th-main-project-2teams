---
description: "이슈 + 브랜치 + Taskmaster 상태를 한 번에 세팅하는 수동 진입점"
allowed-tools: ["Bash(git checkout:*)", "Bash(git pull:*)", "Bash(git branch:*)", "Bash(gh issue create:*)", "Bash(gh issue list:*)"]
---

# /new-feature

수동 개발 시작 경로 (오케스트레이터 없이). 인자: 태스크 ID 또는 기능 설명.

## 프로세스

1. 태스크 ID 주어지면 Taskmaster `get_task`로 제목/설명 확인
2. GitHub 이슈 생성
   - 제목: `[A-id] 태스크 제목`
   - 라벨: 구분(feature/fix/...) + 우선순위
3. develop 최신화 후 브랜치 생성
   - `git checkout develop && git pull origin develop`
   - `git checkout -b feature/<이슈번호>-<slug>`
4. Taskmaster `set_task_status in_progress`
5. 다음 단계 안내 (구현 → /review → /git:commit → /git:pr)

## 규칙

- 브랜치명: `<타입>/<이슈번호>-<기능명>` (`.claude/rules/git.md`)
- main 직접 작업 금지
