// Naver Shopping SERP HTML Parser Sub-agent
window.NaverParser = {
  // Naver Shopping 상품 리스트 아이템 탐색
  getProductElements: function() {
    // 네이버 쇼핑의 다양한 레이아웃(리스트형, 그리드형)에 매칭되는 셀렉터들
    const selectors = [
      'div[class*="product_item__"]',
      'li[class*="product_item__"]',
      'div[class*="adProduct_item__"]',
      'li[class*="adProduct_item__"]',
      '[class*="product_item__"]',
      '[class*="adProduct_item__"]'
    ];
    
    let elements = [];
    selectors.forEach(selector => {
      const found = document.querySelectorAll(selector);
      if (found.length > 0) {
        elements = elements.concat(Array.from(found));
      }
    });
    
    const uniqueElements = [...new Set(elements)];

    // 부모-자식 관계에 있는 하위 중복 요소 제거 (최상위 상품 카드 요소만 남김)
    const parentFiltered = uniqueElements.filter(el => {
      let parent = el.parentElement;
      while (parent) {
        if (uniqueElements.includes(parent)) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    });

    // 클래스명 정규식 매칭 검사로 실제 메인 상품 카드만 한번 더 필터링 및 "오늘의 프라임상품" 제외
    return parentFiltered.filter(el => {
      if (this.isPrimeProduct(el)) return false;
      return Array.from(el.classList).some(cls => 
        /^(ad)?product_item__[a-zA-Z0-9]+$/i.test(cls)
      );
    });
  },

  isPrimeProduct: function(el) {
    return false;
  },

  // 개별 상품 요소에서 데이터 파싱
  parseElement: function(el) {
    try {
      // 1. 상품명 및 상세 URL
      let titleEl = el.querySelector('a[class*="product_link__"]') || 
                    el.querySelector('a[class*="product_title__"]') ||
                    el.querySelector('a[class*="adProduct_link__"]') ||
                    el.querySelector('a[class*="adProduct_title__"]') ||
                    el.querySelector('a[href*="smartstore.naver.com"]') ||
                    el.querySelector('a[href*="gate.nhn"]') ||
                    el.querySelector('a');
      if (!titleEl) return null;
      
      const title = titleEl.textContent.trim() || titleEl.title || "상품명 없음";
      const url = titleEl.href;
      
      // 2. 고유 ID 추출 (URL 파라미터 또는 텍스트 기반 해시)
      let productId = el.getAttribute('data-product-id');
      if (!productId) {
        const idMatch = url.match(/products\/(\d+)/) || url.match(/nvMid=(\d+)/) || url.match(/id=(\d+)/);
        productId = idMatch ? idMatch[1] : btoa(encodeURIComponent(title)).substring(0, 12);
      }

      // 3. 이미지 URL (데코레이션 배지 및 슈퍼적립 아이콘 필터링 필터링 탑재)
      const imgs = Array.from(el.querySelectorAll('img'));
      let imgEl = null;
      
      if (imgs.length > 0) {
        // thumbnail/thumb 클래스를 부모 컨테이너로 갖는 썸네일 전용 이미지 추출 우선
        const thumbImgs = imgs.filter(img => {
          let parent = img.parentElement;
          while (parent && parent !== el) {
            const className = parent.className || "";
            if (typeof className === 'string' && (className.includes("thumbnail") || className.includes("thumb") || className.includes("img_area") || className.includes("image_area"))) {
              return true;
            }
            parent = parent.parentElement;
          }
          return false;
        });

        // 뱃지, 로고, 적립, 세이브 등 프로모션 노이즈 이미지 제거 필터링
        const filterPromo = (img) => {
          const src = (img.src || "").toLowerCase();
          const className = (img.className || "").toLowerCase();
          const alt = (img.alt || "").toLowerCase();
          return !(src.includes("badge") || src.includes("icon") || src.includes("save") || src.includes("logo") || src.includes("super") || src.includes("accum") ||
                   className.includes("badge") || className.includes("icon") || className.includes("save") || className.includes("logo") ||
                   alt.includes("적립") || alt.includes("슈퍼") || alt.includes("배송") || alt.includes("뱃지"));
        };

        const cleanThumbImgs = thumbImgs.filter(filterPromo);
        if (cleanThumbImgs.length > 0) {
          imgEl = cleanThumbImgs[0];
        } else if (thumbImgs.length > 0) {
          imgEl = thumbImgs[0];
        } else {
          const cleanImgs = imgs.filter(filterPromo);
          imgEl = cleanImgs.length > 0 ? cleanImgs[0] : imgs[0];
        }
      }

      let imgUrl = "";
      if (imgEl) {
        imgUrl = imgEl.dataset.src || 
                 imgEl.getAttribute('data-lazy-src') || 
                 imgEl.getAttribute('data-src') || 
                 imgEl.src || "";
      }
      if (imgUrl && imgUrl.startsWith('data:image/')) {
        imgUrl = (imgEl.dataset.src || imgEl.getAttribute('data-lazy-src') || imgEl.getAttribute('data-src') || "");
      }
      imgUrl = imgUrl || "";

      // 4. 가격
      const priceEl = el.querySelector('span[class*="price_num__"]') || 
                      el.querySelector('span[class*="price_price__"]') ||
                      el.querySelector('strong[class*="adProduct_price__"]') ||
                      el.querySelector('span[class*="adProduct_price__"]') ||
                      el.querySelector('[class*="price_num"]') ||
                      el.querySelector('[class*="price"]');
      let price = 0;
      if (priceEl) {
        price = parseInt(priceEl.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      } else {
        const matches = el.textContent.match(/([\d,]+)원/);
        if (matches && matches[1]) {
          price = parseInt(matches[1].replace(/,/g, ''), 10) || 0;
        }
      }

      // 5. 리뷰수
      const reviewEl = el.querySelector('em[class*="product_num__"]') || 
                       el.querySelector('a[class*="product_etc__"] em') ||
                       el.querySelector('a[class*="adProduct_etc__"] em') ||
                       el.querySelector('[class*="product_num"] em') ||
                       el.querySelector('[class*="adProduct_num"] em') ||
                       el.querySelector('[class*="etc"] em');
      let reviewCount = 0;
      if (reviewEl) {
        reviewCount = parseInt(reviewEl.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      } else {
        const matches = el.textContent.match(/리뷰\s*([\d,]+)/) || el.textContent.match(/구매\s*([\d,]+)/);
        if (matches && matches[1]) {
          reviewCount = parseInt(matches[1].replace(/,/g, ''), 10) || 0;
        }
      }

      // 6. 스토어 등급 (빅파워, 프리미엄, 파워 등)
      let sellerGrade = '일반';
      const gradeEl = el.querySelector('span[class*="product_grade__"]') || 
                      el.querySelector('span[class*="adProduct_grade__"]') ||
                      el.querySelector('[class*="product_grade"]') ||
                      el.querySelector('[class*="adProduct_grade"]');
      if (gradeEl) {
        sellerGrade = gradeEl.textContent.replace(/등급/g, '').trim();
      } else {
        const textContent = el.textContent;
        if (textContent.includes('빅파워')) sellerGrade = '빅파워';
        else if (textContent.includes('프리미엄')) sellerGrade = '프리미엄';
        else if (textContent.includes('파워')) sellerGrade = '파워';
      }

      // 7. 해외배송 여부 판별
      let isOverseas = false;
      const textContent = el.textContent;
      if (textContent.includes('해외직구') || textContent.includes('해외배송') || textContent.includes('구매대행') || textContent.includes('해외 구매대행')) {
        isOverseas = true;
      }

      // 8. 광고 여부 판별
      const isAd = el.className.includes('adProduct') || !!el.querySelector('[class*="adProduct_"]') || textContent.includes('광고+');

      return {
        id: productId,
        title: title,
        url: url,
        imgUrl: imgUrl,
        price: price,
        reviewCount: reviewCount,
        sellerGrade: sellerGrade,
        isOverseas: isOverseas,
        isAd: isAd,
        platform: 'naver'
      };
    } catch (e) {
      console.error("Error parsing Naver element: ", e);
      return null;
    }
  },

  // 총 상품 등록 수 추출
  getTotalProducts: function() {
    const el = document.querySelector('span[class*="subFilter_num__"]') || 
               document.querySelector('.subFilter_num__2x1Jy') ||
               document.querySelector('span[class*="filter_num__"]');
    if (el) {
      return parseInt(el.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    }
    return 0;
  }
};
