# Git 규칙

## 브랜치 전략

- **보호 브랜치**: `main`, `develop` — 직접 push·삭제 금지 (Claude Code 포함)
- **feature 브랜치 기준**: 반드시 `develop`에서 분기
  ```
  git checkout develop && git pull
  git checkout -b feature/<이슈번호>-<기능명>
  ```
- **PR 흐름**: `feature/*` → `develop` → `main`
  - `main`에 PR 가능한 브랜치: `develop` 전용 (다른 브랜치 직접 PR 금지)
  - `develop`에 PR 가능한 브랜치: `feature/*`, `fix/*`, `chore/*`, `docs/*`
- 브랜치명: `<타입>/<이슈번호>-<기능명>` (이슈 없으면 번호 생략)
  - `feature/42-bookmark-tagging`
  - `fix/57-token-expiry`
  - `docs/readme-setup`

## 커밋 메시지 형식 (Conventional Commits)

형식: `<타입>(<스코프>): <한국어 설명>`

타입:

- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서화
- `style`: 포맷팅 (코드 동작 무관)
- `refactor`: 리팩토링
- `perf`: 성능 개선
- `test`: 테스트
- `chore`: 빌드/설정

규칙:

- 설명은 한국어, 명령형 ("추가" not "추가됨")
- 첫 줄 72자 미만
- 스코프는 해당할 때만 사용
- 원자적 커밋 — 단일 목적

예시:

```
feat(extension): 북마크 자동 태깅 추가
fix(api): 토큰 만료 처리 수정
docs: README 실행 방법 작성
```

## PR 규칙

- 제목: Conventional Commits 형식 (`feat: 설명`)
- 최소 1명 리뷰 승인 필수
- 머지 전 브랜치 최신화 (`git rebase develop`)
- 머지 전략: **Squash and merge** (히스토리 정리)
- 이슈 연결 필수: PR 본문에 `Closes #이슈번호`

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
```
