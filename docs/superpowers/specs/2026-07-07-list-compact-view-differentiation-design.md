# 리스트 뷰(list) / 컴팩트 뷰(compact) 카드 구분 설계

- 날짜: 2026-07-07
- 대상: `front/components/BookmarkCard.tsx` (list 분기 213-249, compact 분기 183-210)
- 관련 없음: tasks.json 항목 아님 (UI 다듬기, 기존 A-id 태스크 범주 밖)

## 배경

`BookmarkToolbar.tsx`의 뷰 전환(그리드/리스트/컴팩트) 중 list와 compact가 시각적으로 구분이 잘 안 된다는 피드백. 원인:

- grid만 `description`(AI 요약)을 보여주고 list·compact는 둘 다 생략 — "중간 밀도" 단계가 없어 list가 compact와 정보량 차이가 작음
- 카드 셸 패딩 차이(`p-4` vs `px-3 py-2.5`)가 작아 눈에 띄지 않음
- compact 태그도 list와 동일한 `TAG_CHIP` pill 스타일이라 축소판처럼 보임

## 목표

grid(전체 정보) → list(중간 정보) → compact(최소 정보) 3단 밀도 계층을 시각적으로 명확히 한다.

## 변경 사항

### list 분기 (`BookmarkCard.tsx:213-249`)

제목과 메타 줄(도메인·태그·날짜) 사이에 설명 1줄 추가:

```tsx
<a ...>{bookmark.title}</a>
{bookmark.description && (
  <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
    {bookmark.description}
  </p>
)}
<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400 ...">
  {/* 기존 메타 줄 그대로 */}
</div>
```

- `line-clamp-1`로 1줄 제한 (grid는 2줄 — list가 더 압축된 느낌 유지)
- `description` 없는 북마크는 기존과 동일하게 렌더 (조건부 렌더링이라 레이아웃 깨짐 없음)

### compact 분기 (`BookmarkCard.tsx:183-210`)

1. 파비콘 축소: `h-6 w-6 rounded-md` → `h-5 w-5 rounded`
2. 태그를 pill 대신 플레인 텍스트 카운트로 교체 — list의 pill과 시각적으로 구분:
   ```tsx
   {bookmark.tags[0] && (
     <span className="hidden shrink-0 truncate text-xs text-gray-400 md:inline dark:text-gray-500">
       {bookmark.tags[0]}
       {bookmark.tags.length > 1 && ` +${bookmark.tags.length - 1}`}
     </span>
   )}
   ```
   (`TAG_CHIP` import 미사용 시 제거)
3. 행 패딩 살짝 축소: `py-2.5` → `py-2` (list `p-4`와의 높이 차 더 벌림)

### 변경하지 않는 것

- grid 분기 무변경
- 부모 컨테이너(`page.tsx:266-278`)의 grid-cols/divide-y 구조 무변경 — 카드 셸 차이는 이미 충분(테두리+그림자 유무)
- compact의 날짜 생략 유지 (grid/list와 차별화 요소로 의도적 유지)

## 테스트

- 시각 확인 위주 (Playwright 스크린샷 320/768/1024/1440 — `web/testing.md` 기준): list에 description 1줄 노출, compact 파비콘/태그가 더 작아졌는지 확인
- `description` null인 북마크로 list 렌더 시 레이아웃 안 깨지는지 확인
- 태그 3개 이상인 북마크로 compact 렌더 시 `+N` 카운트 정확한지 확인
