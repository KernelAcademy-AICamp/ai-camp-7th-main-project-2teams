import { describe, it, expect } from 'vitest'
import { expandSearchQuery, SEARCH_ALIAS } from '../search-alias'

describe('expandSearchQuery', () => {
  it('한글 브랜드명 → [원문, 영문]', () => {
    expect(expandSearchQuery('피그마')).toEqual(['피그마', 'Figma'])
  })

  it('영문 브랜드명(대소문자 무관) → [원문, 한글]', () => {
    expect(expandSearchQuery('figma')).toEqual(['figma', '피그마'])
    expect(expandSearchQuery('Figma')).toEqual(['Figma', '피그마'])
  })

  it('유튜브 ↔ YouTube', () => {
    expect(expandSearchQuery('유튜브')).toEqual(['유튜브', 'YouTube'])
    expect(expandSearchQuery('youtube')).toEqual(['youtube', '유튜브'])
  })

  it('제미나이 ↔ Gemini', () => {
    expect(expandSearchQuery('제미나이')).toEqual(['제미나이', 'Gemini'])
    expect(expandSearchQuery('gemini')).toEqual(['gemini', '제미나이'])
  })

  it('미드저니 ↔ Midjourney', () => {
    expect(expandSearchQuery('미드저니')).toEqual(['미드저니', 'Midjourney'])
    expect(expandSearchQuery('midjourney')).toEqual(['midjourney', '미드저니'])
  })

  it('안드레 카파시 ↔ Andrej Karpathy', () => {
    expect(expandSearchQuery('안드레 카파시')).toEqual(['안드레 카파시', 'Andrej Karpathy'])
    expect(expandSearchQuery('Andrej Karpathy')).toEqual(['Andrej Karpathy', '안드레 카파시'])
  })

  it('컬리 ↔ Kurly', () => {
    expect(expandSearchQuery('컬리')).toEqual(['컬리', 'Kurly'])
    expect(expandSearchQuery('kurly')).toEqual(['kurly', '컬리'])
  })

  it('alias 없는 쿼리 → [원문]만', () => {
    expect(expandSearchQuery('머신러닝 입문')).toEqual(['머신러닝 입문'])
  })

  it('앞뒤 공백은 트림 후 조회', () => {
    expect(expandSearchQuery('  피그마  ')).toEqual(['피그마', 'Figma'])
  })

  // 대화형 쿼리 — 시간참조·지시어·행위어 노이즈 제거 (search-golden conversational 실측 2/8 대응)
  it('시간참조·지시어·행위어 토큰 제거 후 확장', () => {
    expect(expandSearchQuery('지난달 저장한 그 pgvector 아티클')).toEqual(['pgvector 아티클'])
    expect(expandSearchQuery('그 리액트 훅 글')).toEqual(['리액트 훅 글', 'React 훅 글'])
  })

  it('노이즈 제거 후 문장 속 브랜드 토큰도 원어 변형 추가', () => {
    expect(expandSearchQuery('그때 봤던 테일윈드 설치 문서')).toEqual([
      '테일윈드 설치 문서',
      'Tailwind 설치 문서',
    ])
  })

  it('노이즈 토큰만으로 이뤄진 쿼리는 원문 유지 (빈 쿼리 방지)', () => {
    expect(expandSearchQuery('지난달 본')).toEqual(['지난달 본'])
  })

  // 조사 붙은 브랜드 토큰 — 정확일치 실패 시 조사 제거 후 alias 재조회 (search-golden particle 실측 2/4 대응)
  it('조사 붙은 브랜드 토큰도 원어 변형 생성', () => {
    expect(expandSearchQuery('피그마로 디자인 배우는 법')).toEqual([
      '피그마로 디자인 배우는 법',
      'Figma 디자인 배우는 법',
    ])
    expect(expandSearchQuery('리액트를 처음 배울 때 본 문서')).toEqual([
      '리액트를 처음 배울 때 문서',
      'React 처음 배울 때 문서',
    ])
  })

  it('조사 제거 결과가 사전에 없으면 원토큰 유지 (오절단 방지)', () => {
    expect(expandSearchQuery('한글로 검색')).toEqual(['한글로 검색'])
  })

  // 2026-07-27 alias 동기화 — 북마크 tags/title에 한글 음차·원어가 동시 존재하는 쌍
  it('챗지피티·챗GPT ↔ ChatGPT', () => {
    expect(expandSearchQuery('챗지피티')).toEqual(['챗지피티', 'ChatGPT'])
    expect(expandSearchQuery('챗GPT')).toEqual(['챗GPT', 'ChatGPT'])
    expect(expandSearchQuery('chatgpt')).toEqual(['chatgpt', '챗지피티'])
  })

  it('나노바나나 ↔ Nano Banana', () => {
    expect(expandSearchQuery('나노바나나')).toEqual(['나노바나나', 'Nano Banana'])
    expect(expandSearchQuery('나노 바나나')).toEqual(['나노 바나나', 'Nano Banana'])
    expect(expandSearchQuery('Nano Banana')).toEqual(['Nano Banana', '나노바나나'])
  })

  it('프레이머 ↔ Framer', () => {
    expect(expandSearchQuery('프레이머')).toEqual(['프레이머', 'Framer'])
    expect(expandSearchQuery('framer')).toEqual(['framer', '프레이머'])
  })

  it('파이썬 ↔ Python', () => {
    expect(expandSearchQuery('파이썬')).toEqual(['파이썬', 'Python'])
    expect(expandSearchQuery('python')).toEqual(['python', '파이썬'])
  })

  it('인스타그램·인스타 ↔ Instagram', () => {
    expect(expandSearchQuery('인스타그램')).toEqual(['인스타그램', 'Instagram'])
    expect(expandSearchQuery('인스타')).toEqual(['인스타', 'Instagram'])
    expect(expandSearchQuery('instagram')).toEqual(['instagram', '인스타그램'])
  })

  it('링크드인 ↔ LinkedIn', () => {
    expect(expandSearchQuery('링크드인')).toEqual(['링크드인', 'LinkedIn'])
    expect(expandSearchQuery('linkedin')).toEqual(['linkedin', '링크드인'])
  })

  it('브루 ↔ Vrew', () => {
    expect(expandSearchQuery('브루')).toEqual(['브루', 'Vrew'])
    expect(expandSearchQuery('vrew')).toEqual(['vrew', '브루'])
  })

  // DB 전수 재탐색(전 사용자 1039건)에서 추가 — 순수 교차언어 실측상 음차만으로 top-60 미진입
  it('마켓컬리 ↔ Kurly', () => {
    expect(expandSearchQuery('마켓컬리')).toEqual(['마켓컬리', 'Kurly'])
  })

  it('제로초 ↔ ZeroCho', () => {
    expect(expandSearchQuery('제로초')).toEqual(['제로초', 'ZeroCho'])
    expect(expandSearchQuery('zerocho')).toEqual(['zerocho', '제로초'])
  })

  it('하네스엔지니어링 ↔ Harness Engineering', () => {
    expect(expandSearchQuery('하네스엔지니어링')).toEqual(['하네스엔지니어링', 'Harness Engineering'])
  })

  it('컬리 키는 마켓컬리 추가 후에도 기존 매핑 유지', () => {
    expect(expandSearchQuery('컬리')).toEqual(['컬리', 'Kurly'])
    expect(expandSearchQuery('kurly')).toEqual(['kurly', '컬리'])
  })

  // 역방향 대비 — 북마크에 한글 표기만 있는 브랜드. 영문 쿼리가 한글까지 확장돼야 잡힌다
  it('영문 쿼리 → 한글 표기 역방향 확장', () => {
    expect(expandSearchQuery('Filmora')).toEqual(['Filmora', '필모라'])
    expect(expandSearchQuery('streamlit')).toEqual(['streamlit', '스트림릿'])
    expect(expandSearchQuery('Tistory')).toEqual(['Tistory', '티스토리'])
    expect(expandSearchQuery('CLOVA Note')).toEqual(['CLOVA Note', '클로바노트'])
    expect(expandSearchQuery('amazon')).toEqual(['amazon', '아마존'])
  })

  it('한글 표기만 있는 브랜드도 정방향 확장', () => {
    expect(expandSearchQuery('뤼튼')).toEqual(['뤼튼', 'Wrtn'])
    expect(expandSearchQuery('미리캔버스')).toEqual(['미리캔버스', 'MiriCanvas'])
    expect(expandSearchQuery('카카오')).toEqual(['카카오', 'Kakao'])
    expect(expandSearchQuery('토스')).toEqual(['토스', 'Toss'])
  })

  it('토스 alias가 토스트 같은 인접 토큰을 오매칭하지 않음', () => {
    expect(expandSearchQuery('토스트 메시지')).toEqual(['토스트 메시지'])
  })

  it('문장 속 신규 브랜드 토큰도 조사 제거 후 확장', () => {
    expect(expandSearchQuery('파이썬으로 크롤링하기')).toEqual([
      '파이썬으로 크롤링하기',
      'Python 크롤링하기',
    ])
  })

  it('사전에 등록된 모든 한글 키는 유효한 영문 값을 가짐', () => {
    for (const [ko, en] of Object.entries(SEARCH_ALIAS)) {
      expect(ko.length).toBeGreaterThan(0)
      expect(en.length).toBeGreaterThan(0)
    }
  })
})
