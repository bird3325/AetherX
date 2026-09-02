# Chrome Web Store 등록 정보 및 소명서 (셀러보드X - AetherX)

---

## 1. 제품 세부 정보 (Product Details)

### 📌 확장프로그램 명칭 (Name)
`셀러보드X - 셀러를 위한 분석 보드`

### 📌 요약 설명 (Short Description - 132자 이내)
`중급 셀러를 위한 초경량 실시간 분석 & 원클릭 소싱 인텔리전스 (네이버/쿠팡/1688/알리익스프레스 연동)`

### 📌 상세 설명 (Detailed Description)
```text
🚀 셀러보드X(AetherX)는 국내 사입·위탁·PL 셀러를 위한 초경량 실시간 쇼핑몰 분석 및 마진 소싱 인텔리전스 도구입니다.

복잡하고 무거운 올인원 분석 툴 대신, 실제 쇼핑몰 검색 결과(SERP) 화면 위에서 한눈에 필수 데이터 지표를 직관적으로 확인할 수 있도록 설계되었습니다.

[주요 기능]
1. SERP Clean Overlay: 검색 화면을 가리지 않는 1줄 초소형 데이터 바 삽입 (예상 매출/판매량 범위, 마진율, 30일 리뷰 등록 속도, 배지 정보 표시)
2. 신뢰 구간 추정 지표: 단순 판매량 수치가 아닌 신뢰도(%)가 반영된 판매량 범위를 산출하여 재고 리스크 최소화
3. 스마트 퀵 필터: 원하는 마진율 및 리뷰 범위 조건에 맞는 상품만 하이라이트 표시
4. Quick Compare 미니 도크: 유망 상품을 드래그 & 드롭하여 최대 5개 상품 핵심 지표 가로 대조
5. 원클릭 1688 / 알리익스프레스 소싱 역검색: 클릭 한 번으로 중국 소싱처 상품 역검색 및 실시간 관부가세/수수료 반영 정밀 마진 계산
6. 경량 CSV 데이터 추출: 클릭 한 번으로 선택 상품의 핵심 지표를 CSV 파일로 다운로드

[보안 및 프라이버시]
• Local-First 원칙: 모든 분석 및 계산 데이터는 이용자의 브라우저 내에서 안전하게 로컬 처리됩니다.
• 개인정보 비수집: 어떠한 개인 식별 정보도 외부 서버로 수집 또는 전송하지 않습니다.
```

### 📌 카테고리 (Category)
`생산성 (Productivity)` 또는 `쇼핑 (Shopping)`

### 📌 언어 (Language)
`한국어 (Korean)`

---

## 2. 개인정보 보호 전용 목적 (Single Use Justification)

```text
본 확장프로그램의 전용 목적(Single Purpose)은 E-Commerce 셀러(사용자)가 네이버 쇼핑, 쿠팡, G마켓, 옥션, 1688, 알리익스프레스 상품 페이지를 탐색할 때 검색 결과 DOM을 분석하여 상품 판매량 추정치, 마진율, 리뷰 속도 지표를 실시간 오버레이로 제공하고 소싱 마진 계산을 돕는 분석 툴바 및 인텔리전스 패널 기능을 제공하는 것입니다.
```

---

## 3. 권한 사용 근거 (Permission Justifications)

### 🔑 1. `storage` 권한 사용 근거
```text
이용자가 설정한 마진 계산기 옵션(기본 마진율, 플랫폼 수수료 커스텀값, 필터 조건)과 'Quick Compare' 미니 도크에 임시로 담은 상품 목록 데이터를 이용자의 브라우저 로컬 저장소(chrome.storage.local)에 안전하게 저장하기 위해 사용됩니다. 외부 서버로 전송되지 않으며 오직 사용자 편의를 위한 로컬 설정 유지 목적입니다.
```

### 🔑 2. `clipboardWrite` 권한 사용 근거
```text
분석 패널 및 정밀 마진 계산기에서 산출된 원가 계산 내역, 주요 추출 키워드, 상품 데이터 요약본을 사용자가 원클릭으로 클립보드에 복사하여 엑셀(Excel)이나 외부 문서 작업 프로그램에 빠르게 붙여넣을 수 있는 '원클릭 데이터 복사' 기능을 제공하기 위해 사용됩니다.
```

### 🔑 3. Host Permissions (호스트 권한) 사용 근거

| 호스트 패턴 | 사용 목적 및 근거 |
| :--- | :--- |
| `https://*.pstatic.net/*` | 네이버 쇼핑 검색 결과의 상품 이미지, 썸네일 및 파싱에 필요한 메타데이터 아이콘 이미지를 오버레이 패널에 정상적으로 표시하기 위해 사용됩니다. |
| `https://*.coupangcdn.com/*` | 쿠팡 상품 데이터 분석 시 썸네일 이미지 및 마진 계산용 상품 이미지 자원을 로드하여 UI 패널에 렌더링하기 위해 사용됩니다. |
| `https://*.1688.com/*` | 1688 소싱 페이지에서 상품 대표 이미지 역검색 실행 및 현지 도매 원가/환율 정보를 연동 분석하여 실시간 정밀 마진 계산 결과를 제공하기 위해 사용됩니다. |
| `https://*.aliexpress.com/*` | 알리익스프레스 상품 상세 페이지 및 검색 페이지에서 직구/사입 원가를 파싱하여 마진 계산기 및 비콘 오버레이에 연동하기 위해 사용됩니다. |
| `https://*.gmarket.co.kr/*` | G마켓 상품 페이지 및 검색 결과 DOM에서 상품 가격, 수수료, 배송 정보 데이터를 수집 분석하여 셀러 지표 오버레이를 생성하기 위해 사용됩니다. |
| `https://*.auction.co.kr/*` | 옥션 상품 페이지 및 검색 결과 DOM에서 가격, 마진 계산용 기초 지표 데이터를 수집 분석하여 셀러 지표 오버레이를 생성하기 위해 사용됩니다. |

---

## 4. 개인정보처리방침 (Privacy Policy) Vercel 배포 URL

### 🌐 개인정보처리방침 URL
크롬 웹스토어 등록 시 아래 생성된 개인정보처리방침 URL을 등록해 주세요.

* **Vercel 배포용 생성 파일 위치**:
  * [index.html](file:///d:/100%20shop/extensions/AetherX/privacy-policy/index.html)
  * [vercel.json](file:///d:/100%20shop/extensions/AetherX/privacy-policy/vercel.json)

### 🚀 Vercel 초간단 배포 방법 (3가지 중 택1)
1. **GitHub 연동 배포 (권장)**:
   * GitHub 레포지토리에 커밋 후 Vercel 대시보드([vercel.com](https://vercel.com))에서 `privacy-policy` 폴더를 Root Directory로 지정하여 New Project 추가.
   * 배포 후 생성되는 URL (예: `https://aetherx-privacy.vercel.app`)을 Chrome Web Store 개인정보처리방침 URL 입력란에 입력.
2. **Vercel CLI 배포**:
   * 터미널(CMD)에서 `cd "d:\100 shop\extensions\AetherX\privacy-policy"` 이동 후 `npx vercel` 실행하여 1분 만에 즉시 배포 URL 생성.
3. **Vercel 웹 드래그 & 드롭 배포**:
   * [vercel.com/new](https://vercel.com/new) 접속 후 `privacy-policy` 폴더를 화면에 드래그하여 바로 배포.
