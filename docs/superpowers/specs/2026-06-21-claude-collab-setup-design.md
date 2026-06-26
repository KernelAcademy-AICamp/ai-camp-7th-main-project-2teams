# 스펙: AI Camp 2팀 `.claude` 협업 초기 세팅

**날짜:** 2026-06-21

---

## Context

AI Camp 7기 2팀 GitHub 저장소 협업 초기 세팅.  
2~3명 소규모 팀, 기술 스택 미정.  
목표: Claude Code 사용 시 일관된 Git 워크플로우 자동화.

---

## 생성 파일 구조

```
.claude/
├── rules/
│   └── git.md          # 자동 로드 — 항상 따르는 Git 규칙
└── commands/
    └── git/
        ├── commit.md   # /git:commit 슬래시 커맨드
        └── pr.md       # /git:pr 슬래시 커맨드
```

---

## rules/git.md

- 브랜치 전략: main 직접 push 금지, feature/fix/docs 네이밍
- 커밋: Conventional Commits + 한국어 설명
- PR: 최소 1명 리뷰 필수

## commands/git/commit.md (`/git:commit`)

- diff 분석 → Conventional 형식 + 한국어 커밋 자동 생성
- 여러 관심사 섞이면 분할 제안

## commands/git/pr.md (`/git:pr`)

- 브랜치 커밋 요약 → PR 제목/본문 한국어 자동 생성
- `gh pr create` 로 PR 오픈

---

## 검증

1. "커밋해줘" → Conventional 형식 한국어 커밋 생성 확인
2. `/git:commit` 실행 → diff 분석 후 커밋 확인
3. feature 브랜치에서 `/git:pr` → PR 생성 확인

---

## 제외 (스택 확정 후 추가)

- `.gitignore`
- `CONTRIBUTING.md`
- CI/CD 설정
