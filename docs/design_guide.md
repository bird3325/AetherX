# Aether X 디자인 가이드라인

## 1. 디자인 원칙 (Design Principles)
* **Non-Intrusive (비침해성)**: 기본 웹페이지의 레이아웃을 해치지 않고 검색 카드 밑에 자연스럽게 녹아드는 인라인 카드.
* **Glanceable Data (1초 스캔 가능성)**: 색상 배지와 신뢰도 구간을 통해 클릭 없이 스크롤만으로 유망 상품 판별.
* **Action-Oriented (행동 지향)**: 데이터 조회 후 1688 소싱 검색, 마진 계산, 비교 도크 담기 액션을 1클릭으로 연결.

---

## 2. 컬러 시스템 (Color System)

| 구분 | 색상 명칭 | Hex Code | 용도 |
| :--- | :--- | :--- | :--- |
| **Primary** | Aether Blue | `#2563EB` | 주요 액션 버튼, 브랜드 심볼, 활성 탭 |
| **Platform Naver** | Naver Green | `#03C75A` | 스마트스토어 등급, 네이버 전용 지표 |
| **Platform Coupang** | Rocket Red | `#E11D48` | 로켓배송 배지, 쿠팡 지표 |
| **High Margin** | Emerald Green | `#059669` | 고마진(25%+), 높은 신뢰도(80%+) |
| **Warning** | Amber Yellow | `#D97706` | 보통 마진(15~25%), 신뢰도 보통(50~70%) |
| **Danger / Alert** | Crimson Red | `#DC2626` | 저마진(<15%), 가격 급락, 품절/어뷰징 위험 |
| **Surface Dark** | Slate Dark | `#0F172A` | 패널 배경 및 어두운 카드 배경 |
| **Surface Light** | Slate Light | `#F8FAFC` | 패널 배경 및 밝은 카드 배경 |
| **Border** | Slate Line | `#E2E8F0` | 외곽 테두리, 디바이더 |

---

## 3. 타이포그래피 (Typography)
* **Font Family**: `Pretendard`, `-apple-system`, `sans-serif`
* **Scale**:
  * **Panel Title (H1)**: `16px` / `SemiBold` / Line-height `22px`
  * **Section Title (H2)**: `13px` / `SemiBold` / Line-height `18px`
  * **Metric Data (Number)**: `12px` / `Bold` / Line-height `16px`
  * **Body Text**: `11px` / `Regular` / Line-height `15px`
  * **Micro / Tag**: `10px` / `Medium` / Line-height `12px`

---

## 4. 주요 UI 컴포넌트 규격
### 4.1 SERP Clean Overlay (검색 결과 인라인 바)
* **위치**: 상품명 및 가격 영역 하단 (`margin-top: 4px;`)
* **레이아웃 구조**:
  ```text
  +-----------------------------------------------------------------------------------------+
  | [📊 420~580개 (81%)] | 마진: 32.5% | 리뷰: +24개/월 | [빅파워] | [🔍 1688] | [+] 비교 |
  +-----------------------------------------------------------------------------------------+
  ```

### 4.2 Quick Compare 도킹 패널 (Slide-over Dock)
* **위치**: 브라우저 우측 하단 고정 (`position: fixed; right: 16px; bottom: 16px; z-index: 999999;`)
* **크기**:
  * **Collapsed**: 가로 `140px`, 세로 `38px` (담긴 상품: `3/5` + `[비교하기]`)
  * **Expanded**: 가로 `440px`, 최대 높이 `520px`
* **구성**: 상단 액션 바 (`[일괄 1688 검색]`, `[CSV 다운로드]`, `[비우기]`) + 5개 상품 비교 매트릭스 테이블.
