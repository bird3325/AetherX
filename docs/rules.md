# Aether X 개발 및 설계 규칙 (Rules)

본 규칙은 Aether X Chrome Extension의 안정성, 성능 및 보안을 보장하기 위한 개발 표준입니다. 모든 코드 작성 시 반드시 준수해야 합니다.

## 1. 아키텍처 및 아키텍처 설계 규칙
* **Manifest V3 준수**:
  * 백그라운드 스크립트는 `service_worker`를 활용하며, 영속적인 상태는 저장하지 않고 비동기 메시지 리스너 형태로 작성합니다.
  * 모든 외부 API 호출 및 콘텐츠 스크립트 실행은 Manifest V3의 보안 가이드를 따르며, 인라인 스크립트 실행(`eval`)을 절대 금지합니다.
* **오케스트레이터 & 서브에이전트 패턴**:
  * **오케스트레이터(Orchestrator)**: 메인 콘텐츠 스크립트(또는 백그라운드)가 페이지의 초기화, 이벤트 리스너(Drag & Drop, 버튼 클릭 등), 저장소 업데이트를 총괄합니다.
  * **서브에이전트(Sub-agents)**:
    * **Naver Parser Agent**: 네이버 SERP 파싱 전담
    * **Coupang Parser Agent**: 쿠팡 SERP 파싱 전담
    * **Calculator Agent**: 수수료/마진 계산 및 신뢰 구간 연산 전담
    * **UI Renderer Agent**: Clean Overlay 및 Quick Compare 도킹 패널의 DOM 렌더링 전담

## 2. UI/UX 및 스타일링 규칙
* **비침해성 (Non-Intrusive)**:
  * 웹페이지 원래의 레이아웃이나 요소 정렬을 흐트러뜨리지 않아야 합니다. (`position`, `z-index`, `margin-top` 등에 세심한 주의)
  * CSS 격리(Scoping)를 철저히 하여 네이버/쿠팡의 기존 스타일과 충돌을 방지합니다. (예: `aetherx-` 접두사 사용 또는 CSS Shadow DOM 활용)
* **글로벌 UI/UX 규칙**:
  * **"UI나 스타일은 절대 건드리지 말고 해당 로직만 수정해주세요"** (사용자 글로벌 룰 준수: 전체 레이아웃 구조와 스타일은 변경하지 않음)
  * 신규 디자인 작업물은 사전에 기획된 색상표(Aether Blue, Naver Green 등)와 타이포그래피 규칙을 따릅니다.

## 3. 성능 및 보안 규칙
* **DOM 탐색 최소화**:
  * 스크롤 이벤트에 따른 잦은 DOM 조작을 피하기 위해 `IntersectionObserver`를 사용하여 화면에 노출되는 시점에만 Clean Overlay를 렌더링합니다.
  * 중복 파싱 방지를 위해 한 번 파싱된 상품 카드는 캐시에 등록하고 `data-aetherx-parsed="true"` 속성을 부여합니다.
* **로컬 퍼스트 (Local-First)**:
  * 민감한 비지니스 정보 및 소싱 세팅값은 서버로 전송하지 않고 사용자의 `chrome.storage.local`에 보관합니다.
