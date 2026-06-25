---
description: "Conventional Commits 형식 + 한국어로 커밋 생성"
allowed-tools: ["Bash(git add:*)", "Bash(git status:*)", "Bash(git commit:*)", "Bash(git diff:*)", "Bash(git log:*)"]
---

# /git:commit

## 프로세스

1. `git status` 확인 — 스테이지된 파일 있으면 해당 파일만 커밋
2. `git diff --staged` 분석
3. 변경사항이 여러 관심사이면 분할 제안
4. Conventional Commits 형식 + 한국어 설명으로 커밋 생성

## 커밋 형식

`<타입>(<스코프>): <한국어 설명>`

타입: feat | fix | docs | style | refactor | perf | test | chore  
스코프: 해당할 때만  
설명: 한국어, 명령형, 72자 미만

## 주의사항

- 커밋에 Claude 서명 절대 추가하지 않음
- 원자적 커밋 (단일 목적)
- 관련 없는 변경사항 분할 제안
