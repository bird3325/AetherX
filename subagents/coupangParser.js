// Coupang SERP HTML Parser Sub-agent
window.CoupangParser = {
  // Coupang 상품 리스트 아이템 탐색
  getProductElements: function() {
    const selectors = [
      'li.search-product',
      'li[class*="search-product"]',
      'div[class*="baby-product"]'
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
    return uniqueElements.filter(el => {
      let parent = el.parentElement;
      while (parent) {
        if (uniqueElements.includes(parent)) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    });
  },

  // 개별 상품 요소에서 데이터 파싱
  parseElement: function(el) {
    try {
      // 1. 상세 URL 및 A태그
      const linkEl = el.querySelector('a.search-product-link') || 
                     el.querySelector('a[href*="/vp/products/"]') ||
                     el.querySelector('a');
      if (!linkEl) return null;
      
      const url = linkEl.href;
      
      // 2. 고유 ID
      let productId = el.getAttribute('data-product-id') || el.id;
      if (!productId) {
        const idMatch = url.match(/products\/(\d+)/);
        productId = idMatch ? idMatch[1] : btoa(encodeURIComponent(url)).substring(0, 12);
      }

      // 3. 상품명
      const nameEl = el.querySelector('div.name') || el.querySelector('.title') || el.querySelector('div[class*="name"]');
      const title = nameEl ? nameEl.textContent.trim() : "상품명 없음";

      // 4. 이미지 URL (데코레이션 배지 및 프로모션 노이즈 필터링 탑재)
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

      // 5. 가격
      const priceEl = el.querySelector('strong.price-value') || el.querySelector('.price');
      let price = 0;
      if (priceEl) {
        price = parseInt(priceEl.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      } else {
        const matches = el.textContent.match(/([\d,]+)원/);
        if (matches && matches[1]) {
          price = parseInt(matches[1].replace(/,/g, ''), 10) || 0;
        }
      }

      // 6. 리뷰수
      const reviewEl = el.querySelector('span.rating-total-count') || el.querySelector('.rating-count');
      let reviewCount = 0;
      if (reviewEl) {
        reviewCount = parseInt(reviewEl.textContent.replace(/[^0-9]/g, ''), 10) || 0;
      } else {
        const matches = el.textContent.match(/\(([\d,]+)\)/);
        if (matches && matches[1]) {
          reviewCount = parseInt(matches[1].replace(/,/g, ''), 10) || 0;
        }
      }

      // 7. 평점
      const ratingEl = el.querySelector('em.rating') || el.querySelector('.rating');
      let rating = 5.0;
      if (ratingEl) {
        rating = parseFloat(ratingEl.textContent.trim()) || 5.0;
      }

      // 8. 로켓배송 여부
      const hasRocket = !!(el.querySelector('span.badge.rocket') || 
                           el.querySelector('span.rocket') || 
                           el.querySelector('img[src*="badge-rocket"]') ||
                           el.querySelector('img[src*="rocket"]') ||
                           el.textContent.includes('로켓배송'));

      // 9. 해외배송 여부 판별
      let isOverseas = false;
      const rawText = el.textContent;
      if (rawText.includes('로켓직구') || rawText.includes('해외배송') || rawText.includes('구매대행') || rawText.includes('해외 배송')) {
        isOverseas = true;
      }

      // 10. 광고 여부 판별
      const isAd = el.classList.contains('search-product__ad-badge') || rawText.includes('광고');

      return {
        id: productId,
        title: title,
        url: url,
        imgUrl: imgUrl,
        price: price,
        reviewCount: reviewCount,
        rating: rating,
        hasRocket: hasRocket,
        sellerGrade: hasRocket ? '로켓배송' : '윙(일반)',
        isOverseas: isOverseas,
        isAd: isAd,
        platform: 'coupang'
      };
    } catch (e) {
      console.error("Error parsing Coupang element: ", e);
      return null;
    }
  },

  // 총 상품 등록 수 추출
  getTotalProducts: function() {
    const el = document.querySelector('span.hit') || 
               document.querySelector('.search-result-count') ||
               document.querySelector('div.hit');
    if (el) {
      return parseInt(el.textContent.replace(/[^0-9]/g, ''), 10) || 0;
    }
    return 0;
  }
};
