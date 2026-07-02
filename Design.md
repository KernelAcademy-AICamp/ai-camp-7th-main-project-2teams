name: Mowaba Design System
colors:
surface: '#f7f9fb'
surface-dim: '#d8dadc'
surface-bright: '#f7f9fb'
surface-container-lowest: '#ffffff'
surface-container-low: '#f2f4f6'
surface-container: '#eceef0'
surface-container-high: '#e6e8ea'
surface-container-highest: '#e0e3e5'
on-surface: '#191c1e'
on-surface-variant: '#414751'
inverse-surface: '#2d3133'
inverse-on-surface: '#eff1f3'
outline: '#717783'
outline-variant: '#c1c7d3'
surface-tint: '#0060ac'
primary: '#005da7'
on-primary: '#ffffff'
primary-container: '#2976c7'
on-primary-container: '#fdfcff'
inverse-primary: '#a4c9ff'
secondary: '#4f6073'
on-secondary: '#ffffff'
secondary-container: '#cfe1f8'
on-secondary-container: '#536478'
tertiary: '#006859'
on-tertiary: '#ffffff'
tertiary-container: '#008471'
on-tertiary-container: '#f4fffa'
error: '#E74C3C'
on-error: '#ffffff'
error-container: '#ffdad6'
on-error-container: '#93000a'
primary-fixed: '#d4e3ff'
primary-fixed-dim: '#a4c9ff'
on-primary-fixed: '#001c39'
on-primary-fixed-variant: '#004883'
secondary-fixed: '#d2e4fb'
secondary-fixed-dim: '#b6c8df'
on-secondary-fixed: '#0a1d2d'
on-secondary-fixed-variant: '#37485b'
tertiary-fixed: '#7cf8dd'
tertiary-fixed-dim: '#5ddbc1'
on-tertiary-fixed: '#00201a'
on-tertiary-fixed-variant: '#005144'
background: '#f7f9fb'
on-background: '#191c1e'
surface-variant: '#e0e3e5'
success: '#48C9B0'
warning: '#F1C40F'
surface-sidebar: rgba(255, 255, 255, 0.7)
text-primary: '#1E293B'
text-secondary: '#64748B'
typography:
display:
fontFamily: Inter
fontSize: 32px
fontWeight: '700'
lineHeight: 40px
letterSpacing: -0.02em
headline-lg:
fontFamily: Inter
fontSize: 24px
fontWeight: '600'
lineHeight: 32px
letterSpacing: -0.01em
headline-md:
fontFamily: Inter
fontSize: 20px
fontWeight: '600'
lineHeight: 28px
body-lg:
fontFamily: Inter
fontSize: 16px
fontWeight: '400'
lineHeight: 24px
body-md:
fontFamily: Inter
fontSize: 14px
fontWeight: '400'
lineHeight: 20px
label-lg:
fontFamily: Inter
fontSize: 14px
fontWeight: '600'
lineHeight: 20px
label-sm:
fontFamily: Inter
fontSize: 12px
fontWeight: '500'
lineHeight: 16px
caption:
fontFamily: Inter
fontSize: 12px
fontWeight: '400'
lineHeight: 16px
headline-lg-mobile:
fontFamily: Inter
fontSize: 20px
fontWeight: '600'
lineHeight: 28px
rounded:
sm: 0.25rem
DEFAULT: 0.5rem
md: 0.75rem
lg: 1rem
xl: 1.5rem
full: 9999px
spacing:
base: 4px
xs: 4px
sm: 8px
md: 16px
lg: 24px
xl: 32px
gutter: 24px
margin: 40px
sidebar-width: 260px
Mowaba 디자인 시스템
Brand & Style
스마트하고 효율적이며 미니멀한 AI 북마크 경험을 위해 설계된 디자인 시스템입니다. 정리와 속도를 중요하게 여기는 파워 유저를 타겟으로 하며, 차분한 신뢰감과 하이테크 정밀함을 전달합니다.

비주얼 스타일은 Corporate / Modern이며, 내비게이션 요소에는 Glassmorphism을 적용했습니다. 정보 밀도를 유지하면서도 복잡해 보이지 않도록 “Knowledge-First” 철학을 따르며, 은은한 깊이감과 깔끔한 구조로 AI 기반 자동 분류가 직관적이고 자연스럽게 느껴지도록 합니다.

