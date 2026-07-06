# 북마크 임포트 — 백그라운드 job + Redis 진행률 (미구현, 향후 옵션)

> 상태: **미구현**. 지금은 SSE 스트리밍(`docs/specs/import-progress-sse.md`)으로 진행 중. 대량 임포트가 실제로 자주 발생하거나 `maxDuration`(300s) 타임아웃이 실측되면 이 문서 기준으로 전환 검토.

## 배경

`front/app/api/bookmarks/import/route.ts`는 단일 동기 요청 안에서 파싱→중복필터→AI태깅/임베딩→저장을 전부 처리한다. 현재 구조(`CHUNK_SIZE=5` 순차 청크) 기준 역산:

| 건수 | 예상 소요 | 비고 |
|---|---|---|
| ~100건 | ~50~60s | 안전 |
| ~250건 | ~125~150s | 부담 시작 |
| ~500건(현 `MAX_ITEMS` 상한) | ~200~300s | **300s 캡 턱걸이** — 죽은 URL(fetchMeta 5s 타임아웃) 몇 개만 껴도 초과 |

**핵심 리스크**: `maxDuration` 초과로 함수가 강제 종료되면 응답 자체가 안 나감(504). 그 시점까지 upsert된 항목은 이미 DB에 들어갔지만 클라이언트는 imported/duplicate 카운트를 전혀 못 받음 — 부분 실패가 아니라 무응답.

SSE는 같은 요청 수명 안에서 진행률만 스트리밍하는 방식이라 이 근본 리스크(타임아웃 시 통째로 끊김)를 해결하지 못한다. **이 문서의 방식은 그 근본 리스크 자체를 없앤다.**

## 아키텍처

```
POST /api/bookmarks/import
  → 즉시 job id 발급 + 202 응답 (요청 자체는 짧게 끝남)
  → 실제 처리(파싱~AI~저장)는 요청 응답 이후에도 계속 실행 (waitUntil / Vercel Queues)
  → 처리 중 청크 완료마다 Redis에 진행률 원자적 기록

클라이언트
  → 202 응답의 job id로 GET /api/bookmarks/import/status/:jobId 주기적 폴링(1~2s)
  → 응답의 done/total로 프로그레스바 렌더
  → status가 done/failed면 폴링 중단, 최종 결과(imported/duplicate/skipped/failed) 표시
```

## 왜 Redis(Upstash)인가

진행률 상태 저장 용도에 Postgres(Supabase)보다 적합한 이유:

- **원자적 카운터**: `HINCRBY job:{id} done <n>` — 동시 처리 중인 청크(AI 5개, 폴더업데이트 20개)의 완료를 레이스 없이 누적. Postgres로 하려면 `UPDATE ... SET done = done + n` row lock이 필요.
- **TTL 자동 소멸**: job 완료 후 일정 시간(예: 1시간) 지나면 자동 삭제 — 별도 cron 정리 불필요.
- **DB 부하 분리**: 폴링(1~2s 간격, N초 동안 반복)이 북마크 쓰기와 같은 Postgres 커넥션 풀을 잠식하지 않음.
- **Vercel 네이티브**: Upstash Redis는 Vercel Marketplace 통합 제품, REST 기반이라 서버리스 함수에서 커넥션 풀링 문제 없이 바로 사용 가능(`vercel:vercel-storage` 스킬 참고).

## 데이터 스키마 (Redis)

```
key: job:{jobId}   (Hash, TTL 3600s)
  status:     "processing" | "done" | "failed"
  total:      number   # 파싱된 북마크 수 (skipped 제외)
  done:       number   # 처리 완료된 항목 수 (누적)
  imported:   number
  duplicate:  number
  failed:     number
  skipped:    number   # MAX_ITEMS 초과분 — 시작 시 즉시 확정, 처리 중 불변
```

## API 변경 (초안)

- `POST /api/bookmarks/import` — 파일 업로드 즉시 202 + `{ jobId }` 반환. 실제 처리는 `waitUntil()` 또는 Vercel Queues로 응답 이후에도 계속.
- `GET /api/bookmarks/import/status/:jobId` — `withAuth` 필수(본인 job만 조회 가능하도록 `user_id`도 함께 저장해 검증). Redis에서 해당 job 해시 조회 후 반환.

## 보안/규칙 반영

- Redis 접속 URL/토큰은 서버 전용(`NEXT_PUBLIC_` 접두어 금지) — Route Handler에서만 접근, CLAUDE.md 환경변수 규칙과 동일 적용.
- job 조회 시 `user_id` 일치 확인 필수 — 타인의 job id로 진행률 조회 못 하도록.
- 응답에 embedding/content 미포함 원칙은 이 job 상태에도 동일 적용(애초에 저장 안 함).

## 전환 기준

- 대량 임포트(>300건)가 실사용에서 반복적으로 발생하거나, `maxDuration` 타임아웃이 실측되면 이 방식으로 전환.
- 그전까지는 SSE(`docs/specs/import-progress-sse.md`)로 충분 — 요청 하나 안에서 진행률만 보여주는 것으로 UX 개선.

## 남은 결정 사항 (구현 시 확정 필요)

- 백그라운드 실행 메커니즘: `waitUntil()`(Fluid Compute) vs Vercel Queues(현재 public beta) — 실행 시점의 안정성/과금 확인 후 결정.
- 폴링 간격/백오프 정책, 폴링 실패(네트워크 오류) 시 클라이언트 재시도 정책.
- job 완료 후 결과 화면 전환 방식(폴링 중단 트리거).
