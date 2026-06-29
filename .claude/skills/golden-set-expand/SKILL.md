---
name: golden-set-expand
description: 태그 분류 골든셋(front/eval/tag-golden.json)을 안전하게 확장한다. 골든셋·평가셋·held-out 정답 데이터를 늘리거나, 태그 정확도 측정 표본을 키우거나, 특정 대분류(커뮤니티·게임 등) 커버리지를 보강할 때 반드시 사용. few-shot 예제와 겹쳐 평가가 부풀려지는 leak, 대분류 2개 같은 정책 위반, vocab 불일치, URL 중복을 코드로 막는다. "골든셋 늘려줘", "평가 표본 추가", "held-out 케이스 보강", "tag-golden 확장" 같은 요청에 발동.
---

# 골든셋 확장

`front/eval/tag-golden.json`은 태그 분류 회귀 게이트(`RUN_TAG_EVAL=1`)의 정답 데이터다. 표본이 작으면(n) 측정 신뢰구간이 넓어 F1 점추정이 거짓 안심을 준다. 표본을 늘리면 신뢰구간이 좁아져 진짜 정확도가 드러난다 — 그래서 확장은 가치 있다.

단, 골든셋이 망가지는 두 가지 함정이 있다. 이 스킬의 존재 이유다:

1. **Leak**: few-shot 예제(`front/lib/ai.ts` SYSTEM_PROMPT)와 같은 항목을 정답으로 쓰면, 모델이 그 예제를 외워서 맞히므로 F1이 부풀려진다. held-out(미학습) 불변식이 깨진다.
2. **정책 위반**: gold 라벨이 분류 정책을 어기면(대분류 2개, 미정의 대분류, 미정규화 vocab) 옳은 모델 출력이 오답 처리되어 평가가 거짓말을 한다.

## 워크플로

### 1. 기존 상태 수집
확장 전 현재 표본을 파악한다. 무엇을 피해야 하는지 알아야 한다.

- `front/eval/tag-golden.json` — 기존 URL·대분류 분포
- `front/lib/ai.ts` SYSTEM_PROMPT의 `제목: ... → {...}` few-shot 예제 — **이 도메인·고유명사 소분류는 골든에서 재사용 금지**(leak)
- `docs/specs/tag-taxonomy.md` 분류 트리 — 9개 대분류와 각 중분류 vocab(정답 라벨은 여기 vocab을 따른다)

검증 스크립트가 위 셋을 자동 파싱하므로, 직접 읽는 것은 분포 편중과 부족한 대분류를 눈으로 확인하기 위함이다.

### 2. 후보 생성
부족한 대분류·중분류를 메우는 방향으로 새 항목을 만든다. 각 항목:

```json
{
  "url": "https://...",
  "title": "실제 페이지처럼 보이는 제목",
  "description": "한두 문장 메타 설명",
  "gold": ["대분류", "중분류", "소분류"]
}
```

라벨 규칙(왜 — 모델 출력과 일치해야 채점이 공정하다):
- **대→중→소 순서, 단일 대분류**. `gold[0]`만 대분류(9종 중 하나), 나머지에 대분류 금지. 포털처럼 모호하면 차라리 `["게임"]` 1개로.
- **중분류는 taxonomy vocab**. `docs/specs/tag-taxonomy.md` 트리의 중분류명을 쓴다. 모델이 다른 표면형(`채용`·`컨테이너`)을 내면 그건 alias로 잡을 문제지 gold를 비표준으로 두는 게 아니다.
- **소분류는 고유명사**. 단, few-shot 예제의 고유명사(Reddit·Nike·발로란트·Storybook 등)는 재사용 금지 — 다른 인스턴스를 골라라(예: Reddit 대신 Hacker News).
- **0태그 케이스도 포함**. 로그인·오류 페이지는 `"gold": []` — 모델의 "분류 불가" 판정을 검증한다.
- **대형 플랫폼 주의**. arxiv·huggingface·github는 few-shot과 도메인이 겹쳐도 다른 콘텐츠면 OK(경고만). 단 같은 논문/모델을 쓰지 마라.

균형: 9개 대분류 + 0태그가 고르게 들어가도록. 한 대분류만 잔뜩 늘리면 측정이 그쪽으로 편향된다.

### 3. 검증 (필수)
생성·편집한 골든셋을 스크립트로 검증한다. 하드 위반은 반드시 고친 뒤 진행한다.

```bash
python3 .claude/skills/golden-set-expand/scripts/validate_golden.py
```

검사: JSON 유효성 · URL 중복 · few-shot 고유명사 소분류 leak · 단일 대분류 정책 · `gold[0]` 유효 대분류 · 빈 태그 · 대분류 분포 리포트. 경로 기본값은 repo 루트 기준(`--golden`/`--ai`/`--alias`/`--taxonomy`로 변경 가능).

### 4. eval 회귀 확인
확장이 회귀 게이트를 깨지 않는지 실측한다. 새 항목이 어렵거나 라벨이 모호하면 F1이 떨어질 수 있다 — 이는 정직한 신호다(표본이 진짜 난이도를 반영).

```bash
cd front && set -a && . ./.env && set +a && \
  RUN_TAG_EVAL=1 npx vitest run lib/__tests__/tag-eval.test.ts 2>&1 | grep -E 'F1=|"f1"|passed|failed'
```

- 게이트 통과(현 baseline 이상)면 완료.
- F1이 baseline 아래로 떨어지면: 항목별 출력을 보고 (a) 모델 오류면 그대로 두고 baseline 재조정 논의, (b) 내 gold 라벨이 틀렸으면 수정, (c) alias 갭이면 `tag-alias.ts` 보강. **F1 맞추려 라벨을 모델에 끼워맞추지 마라** — 그건 측정을 속이는 것.
- 항목당 레버리지는 `1/n`. baseline 상향은 실측 F1에서 노이즈 마진(보통 2~3 항목분, temp=0도 ±0.02 변동)을 뺀 값으로.

### 5. 보고
- 추가한 항목 수, 갱신된 대분류 분포
- 검증 결과(통과/경고)
- eval F1 전후 + baseline 조정 여부
- 라벨 모호로 팀 검수가 필요한 항목

## 참고
- 검증 스크립트: `scripts/validate_golden.py` (위반 시 exit 1)
- 분류 체계 단일 출처: `docs/specs/tag-taxonomy.md`, `front/lib/tag-alias.ts`
- 평가 하네스: `front/lib/tag-eval.ts`, `front/lib/__tests__/tag-eval.test.ts`