Colors
핵심 브랜드 아이덴티티에서 파생된 팔레트입니다.

Vibrant Blue (#4A90E2) — 메인 액션 컬러. 지능과 추진력을 상징하며 “북마크 추가” 같은 주요 버튼에 사용
Deep Blue (#2D3E50) — 구조적 기준색. 텍스트와 딥 뉴트럴 배경에 사용해 신뢰감 형성
Mint Green (#48C9B0) — 성공 상태, 활동 히트맵 등 성장 관련 지표에 사용
뉴트럴 컬러는 쿨그레이 계열로 전문적·기술적 느낌을 유지합니다. 기본 모드는 라이트 모드이며, 장시간 정보 탐색 시 눈의 피로를 줄이기 위해 깔끔한 오프화이트(#F8FAFC)를 메인 콘텐츠 영역에 사용합니다.

Typography
정보 밀도가 높은 환경에서 뛰어난 가독성을 위해 Inter를 사용합니다. 카드와 사이드바에서 명확한 위계를 확보하도록 촘촘한 스케일로 구성했습니다.

제목: 페이지 헤더는 headline-lg, 북마크 카드 제목은 label-lg(2줄 클램프)
메타데이터: 도메인명·타임스탬프는 caption으로 처리해 콘텐츠 제목에 시선이 집중되도록 함
인터랙션: 내비게이션 아이템은 label-lg + 폰트 굵기 변화로 활성 상태 표시
Layout & Spacing
Fixed-Fluid 하이브리드 그리드를 따릅니다. 사이드바는 고정 260px, 메인 콘텐츠 영역은 12컬럼 유동 그리드입니다.

디바이스 컬럼 거터 외부 여백
Desktop 12컬럼 24px 40px
Tablet 8컬럼 16px 24px
Mobile 4컬럼 12px 16px
컴포넌트 간 간격은 8px 기본 리듬을 따르고, 칩·검색창 내부 여백 같은 컴포넌트 내부 패딩은 4px 단위로 촘촘하고 효율적인 느낌을 유지합니다.

Elevation & Depth
Tonal Layering과 Glassmorphism을 조합해 계층을 표현합니다.

Level 0 (Base): #F8FAFC 배경
Level 1 (Cards): 흰색 배경 + 1px 보더(#E2E8F0) + 은은한 저투명도 그림자 (0 4px 6px -1px rgba(0, 0, 0, 0.05))
Level 2 (Sidebar): backdrop-filter: blur(12px) + 반투명 흰색 배경 (rgba(255, 255, 255, 0.7))
Level 3 (Modals/Toasts): 15% 불투명도의 딥블루 틴트가 적용된 고대비 그림자로 시선을 전면에 끌어옴
Shapes
세련되고 모던한 형태 언어를 사용합니다. 표준 컴포넌트는 **Rounded (0.5rem)**을 기본으로 하고, 북마크 카드처럼 AI가 정리한 데이터를 담는 친근한 컨테이너에는 **rounded-xl (1.5rem)**을 적용합니다. 태그·상태 칩 같은 인터랙티브 요소는 pill 형태(full-round)로 기능성 컨테이너와 구분합니다.

Components
Buttons
Primary: #4A90E2 솔리드 + 흰색 텍스트, Rounded(0.5rem). “북마크 추가” 등 고강조 액션에 사용
Secondary: #4A90E2 보더 + 텍스트의 고스트 스타일
Action: 카드 내 “즐겨찾기”·“삭제” 등 소형 아이콘, 저투명도 그레이 hover 상태
Cards (Bookmark Grid)
Container: rounded-xl + Level 1 elevation
Content: 파비콘(좌상단, 24×24px), 제목(body-lg, bold), 메타(caption)
Tags: 카드당 최대 3개 칩, secondary/mint 톤 사용
Sidebar
Style: Glassmorphic 배경
Navigation: 아이템 간 sm 수직 간격. 활성 아이템은 좌측 4px 보더 액센트(Primary Blue)
Input Fields
Search Bar: 높이 48px, rounded-lg, 라이트 그레이 보더. Focus 시 2px Primary Blue 글로우
URL Entry: 에러/성공 상태를 위한 검증 아이콘 포함
Chips & Tags
Category Badge: 큰 사이즈, pill 형태, 카테고리별 팔레트 사용
AI Tags: 작은 사이즈, pill 형태, 연한 블루 배경 + 블루 텍스트
