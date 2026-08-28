// Auction SERP HTML Parser Sub-agent
window.AuctionParser = {
  // Auction 상품 리스트 아이템 탐색
  getProductElements: function() {
    const selectors = [
      'div.box__item-container',
      'div[class*="box__item-container"]',
      'div.component--item_card',
      'div[class*="component--item_card"]',
      'div.itemcard',
      'li[data-monta-id]'
    ];
    
    let elements = [];
    selectors.forEach(selector => {
      const found = document.querySelectorAll(selector);
      if (found.length > 0) {
        elements = elements.concat(Array.from(found));
      }
    });
    
    const uniqueElements = [...new Set(elements)];
    
    // 부모-자식 관계에 있는 하위 중복 요소 제거 및 "오늘의 프라임상품" 영역 제외
    return uniqueElements.filter(el => {
      let parent = el.parentElement;
      while (parent) {
        if (uniqueElements.includes(parent)) {
          return false;
        }
        parent = parent.parentElement;
      }

      // "오늘의 프라임상품" 섹션 및 카드 감지 제외
      if (this.isPrimeProduct(el)) {
        return false;
      }

      return true;
    });
  },

  // "오늘의 프라임상품" 상단 스폰서드 섹션 전용 판별 헬퍼
  isPrimeProduct: function(el) {
    if (!el) return false;

    // 1. 카드 자체에 prime 관련 클래스/ID가 지정된 경우
    const cardClass = (el.className || "").toString().toLowerCase();
    const cardId = (el.id || "").toString().toLowerCase();
    if (cardClass.includes('prime-item') || cardId.includes('prime-item')) {
      return true;
    }

    // 2. 엘리먼트가 직접 속한 직계 섹션/모듈 컨테이너 탐색
    const section = el.closest('.section__module_wrap') || 
                    el.closest('div[class*="section__module"]') || 
                    el.closest('div[class*="box__section"]') ||
                    el.closest('section');

    if (section) {
      const sectionClass = (section.className || "").toString().toLowerCase();
      const sectionId = (section.id || "").toString().toLowerCase();
      if (sectionClass.includes('prime') || sectionId.includes('prime')) {
        return true;
      }

      // 해당 섹션의 직접적인 헤더/타이틀 텍스트만 검사 (상위 전역 컨테이너 타이틀 오매칭 방지)
      const header = section.querySelector('.section__module_header') || 
                     section.querySelector('.box__section-header') ||
                     section.querySelector('.text__title') ||
                     section.querySelector('h1, h2, h3, h4');
      if (header && !el.contains(header)) {
        const headerText = (header.textContent || "").trim();
        if (headerText.includes("오늘의 프라임") || headerText.includes("프라임상품")) {
          return true;
        }
      }
    }

    return false;
  },

  // 개별 상품 요소에서 데이터 파싱
  parseElement: function(el) {
    try {
      if (this.isPrimeProduct(el)) return null;
      // 1. 상세 URL 및 A태그
      const linkEl = el.querySelector('a.link__item') || 
                     el.querySelector('a[href*="itempage3.auction.co.kr"]') ||
                     el.querySelector('a[href*="auction.co.kr"]') ||
                     el.querySelector('a');
      if (!linkEl) return null;
      
      const url = linkEl.href;
      
      // 2. 고유 ID
      let productId = el.getAttribute('data-monta-id') || el.getAttribute('data-itemcode') || el.id;
      if (!productId) {
        const idMatch = url.match(/itemno=([A-Z0-9]+)/i) || url.match(/itemcode=([A-Z0-9]+)/i) || url.match(/([A-Z]\d+)/);
        productId = idMatch ? idMatch[1] : btoa(encodeURIComponent(url)).substring(0, 12);
      }

      // 3. 상품명
      const nameEl = el.querySelector('span.text__item-title') || 
                     el.querySelector('span[class*="text__item-title"]') || 
                     el.querySelector('.text__title') ||
                     el.querySelector('.title');
      let title = nameEl ? nameEl.textContent.trim() : "";
      if (!title) {
        const img = el.querySelector('img');
        if (img && img.alt) {
          title = img.alt.trim();
        }
      }
      title = title || "상품명 없음";

      // 4. 이미지 URL
      const imgs = Array.from(el.querySelectorAll('img'));
      let imgEl = null;
      
      if (imgs.length > 0) {
        const filterPromo = (img) => {
          const src = (img.src || "").toLowerCase();
          const className = (img.className || "").toLowerCase();
          const alt = (img.alt || "").toLowerCase();
          return !(src.includes("badge") || src.includes("icon") || src.includes("logo") || src.includes("smile") ||
                   className.includes("badge") || className.includes("icon") || className.includes("logo") ||
                   alt.includes("스마일") || alt.includes("배송") || alt.includes("뱃지"));
        };

        const cleanImgs = imgs.filter(filterPromo);
        imgEl = cleanImgs.length > 0 ? cleanImgs[0] : imgs[0];
      }

      let imgUrl = "";
      if (imgEl) {
        imgUrl = imgEl.dataset.src || 
                 imgEl.getAttribute('data-lazy-src') || 
                 imgEl.getAttribute('data-src') || 
                 imgEl.src || "";
      }
      if (imgUrl && imgUrl.startsWith('//')) {
        imgUrl = window.location.protocol + imgUrl;
      }
      imgUrl = imgUrl || "";

      // 5. 가격
      const priceEl = el.querySelector('strong.text__value') || 
                      el.querySelector('span.text__price-cost') ||
                      el.querySelector('span[class*="text__price-cost"]') ||
                      el.querySelector('.price');
      let price = 0;
      if (priceEl) {
        price = parseInt(priceEl.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      } else {
        const matches = el.textContent.match(/([\d,]+)원/);
        if (matches && matches[1]) {
          price = parseInt(matches[1].replace(/,/g, ''), 10) || 0;
        }
      }

      // 6. 리뷰수 / 구매수
      const reviewEl = el.querySelector('span.text__buy-count') || 
                       el.querySelector('span.text__review-count') ||
                       el.querySelector('span[class*="text__score"]') ||
                       el.querySelector('span[class*="review"]');
      let reviewCount = 0;
      if (reviewEl) {
        reviewCount = parseInt(reviewEl.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      } else {
        const matches = el.textContent.match(/구매\s*([\d,]+)/) || el.textContent.match(/리뷰\s*([\d,]+)/) || el.textContent.match(/\(([\d,]+)\)/);
        if (matches && matches[1]) {
          reviewCount = parseInt(matches[1].replace(/,/g, ''), 10) || 0;
        }
      }

      // 7. 평점
      let rating = 5.0;

      // 8. 해외배송 여부 판별
      let isOverseas = false;
      const rawText = el.textContent;
      if (rawText.includes('해외직구') || rawText.includes('해외배송') || rawText.includes('구매대행') || rawText.includes('해외 배송')) {
        isOverseas = true;
      }

      // 9. 광고 여부 판별
      const isAd = !!(el.querySelector('span.badge__ad') || el.querySelector('span[class*="badge__ad"]') || rawText.includes('광고'));

      return {
        id: productId,
        title: title,
        url: url,
        imgUrl: imgUrl,
        price: price,
        reviewCount: reviewCount,
        rating: rating,
        hasRocket: false,
        sellerGrade: '옥션',
        isOverseas: isOverseas,
        isAd: isAd,
        platform: 'auction'
      };
    } catch (e) {
      console.error("Error parsing Auction element: ", e);
      return null;
    }
  },

  // 총 상품 등록 수 추출
  getTotalProducts: function() {
    const el = document.querySelector('span.text__num') || 
               document.querySelector('.search-result-count') ||
               document.querySelector('span[class*="text__num"]');
    if (el) {
      return parseInt(el.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    }
    return 0;
  }
};
