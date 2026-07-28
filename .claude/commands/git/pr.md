---
description: "현재 브랜치 기준 PR 제목/본문 생성 및 PR 오픈"
allowed-tools: ["Bash(git log:*)", "Bash(git diff:*)", "Bash(git branch:*)", "Bash(gh pr create:*)", "Bash(gh pr view:*)", "Bash(gh issue list:*)"]
---

# /git:pr

## 프로세스

1. 현재 브랜치명에서 이슈 번호 추출 (있으면)
2. `git log main..HEAD` 로 커밋 목록 확인
3. `git diff main...HEAD` 로 변경사항 분석
4. PR 생성 전 내용 확인 메시지 표시
5. `gh pr create` 로 PR 오픈

## PR 제목

Conventional Commits 형식: `<타입>(<스코프>): <한국어 설명>`

## PR 본문 형식

```markdown
## 변경사항
- 항목 1
- 항목 2

## 관련 이슈
Closes #이슈번호

## 테스트 방법
- [ ] 항목 1
- [ ] 항목 2

## 스크린샷 (UI 변경 시)
<!-- 변경 전/후 스크린샷 -->
```

## 주의사항

- 이슈 번호는 브랜치명(`feature/42-기능명`)에서 자동 추출
- 이슈 없으면 "관련 이슈" 섹션 생략
- UI 변경 없으면 "스크린샷" 섹션 생략
- gh CLI 설치 필요 (`brew install gh`)
- Create a merge commit 전략 사용 → PR 커밋이 그대로 남으므로 커밋 메시지 하나하나가 이력에 노출됨
- 머지 후 브랜치는 수동 삭제 (리포 자동 삭제 꺼짐)
