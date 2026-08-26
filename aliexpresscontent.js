// Aether X isolated-world content script running on aliexpress.com
(function() {
  function startSourcing() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.log("Aether X AliExpress: chrome.storage is not available.");
      return;
    }
    chrome.storage.local.get(["aetherx_sourcing_ali"], (result) => {
      if (!result.aetherx_sourcing_ali) return;

      const sourcing = result.aetherx_sourcing_ali;
      chrome.storage.local.remove(["aetherx_sourcing_ali"]);

      // 전체화면 로딩 오버레이 렌더링
      const loadingOverlay = document.createElement("div");
      loadingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(15, 23, 42, 0.95);
        z-index: 9999999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #FFFFFF;
        font-family: 'Pretendard', -apple-system, sans-serif;
      `;
      loadingOverlay.innerHTML = `
        <div style="font-size: 24px; font-weight: 700; color: #E11D48; margin-bottom: 12px;">Aether X AliExpress Sourcing</div>
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">AliExpress 이미지 검색을 구동 중입니다.</div>
        <div style="font-size: 13px; color: #94A3B8; margin-bottom: 20px;">이미지를 격리 영역에서 디코딩하여 안전하게 주입하고 있습니다...</div>
        <div style="font-size: 11px; color: #64748B;">자동 처리 실패 시 화면에서 직접 Ctrl + V (붙여넣기)를 누르시거나 아래 버튼을 누르세요.</div>
        <button id="aetherx-overlay-fallback" style="margin-top: 15px; background-color: #1E293B; border: 1px solid #475569; color: white; border-radius: 4px; padding: 6px 12px; font-size: 12px; cursor: pointer;">일반 텍스트 검색</button>
      `;
      document.body.appendChild(loadingOverlay);

      let isFinished = false;

      // 성공 메시지 수신 리스너
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'AETHERX_ALI_INJECT_SUCCESS') {
          isFinished = true;
          if (loadingOverlay.parentNode) {
            document.body.removeChild(loadingOverlay);
          }
        }
      });

      document.getElementById("aetherx-overlay-fallback").addEventListener("click", () => {
        isFinished = true;
        fallbackToKeyword(sourcing.title);
      });

      if (sourcing.imgDataUrl) {
        // isolated-world는 CSP 제약을 받지 않으므로 data URL fetch가 100% 안전하게 동작합니다.
        fetch(sourcing.imgDataUrl)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], "sourcing_image.png", { type: "image/png" });
            
            // Main World 스크립트가 로딩될 시간을 벌기 위해 미세한 딜레이 후 postMessage 전송
            setTimeout(() => {
              if (!isFinished) {
                window.postMessage({ type: 'AETHERX_ALI_INJECT_FILE', file: file }, '*');
              }
            }, 200);
          })
          .catch(err => {
            console.error("Aether X AliExpress Isolated: Image fetch failed:", err);
            if (!isFinished) {
              fallbackToKeyword(sourcing.title);
            }
          });

        // 3.5초 내에 주입 성공하지 못하면 자동으로 텍스트 검색으로 전환
        setTimeout(() => {
          if (!isFinished) {
            console.log("Aether X AliExpress Isolated: Injection timeout, falling back to keyword search.");
            fallbackToKeyword(sourcing.title);
          }
        }, 3500);
      } else {
        fallbackToKeyword(sourcing.title);
      }

      function fallbackToKeyword(titleText) {
        isFinished = true;
        if (loadingOverlay.parentNode) {
          document.body.removeChild(loadingOverlay);
        }
        window.location.href = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(titleText)}`;
      }
    });
  }

  // -------------------------------------------------------------
  // AliExpress Search Results Page Overlay Rendering & Orchestration
  // -------------------------------------------------------------

  let isAetherxEnabled = true;
  let pageObserver = null;
  let productObserver = null;

  // AliExpress Parser
  const AliExpressParser = {
    getProductElements: function() {
      const cards = [];
      const links = document.querySelectorAll('a[href*="/item/"]');
      links.forEach(link => {
        const card = link.closest('div[class*="search-item-card"]') || 
                     link.closest('div[class*="list--galleryItem--"]') || 
                     link.closest('div[class*="product-card"]') ||
                     link.closest('div[class*="item"]') ||
                     link.parentElement;
        if (card && !cards.includes(card) && card.tagName !== 'A') {
          // 오른쪽 사이드바/추천 영역 상품 제외 검사
          let isSidebar = false;
          let parent = card.parentElement;
          while (parent && parent !== document.body) {
            const className = (parent.className || "").toString().toLowerCase();
            const idName = (parent.id || "").toString().toLowerCase();
            const tagName = parent.tagName.toLowerCase();
            if (tagName === 'aside' ||
                className.includes('sidebar') || 
                className.includes('aside') || 
                className.includes('right') || 
                className.includes('recommend') ||
                className.includes('cart') ||
                className.includes('mart') ||
                className.includes('superbuy') ||
                className.includes('bundle') ||
                className.includes('deal') ||
                className.includes('checkout') ||
                idName.includes('sidebar') ||
                idName.includes('aside') ||
                idName.includes('right') ||
                idName.includes('cart') ||
                idName.includes('mart') ||
                idName.includes('superbuy') ||
                idName.includes('bundle') ||
                idName.includes('deal') ||
                idName.includes('checkout')) {
              isSidebar = true;
              break;
            }
            parent = parent.parentElement;
          }
          
          if (!isSidebar) {
            cards.push(card);
          }
        }
      });
      return cards;
    },

    parseElement: function(el) {
      try {
        const linkEl = el.querySelector('a[href*="/item/"]') || el.querySelector('a');
        if (!linkEl) return null;

        const url = linkEl.href;
        const idMatch = url.match(/item\/(\d+)\.html/);
        const productId = idMatch ? idMatch[1] : btoa(encodeURIComponent(url)).substring(0, 12);

        // Title
        const nameEl = el.querySelector('h1') || el.querySelector('h3') || el.querySelector('div[class*="title"]') || el.querySelector('div[class*="name"]');
        let title = nameEl ? nameEl.textContent.trim() : "";
        if (!title) {
          const img = el.querySelector('img');
          if (img && img.alt) {
            title = img.alt.trim();
          }
        }
        title = title || "상품명 없음";

        // Image
        const img = el.querySelector('img');
        const imgUrl = img ? (img.dataset.src || img.getAttribute('data-lazy-src') || img.src || "") : "";

        // Price
        const priceEl = el.querySelector('span[class*="price-value"]') || el.querySelector('div[class*="price--"]') || el.querySelector('div[class*="multi--price-sale--"]');
        let price = 0;
        if (priceEl) {
          price = parseInt(priceEl.textContent.replace(/[^0-9]/g, ''), 10) || 0;
        }

        // Review Count
        const reviewEl = el.querySelector('span[class*="rating-count"]') || el.querySelector('span[class*="multi--trade--"]') || el.querySelector('a[class*="rating-link"]');
        let reviewCount = 0;
        if (reviewEl) {
          reviewCount = parseInt(reviewEl.textContent.replace(/[^0-9]/g, ''), 10) || 0;
        }

        return {
          id: productId,
          title: title,
          url: url,
          imgUrl: imgUrl,
          price: price,
          reviewCount: reviewCount,
          rating: 4.8,
          hasRocket: false,
          sellerGrade: '해외셀러',
          isOverseas: true,
          isAd: false,
          platform: 'aliexpress'
        };
      } catch (e) {
        console.error("AliExpress parse error:", e);
        return null;
      }
    }
  };

  function renderAliExpressOverlay(product, cardEl) {
    if (cardEl.querySelector('.aetherx-clean-overlay')) return;

    const overlayDiv = document.createElement('div');
    overlayDiv.className = 'aetherx-clean-overlay aetherx-aliexpress-overlay';

    // Calculation (Sales, margin, etc.)
    const minSales = Math.round(product.reviewCount * 1.5) + 1;
    const maxSales = Math.round(product.reviewCount * 2.5) + 3;
    const confidence = 85;
    const margin = 45;
    const marginColor = '#059669';

    overlayDiv.innerHTML = `
      <div class="aetherx-overlay-row" style="display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 4px !important; width: 100% !important; border-bottom: 1px solid #E2E8F0 !important; padding-bottom: 6px !important; margin-bottom: 4px !important; align-items: center !important;">
        <div class="aetherx-metric-item aetherx-tooltip-container" style="white-space: nowrap !important; justify-content: center !important; border-right: 1px solid #E2E8F0 !important; padding-right: 4px !important;">
          <span style="font-size: 11px !important; font-weight: 500 !important; color: #475569 !important; line-height: 1.2 !important; display: flex !important; align-items: center !important; gap: 2px !important;">📊 <b style="color: #0F172A !important; font-weight: 700 !important;">${minSales}~${maxSales}개</b> <span style="font-size: 9px !important; color: #94A3B8 !important;">(${confidence}%)</span></span>
        </div>
        <div class="aetherx-metric-item aetherx-tooltip-container" style="white-space: nowrap !important; justify-content: center !important; border-right: 1px solid #E2E8F0 !important; padding-right: 4px !important;">
          <span style="font-size: 11px !important; font-weight: 500 !important; color: #475569 !important; line-height: 1.2 !important;">마진: <b style="color: ${marginColor} !important; font-weight: 700 !important;">${margin}%</b></span>
        </div>
        <div class="aetherx-metric-item aetherx-tooltip-container" style="white-space: nowrap !important; justify-content: center !important;">
          <span style="font-size: 11px !important; font-weight: 500 !important; color: #475569 !important; line-height: 1.2 !important;">리뷰: <b style="color: #0F172A !important; font-weight: 700 !important;">+${product.reviewCount}개</b></span>
        </div>
      </div>
      <div class="aetherx-overlay-row" style="display: flex !important; justify-content: space-between !important; align-items: center !important; width: 100% !important; margin-top: 4px !important; gap: 4px !important;">
        <div style="display: flex !important; gap: 4px !important; align-items: center !important;">
          <span class="aetherx-item-pill-status aetherx-item-pill-status-coupang" style="background-color: #FF4747 !important;">AliExpress</span>
        </div>
        <div style="display: flex !important; gap: 4px !important; align-items: center !important; margin-left: auto !important;">
          <button class="aetherx-btn-search" style="background-color: #2563EB !important; color: white !important; white-space: nowrap !important; height: 20px !important; padding: 0 6px !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 10px !important; border-radius: 4px !important; border: none !important; font-weight: 600 !important; cursor: pointer !important;">🔍 소싱</button>
          <button class="aetherx-btn-crop" style="background-color: #8B5CF6 !important; color: white !important; white-space: nowrap !important; height: 20px !important; padding: 0 6px !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 10px !important; border-radius: 4px !important; border: none !important; font-weight: 600 !important; cursor: pointer !important;">✂️ 영역</button>
          <button class="aetherx-btn-add" style="background-color: #0F172A !important; color: white !important; white-space: nowrap !important; height: 20px !important; width: 20px !important; display: flex !important; align-items: center !important; justify-content: center !important; font-size: 11px !important; font-weight: 700 !important; border-radius: 4px !important; padding: 0 !important; border: none !important; cursor: pointer !important;">+</button>
        </div>
      </div>
    `;

    // 이미지 컨테이너 직후에 삽입하여 아래 이미지를 가리지 않도록 위치 위로 조정
    const imgEl = cardEl.querySelector('img');
    if (imgEl) {
      let target = imgEl;
      while (target.parentElement && target.parentElement !== cardEl) {
        target = target.parentElement;
      }
      if (target && target.nextSibling) {
        cardEl.insertBefore(overlayDiv, target.nextSibling);
      } else {
        cardEl.appendChild(overlayDiv);
      }
    } else {
      cardEl.appendChild(overlayDiv);
    }
  }

  function handleAddCompareAli(product) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      alert("비교함 스토리지에 접근할 수 없습니다.");
      return;
    }
    chrome.storage.local.get(["aetherx_compare_list"], (result) => {
      let compareList = result.aetherx_compare_list || [];
      if (compareList.some(item => item.id === product.id)) {
        alert("이미 비교함에 추가된 상품입니다.");
        return;
      }
      if (compareList.length >= 5) {
        alert("비교함은 최대 5개 상품까지만 담을 수 있습니다.");
        return;
      }
      compareList.push(product);
      chrome.storage.local.set({ aetherx_compare_list: compareList });
    });
  }

  function initAliExpressPageElements() {
    if (!isAetherxEnabled) return;

    const productElements = AliExpressParser.getProductElements();
    if (productElements.length > 0) {
      if (pageObserver) pageObserver.disconnect();
      try {
        productElements.forEach(el => {
          if (el.getAttribute('data-aetherx-observed') !== 'true') {
            productObserver.observe(el);
            el.setAttribute('data-aetherx-observed', 'true');
          }
        });
      } finally {
        if (pageObserver) {
          pageObserver.observe(document.body, {
            childList: true,
            subtree: true
          });
        }
      }
    }
  }

  function setupAliExpressSearchPage() {
    // 알리 익스프레스 검색 페이지 분석 필터바 및 필터 정보창(오버레이) 비활성화
    return;
  }

  // 페이지 로드가 완전히 끝나고 스크립트들이 바인딩될 수 있도록 대기
  if (document.readyState === "complete") {
    setTimeout(() => {
      startSourcing();
      setupAliExpressSearchPage();
    }, 500);
  } else {
    window.addEventListener("load", () => {
      setTimeout(() => {
        startSourcing();
        setupAliExpressSearchPage();
      }, 500);
    });
  }
})();
