# 태그 alias 관리

**관련 태스크**: A5

AI 태깅 출력 정규화용. 운영 중 누락 발견 시 이 파일에 추가.

---

## 대분류 alias

`categories` 테이블 name 매핑. 고정 6개 외 값은 `null` (미분류).

```typescript
// lib/tag-alias.ts
export const CATEGORY_ALIAS: Record<string, string> = {
  // 개발
  'dev': '개발', 'development': '개발', 'programming': '개발',
  '프로그래밍': '개발', '코딩': '개발', 'coding': '개발', 'software': '개발',

  // AI/ML
  'AI': 'AI/ML', 'ML': 'AI/ML', '인공지능': 'AI/ML',
  '머신러닝': 'AI/ML', '딥러닝': 'AI/ML',
  'machine learning': 'AI/ML', 'deep learning': 'AI/ML',

  // 디자인
  'design': '디자인', 'UI': '디자인', 'UX': '디자인',
  'graphic': '디자인', '그래픽': '디자인',

  // 비즈니스
  'business': '비즈니스', '경영': '비즈니스', 'management': '비즈니스',

  // 학습
  'learning': '학습', 'education': '학습', '교육': '학습',
  '공부': '학습', 'study': '학습',

  // 쇼핑
  'shopping': '쇼핑', '구매': '쇼핑', 'buy': '쇼핑',
}
```

---

## 중분류 alias

`tags` 배열 정규화용. 소분류는 자유 텍스트 — alias 없음.

```typescript
export const TAG_ALIAS: Record<string, string> = {
  // 프론트엔드
  'frontend': '프론트엔드', 'front-end': '프론트엔드',
  'FE': '프론트엔드', '프론트': '프론트엔드',

  // 백엔드
  'backend': '백엔드', 'back-end': '백엔드',
  'BE': '백엔드', '서버': '백엔드', 'server': '백엔드',

  // 인프라
  'infra': '인프라', 'infrastructure': '인프라',
  'DevOps': '인프라', 'devops': '인프라', 'CI/CD': '인프라',

  // 데이터베이스
  'DB': '데이터베이스', 'database': '데이터베이스', 'db': '데이터베이스',

  // LLM
  'llm': 'LLM', 'large language model': 'LLM',

  // RAG
  'rag': 'RAG', '검색증강생성': 'RAG',

  // 컴퓨터비전
  'CV': '컴퓨터비전', 'computer vision': '컴퓨터비전', '비전': '컴퓨터비전',

  // MLOps
  'mlops': 'MLOps', 'ml ops': 'MLOps',

  // UI/UX
  'ui/ux': 'UI/UX', 'ui': 'UI/UX', 'ux': 'UI/UX',

  // 스타트업
  'startup': '스타트업', 'start-up': '스타트업', '창업': '스타트업',

  // 커리어
  'career': '커리어', '취업': '커리어', '이직': '커리어', 'job': '커리어',

  // 강의
  'lecture': '강의', 'course': '강의',
  'tutorial': '강의', '튜토리얼': '강의', '코스': '강의',

  // 논문
  'paper': '논문', 'research': '논문', '리서치': '논문',

  // 공식문서
  'docs': '공식문서', 'documentation': '공식문서',
  'reference': '공식문서', '레퍼런스': '공식문서',

  // 전자기기
  'electronics': '전자기기', '전자제품': '전자기기', 'gadget': '전자기기',

  // 소프트웨어
  'SaaS': '소프트웨어', 'saas': '소프트웨어',
}
```

---

## 적용 함수

```typescript
const TOP_CATEGORIES = new Set(['개발', 'AI/ML', '디자인', '비즈니스', '학습', '쇼핑'])

export function normalizeTags(tags: string[]): string[] {
  return tags.map(t => TAG_ALIAS[t] ?? CATEGORY_ALIAS[t] ?? t)
}

export function resolveTopCategory(tags: string[]): string | null {
  const normalized = normalizeTags(tags)
  return TOP_CATEGORIES.has(normalized[0]) ? normalized[0] : null
}
```

**사용 위치**: `app/api/bookmarks/route.ts` — AI 태깅 직후 적용.

---

## alias 추가 기준

- AI 출력에서 반복적으로 발견되는 비정규 표현
- 동일 개념의 영문/한문 혼용
- 소분류(고유명사)는 추가하지 않음
