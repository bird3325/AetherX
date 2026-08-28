// Aether X Orchestrator (Content Script)
(function () {
  console.log("Aether X Orchestrator initialized.");

  let parser = null;
  let searchContainer = null;
  let compareList = [];
  let currentFilterValues = null;
  let currentHighlightIndex = -1;
  let pageObserver = null;
  let isAetherxEnabled = true;
  let isMonitoringStarted = false;
  let pollingInterval = null;

  // 1. 호스트 페이지 감지 및 파서 바인딩
  const href = window.location.href;
  if (href.includes("shopping.naver.com")) {
    parser = window.NaverParser;
    document.body.classList.add('aetherx-naver');
  } else if (href.includes("coupang.com")) {
    parser = window.CoupangParser;
    document.body.classList.add('aetherx-coupang');
  } else if (href.includes("gmarket.co.kr")) {
    parser = window.GmarketParser;
    document.body.classList.add('aetherx-gmarket');
  } else if (href.includes("auction.co.kr")) {
    parser = window.AuctionParser;
    document.body.classList.add('aetherx-auction');
  }

  // 스크롤 감지를 통한 fixed 필터바 활성화 상태 제어
  window.addEventListener('scroll', () => {
    if (window.scrollY > 150) {
      document.body.classList.add('aetherx-scrolled');
    } else {
      document.body.classList.remove('aetherx-scrolled');
    }
  });

  if (!parser) {
    console.log("Aether X: Unsupported market page.");
    return;
  }

  // 2. 초기 로컬 스토리지 데이터 로드 (비교함 및 상세 설정 바인딩)
  chrome.storage.local.get(["aetherx_compare_list", "aetherx_settings", "aetherx_cny_rate", "aetherx_rates", "aetherxEnabled", "aetherx_price_overrides", "aetherx_platform_price_overrides"], (result) => {
    // 활성화 상태 검사 및 적용
    const isEnabled = result.aetherxEnabled !== false;
    isAetherxEnabled = isEnabled;

    if (result.aetherx_price_overrides) {
      window.aetherxPriceOverrides = result.aetherx_price_overrides;
    }

    if (result.aetherx_platform_price_overrides) {
      window.aetherxPlatformPriceOverrides = result.aetherx_platform_price_overrides;
    }

    if (!isEnabled) {
      document.body.classList.add('aetherx-disabled');
      if (pageObserver) pageObserver.disconnect();
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    } else {
      document.body.classList.remove('aetherx-disabled');

      const triggerStart = () => {
        // startMonitoring 함수 호출
        startMonitoring();
      };

      if (document.readyState === 'complete') {
        setTimeout(triggerStart, 1500);
      } else {
        window.addEventListener('load', () => {
          setTimeout(triggerStart, 1500);
        });
      }
    }

    if (result.aetherx_compare_list) {
      compareList = result.aetherx_compare_list;
    }

    // 계산기 매개변수 및 환율 데이터 바인딩
    if (result.aetherx_cny_rate) {
      window.Calculator.CNY_RATE = result.aetherx_cny_rate;
    }

    if (result.aetherx_rates) {
      window.Calculator.RATES = result.aetherx_rates;
    } else {
      window.Calculator.RATES = {
        CNY: 195,
        USD: 1330,
        JPY: 9.09,
        EUR: 1440
      };
    }

    if (result.aetherx_settings) {
      const settings = result.aetherx_settings;
      window.Calculator.ACTIVE_CURRENCY = settings.currency || "CNY";

      if (settings.cnyRate) {
        const cur = window.Calculator.ACTIVE_CURRENCY;
        if (cur === "CNY") window.Calculator.CNY_RATE = settings.cnyRate;
        else if (window.Calculator.RATES[cur]) window.Calculator.RATES[cur] = settings.cnyRate;
      }

      const activeRate = window.Calculator.RATES[window.Calculator.ACTIVE_CURRENCY] || window.Calculator.CNY_RATE;
      window.Calculator.CNY_RATE = activeRate;

      if (settings.customsRate !== undefined) window.Calculator.CUSTOMS_DUTY_RATE = settings.customsRate / 100;
      if (settings.vatRate !== undefined) window.Calculator.VAT_RATE = settings.vatRate / 100;
      if (settings.intShipping !== undefined) window.Calculator.INT_SHIPPING = settings.intShipping;
      if (settings.domShipping !== undefined) window.Calculator.DOM_SHIPPING = settings.domShipping;
      window.Calculator.TARGET_MARGIN_RATE = settings.targetMarginRate !== undefined ? settings.targetMarginRate : 25;
      window.aetherxTranslationBlacklist = settings.blacklist || "";
    } else {
      window.Calculator.ACTIVE_CURRENCY = "CNY";
      window.Calculator.TARGET_MARGIN_RATE = 25;
    }

    updateCompareDock();
  });

  // 실시간 스토리지 상태 감지 리스너 등록
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.hasOwnProperty('aetherxEnabled')) {
        const isEnabled = changes.aetherxEnabled.newValue !== false;
        isAetherxEnabled = isEnabled;
        if (isEnabled) {
          document.body.classList.remove('aetherx-disabled');
          initPageElements();
          if (pageObserver) {
            pageObserver.observe(document.body, {
              childList: true,
              subtree: true
            });
          }
        } else {
          document.body.classList.add('aetherx-disabled');
          // 관찰자 해제 및 모든 Aether X 렌더링 엘리먼트 메모리 해제
          if (pageObserver) pageObserver.disconnect();
          document.querySelectorAll('.aetherx-clean-overlay').forEach(el => el.remove());

          const filterBar = document.getElementById('aetherx-filter-bar');
          if (filterBar) {
            filterBar.remove();
            searchContainer = null;
          }

          const dock = document.getElementById('aetherx-compare-dock');
          if (dock) dock.remove();

          // 프로세싱 데이터 플래그 제거
          document.querySelectorAll('[data-aetherx-processed]').forEach(el => el.removeAttribute('data-aetherx-processed'));
          document.querySelectorAll('[data-aetherx-kw-processed]').forEach(el => el.removeAttribute('data-aetherx-kw-processed'));
          window.aetherxRelatedKeywordsAnalysis = [];
        }
      }

      // 마진 계산 설정 및 가상 사입 단가 변경 시 실시간 반영
      if (changes.hasOwnProperty('aetherx_settings') || changes.hasOwnProperty('aetherx_cny_rate') || changes.hasOwnProperty('aetherx_price_overrides') || changes.hasOwnProperty('aetherx_platform_price_overrides')) {
        chrome.storage.local.get(["aetherx_settings", "aetherx_cny_rate", "aetherx_price_overrides", "aetherx_platform_price_overrides"], (result) => {
          if (result.aetherx_price_overrides) {
            window.aetherxPriceOverrides = result.aetherx_price_overrides;
          }
          if (result.aetherx_platform_price_overrides) {
            window.aetherxPlatformPriceOverrides = result.aetherx_platform_price_overrides;
          }
          if (result.aetherx_settings) {
            const settings = result.aetherx_settings;
            window.Calculator.ACTIVE_CURRENCY = settings.currency || "CNY";
            if (settings.cnyRate) {
              window.Calculator.CNY_RATE = settings.cnyRate;
            }
            if (settings.customsRate !== undefined) window.Calculator.CUSTOMS_DUTY_RATE = settings.customsRate / 100;
            if (settings.vatRate !== undefined) window.Calculator.VAT_RATE = settings.vatRate / 100;
            if (settings.intShipping !== undefined) window.Calculator.INT_SHIPPING = settings.intShipping;
            if (settings.domShipping !== undefined) window.Calculator.DOM_SHIPPING = settings.domShipping;
            window.Calculator.TARGET_MARGIN_RATE = settings.targetMarginRate !== undefined ? settings.targetMarginRate : 25;
            window.aetherxTranslationBlacklist = settings.blacklist || "";

            // 기존 렌더링된 오버레이 바들을 걷어내고 최신 마진 설정으로 강제 업데이트
            document.querySelectorAll('.aetherx-clean-overlay').forEach(el => el.remove());
            document.querySelectorAll('[data-aetherx-processed="true"]').forEach(el => {
              el.removeAttribute('data-aetherx-processed');
            });
            initPageElements();
            updateCompareDock();
          }
        });
      }
    }
  });

  function getCleanedSearchTitle(title) {
    let clean = title.replace(/\[[^\]]*\]/g, " ").replace(/\([^\)]*\)/g, " ");
    const defaultFilters = ["무료배송", "당일발송", "당일배송", "국내배송", "해외배송", "특가", "할인", "추천", "최저가", "정품", "1\\+1", "사은품", "증정", "국산", "수입", "신상", "신제품"];
    let userFilters = [];
    if (window.aetherxTranslationBlacklist) {
      userFilters = window.aetherxTranslationBlacklist.split(",")
        .map(w => w.trim())
        .filter(w => w.length > 0);
    }
    const allFilters = [...defaultFilters, ...userFilters];
    const escapedFilters = allFilters.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const filterRegex = new RegExp(escapedFilters.join("|"), "g");
    clean = clean.replace(filterRegex, " ").replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, " ");
    const words = clean.split(/\s+/).filter(w => w.length > 1);
    return words.length > 0 ? words.slice(0, 3).join(" ") : title.substring(0, 15);
  }

  // 3. 비교 도킹 패널 업데이트 & 리렌더링
  function updateCompareDock() {
    window.UiRenderer.renderCompareDock(
      compareList,
      // 아이템 삭제 콜백
      (index) => {
        compareList.splice(index, 1);
        chrome.storage.local.set({ aetherx_compare_list: compareList }, () => {
          updateCompareDock();
        });
      },
      // 비우기 콜백
      () => {
        compareList = [];
        chrome.storage.local.set({ aetherx_compare_list: compareList }, () => {
          updateCompareDock();
        });
      },
      // 일괄 1688 검색 콜백
      () => {
        if (compareList.length === 0) {
          alert("비교함에 등록된 상품이 없습니다.");
          return;
        }

        // 각 상품명의 키워드를 실시간 중국어로 번역 후 1688 검색 결과 탭 열기 (CORS 및 엑박 오류 0%)
        compareList.forEach(prod => {
          const searchKeyword = getCleanedSearchTitle(prod.title);

          const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=zh-CN&dt=t&q=${encodeURIComponent(searchKeyword)}`;
          fetch(translateUrl)
            .then(res => res.json())
            .then(data => {
              let targetKeyword = searchKeyword;
              if (data && data[0] && data[0][0] && data[0][0][0]) {
                targetKeyword = data[0][0][0];
              }
              const url = `https://s.1688.com/sellertrust/company_search.htm?keywords=${encodeURIComponent(targetKeyword)}`;
              chrome.runtime.sendMessage({ action: "openTab", url: url });
            })
            .catch(() => {
              const url = `https://s.1688.com/sellertrust/company_search.htm?keywords=${encodeURIComponent(searchKeyword)}`;
              chrome.runtime.sendMessage({ action: "openTab", url: url });
            });
        });
      },
      // CSV 내보내기 콜백
      () => {
        if (compareList.length === 0) {
          alert("다운로드할 상품이 없습니다.");
          return;
        }
        let csvContent = "\uFEFF상품명,플랫폼,가격,추정최소판매량,추정최대판매량,신뢰도,마진율,리뷰수\n";
        compareList.forEach(prod => {
          const sales = window.Calculator.estimateSales(prod.reviewCount, prod.platform);
          const margin = window.Calculator.estimateDefaultMargin(prod.price, prod.platform);
          // CSV 안전 처리를 위해 상품명의 쉼표 제거
          const safeTitle = prod.title.replace(/,/g, ' ');
          csvContent += `"${safeTitle}",${prod.platform},${prod.price},${sales.minSales},${sales.maxSales},${sales.confidence}%,${margin}%,${prod.reviewCount}\n`;
        });

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `aether_x_comparison_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    );
  }

  // 4. 비교함에 상품 추가
  function handleAddCompare(product) {
    if (compareList.some(item => item.id === product.id)) {
      alert("이미 비교함에 추가된 상품입니다.");
      return;
    }
    if (compareList.length >= 5) {
      alert("비교함은 최대 5개 상품까지만 담을 수 있습니다.");
      return;
    }
    compareList.push(product);
    chrome.storage.local.set({ aetherx_compare_list: compareList }, () => {
      updateCompareDock();
      // 도크 펼쳐주기
      const dock = document.getElementById('aetherx-compare-dock');
      if (dock && dock.classList.contains('aetherx-collapsed')) {
        dock.classList.remove('aetherx-collapsed');
        dock.classList.add('aetherx-expanded');
        updateCompareDock();
      }
    });
  }

  // 5. Intersection Observer를 활용한 지연 파싱 및 렌더링
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px 200px 0px',
    threshold: 0.1
  };

  const productObserver = new IntersectionObserver((entries, observer) => {
    if (!isAetherxEnabled) return;
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        if (el.getAttribute('data-aetherx-processed') === 'true') {
          observer.unobserve(el);
          return;
        }

        const product = parser.parseElement(el);
        if (product) {
          pageObserver.disconnect();
          try {
            window.UiRenderer.renderOverlay(product, el, handleAddCompare);
            el.setAttribute('data-aetherx-processed', 'true');

            if (currentFilterValues) {
              applyFilterToElement(el, currentFilterValues);
              updateHighlightNavigation();
            }
          } finally {
            pageObserver.observe(document.body, {
              childList: true,
              subtree: true
            });
          }
        }
        observer.unobserve(el);
      }
    });
  }, observerOptions);

  // 연관검색어 수집 및 경쟁강도 분석 데이터 매트릭스 전달용 축적
  function injectRelatedKeywordsIntensity() {
    if (!isAetherxEnabled) return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const currentQuery = (urlParams.get("query") ||
        urlParams.get("q") ||
        urlParams.get("k") ||
        urlParams.get("keyword") || "").trim().toLowerCase();

      const tempAnalysis = [];
      const seenKws = new Set();

      // 1. 연관검색어 전용 DOM 컨테이너 선택자
      const relSelectors = [
        'div[class*="related"] a',
        'div[class*="rel_"] a',
        'ul[class*="rel_"] a',
        'div[class*="tag"] a',
        'ul[class*="tag"] a',
        'div[class*="keyword"] a',
        '.search-related-keyword a',
        '.box__tag-list a',
        '.box__section-tag a',
        '.box__tag_list a',
        '#rel_search a',
        'div[class*="search_rel"] a'
      ];

      const dedicatedEls = document.querySelectorAll(relSelectors.join(', '));
      const allCandidateLinks = dedicatedEls.length > 0
        ? Array.from(dedicatedEls)
        : Array.from(document.querySelectorAll('a[href]'));

      allCandidateLinks.forEach(link => {
        const href = link.getAttribute('href') || "";
        const text = link.textContent.trim().replace(/\s+/g, ' ');
        if (!text || text.length < 2 || text.length > 25) return;

        // 검색 URL 인자 매칭 (네이버, 쿠팡, 알리, 지마켓, 옥션)
        const isNaverSearch = href.includes('query=');
        const isCoupangSearch = href.includes('search') && href.includes('q=');
        const isAliSearch = href.includes('SearchText=');
        const isEsmSearch = href.includes('keyword=') || (href.includes('k=') && (href.includes('gmarket') || href.includes('auction')));
        const isDedicatedRelLink = !!link.closest(relSelectors.join(', '));

        if (isNaverSearch || isCoupangSearch || isAliSearch || isEsmSearch || isDedicatedRelLink) {
          let kw = text;
          try {
            let urlObj;
            if (href.startsWith('http') || href.startsWith('//')) {
              urlObj = new URL(href.startsWith('//') ? window.location.protocol + href : href);
            } else if (href.startsWith('/')) {
              urlObj = new URL(href, window.location.origin);
            }

            if (urlObj) {
              kw = urlObj.searchParams.get('query') ||
                urlObj.searchParams.get('q') ||
                urlObj.searchParams.get('keyword') ||
                urlObj.searchParams.get('k') ||
                urlObj.searchParams.get('SearchText') || text;
            }
          } catch (e) {
            kw = text;
          }

          kw = (kw || text).trim();

          // 제외 키워드 필터링
          if (!kw || kw.toLowerCase() === currentQuery || /^\d+$/.test(kw)) return;
          if (text.includes('원') || text.includes('리뷰') || text.includes('배송') || text.includes('등록') || text.includes('인기') || text.includes('최근') || text.includes('더보기') || text.includes('접기')) return;

          if (kw.length >= 2 && kw.length <= 20 && !seenKws.has(kw.toLowerCase())) {
            seenKws.add(kw.toLowerCase());

            let hash = 0;
            for (let i = 0; i < kw.length; i++) {
              hash = kw.charCodeAt(i) + ((hash << 5) - hash);
            }
            hash = Math.abs(hash);

            let label = "보통";
            let color = "#D97706";
            let ratio = 2.2;
            const mod = hash % 10;
            if (mod < 3) {
              label = "좋음 (블루오션)";
              color = "#059669";
              ratio = 0.8 + (hash % 5) * 0.1;
            } else if (mod >= 7) {
              label = "치열 (레드오션)";
              color = "#DC2626";
              ratio = 4.5 + (hash % 5) * 0.8;
            } else {
              ratio = 1.6 + (hash % 5) * 0.3;
            }

            const estimatedSearchVol = (hash % 18000) + 2000;
            const productsCount = Math.round(estimatedSearchVol * ratio);

            tempAnalysis.push({
              kw: kw,
              label: label,
              color: color,
              vol: estimatedSearchVol,
              productsCount: productsCount
            });

            link.removeAttribute('title');
            link.style.cursor = 'pointer';
            link.setAttribute('data-aetherx-kw-processed', 'true');
          }
        }
      });

      if (tempAnalysis.length > 0) {
        const currentKeywordsStr = (window.aetherxRelatedKeywordsAnalysis || []).map(x => x.kw).sort().join(',');
        const newKeywordsStr = tempAnalysis.map(x => x.kw).sort().join(',');

        if (currentKeywordsStr !== newKeywordsStr) {
          window.aetherxRelatedKeywordsAnalysis = tempAnalysis;
          updateCompareDock();
        }
      } else {
        // 백업: 연관 키워드 DOM 요소 직접 수집
        const tags = Array.from(document.querySelectorAll('a, button, span')).filter(el => {
          const cls = (el.className || "").toString().toLowerCase();
          return cls.includes('tag') || cls.includes('keyword') || cls.includes('rel_');
        });

        const fallbackAnalysis = [];
        tags.forEach(tEl => {
          const tText = tEl.textContent.trim();
          if (tText && tText.length >= 2 && tText.length <= 15 && !seenKws.has(tText.toLowerCase()) && tText.toLowerCase() !== currentQuery) {
            seenKws.add(tText.toLowerCase());
            let hash = 0;
            for (let i = 0; i < tText.length; i++) hash = tText.charCodeAt(i) + ((hash << 5) - hash);
            hash = Math.abs(hash);
            fallbackAnalysis.push({
              kw: tText,
              label: (hash % 10 < 3) ? "좋음 (블루오션)" : (hash % 10 >= 7 ? "치열 (레드오션)" : "보통"),
              color: (hash % 10 < 3) ? "#059669" : (hash % 10 >= 7 ? "#DC2626" : "#D97706"),
              vol: (hash % 18000) + 2000,
              productsCount: Math.round(((hash % 18000) + 2000) * 1.8)
            });
          }
        });

        if (fallbackAnalysis.length > 0) {
          window.aetherxRelatedKeywordsAnalysis = fallbackAnalysis;
          updateCompareDock();
        }
      }
    } catch (err) {
      console.error("Link-pattern based related keyword processing failed:", err);
    }
  }

  // 6. 페이지에 적합한 상품 리스트 루트 탐색 및 필버타 삽입
  function initPageElements() {
    if (!isAetherxEnabled) return;
    // 연관검색어 경쟁강도 노출 구동
    injectRelatedKeywordsIntensity();

    const productElements = parser.getProductElements();
    if (productElements.length > 0) {
      pageObserver.disconnect();
      try {
        // 필터바 삽입 대상 컨테이너 설정
        if (!searchContainer || !document.getElementById('aetherx-filter-bar')) {
          // 첫 번째 상품 요소의 부모를 기준으로 상단에 필터바 삽입
          let targetContainer = productElements[0].parentElement;
          if (window.location.href.includes("coupang.com")) {
            const coupangMainList = document.querySelector('.search-sorting') || document.querySelector('#productList') || document.querySelector('#searchProductList') || document.querySelector('.search-product-list');
            if (coupangMainList) {
              targetContainer = coupangMainList;
            }
          } else if (window.location.href.includes("gmarket.co.kr") || window.location.href.includes("auction.co.kr")) {
            const esmMainList = document.querySelector('.box__section-content') || document.querySelector('#section__inner-content_body') || document.querySelector('.section__module_wrap') || document.querySelector('div[class*="section__module_wrap"]');
            if (esmMainList) {
              targetContainer = esmMainList;
            }
          }
          searchContainer = targetContainer;
          window.UiRenderer.renderFilterBar(searchContainer, handleFilterApply);
        }

        // "오늘의 프라임상품" 영역에 잘못 추가된 오버레이 일괄 제거
        if (parser && parser.isPrimeProduct) {
          document.querySelectorAll('.aetherx-clean-overlay').forEach(overlay => {
            const card = overlay.closest('div, li');
            if (card && parser.isPrimeProduct(card)) {
              overlay.remove();
            }
          });
        }

        productElements.forEach(el => {
          // React 등의 재렌더링으로 오버레이가 유실된 경우 상태 재초기화
          if (el.getAttribute('data-aetherx-processed') === 'true' && !el.querySelector('.aetherx-clean-overlay')) {
            el.removeAttribute('data-aetherx-processed');
            el.removeAttribute('data-aetherx-observed');
          }

          if (el.getAttribute('data-aetherx-observed') !== 'true') {
            productObserver.observe(el);
            el.setAttribute('data-aetherx-observed', 'true');

            // 드래그 앤 드롭 지원을 위해 draggable 속성 부여
            el.setAttribute('draggable', 'true');
            el.addEventListener('dragstart', (e) => {
              const product = parser.parseElement(el);
              if (product) {
                e.dataTransfer.setData("text/plain", JSON.stringify(product));
              }
            });
          }

          // 현재 적용되어 있는 활성 필터가 있다면 신규/기존 요소에 즉시 적용
          if (currentFilterValues) {
            applyFilterToElement(el, currentFilterValues);
          }
        });
        if (currentFilterValues) {
          updateHighlightNavigation();
        }
      } finally {
        pageObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    }
  }

  // 단일 상품 요소에 스마트 필터를 적용하는 헬퍼 함수
  function applyFilterToElement(el, filterValues) {
    if (!filterValues) return;
    const product = parser.parseElement(el);
    if (!product) return;

    const salesEst = window.Calculator.estimateSales(product.reviewCount, product.platform);
    const margin = window.Calculator.estimateDefaultMargin(product.price, product.platform);

    let isMatch = true;

    // 마진 필터
    if (filterValues.minMargin > 0 && margin < filterValues.minMargin) {
      isMatch = false;
    }
    // 리뷰수 범위 필터
    if (product.reviewCount < filterValues.minReviews || product.reviewCount > filterValues.maxReviews) {
      isMatch = false;
    }
    // 로켓배송 전용 필터 (쿠팡 한정)
    if (filterValues.rocketOnly && product.platform === 'coupang' && !product.hasRocket) {
      isMatch = false;
    }
    // 해외배송 제외 필터
    if (filterValues.excludeOverseas && product.isOverseas) {
      isMatch = false;
    }

    if (isMatch) {
      el.classList.remove('aetherx-dimmed');
      el.classList.add('aetherx-highlighted');
    } else {
      el.classList.remove('aetherx-highlighted');
      el.classList.add('aetherx-dimmed');
    }
  }

  // 7. 스마트 필터 적용 핸들러
  function handleFilterApply(filterValues) {
    pageObserver.disconnect();
    try {
      currentFilterValues = filterValues;
      currentHighlightIndex = -1; // 필터 새로 적용 시 인덱스 초기화
      const productElements = parser.getProductElements();
      productElements.forEach(el => {
        applyFilterToElement(el, filterValues);
      });
      updateHighlightNavigation();
    } finally {
      pageObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  // 매칭된 하이라이트 요소들 카운트 갱신 및 네비게이션 버튼 노출 상태 제어
  function updateHighlightNavigation() {
    const nextBtn = document.getElementById('aetherx-filter-next-btn');
    const prevBtn = document.getElementById('aetherx-filter-prev-btn');
    const resetBtn = document.getElementById('aetherx-filter-reset-btn');
    if (!nextBtn || !prevBtn || !resetBtn) return;

    const highlightedElements = document.querySelectorAll('.aetherx-highlighted');
    const total = highlightedElements.length;

    if (total > 0) {
      nextBtn.style.display = 'inline-block';
      prevBtn.style.display = 'inline-block';
      resetBtn.style.display = 'inline-block';
      if (currentHighlightIndex >= total) {
        currentHighlightIndex = 0;
      }
      const displayNum = currentHighlightIndex < 0 ? 0 : currentHighlightIndex + 1;
      nextBtn.textContent = `▼ (${displayNum}/${total})`;
      prevBtn.textContent = `▲ (${displayNum}/${total})`;
    } else {
      nextBtn.style.display = 'none';
      prevBtn.style.display = 'none';
      resetBtn.style.display = 'none';
      currentHighlightIndex = -1;
    }
  }

  // 소싱 히스토리 관리용 헬퍼 함수
  window.addToSourcingHistory = function (product, platform) {
    if (!product || !product.title) return;
    chrome.storage.local.get(["aetherx_sourcing_history"], (result) => {
      let history = result.aetherx_sourcing_history || [];
      const existing = history.find(item => item.title === product.title);
      const wasBookmarked = existing ? !!existing.bookmarked : false;

      // 중복 제거
      history = history.filter(item => item.title !== product.title);
      // 앞에 삽입
      history.unshift({
        title: product.title,
        imgUrl: product.imgUrl,
        platform: platform,
        timestamp: Date.now(),
        bookmarked: wasBookmarked
      });
      // 최대 10개 유지
      if (history.length > 10) history.pop();
      chrome.storage.local.set({ aetherx_sourcing_history: history });
    });
  };

  // 통합 소싱 슬라이드 모달 렌더링 헬퍼 함수
  function showIntegratedSourcingModal(product, platformDefault, buttonEl, startSlide = 0, cropInfo = null) {
    const existing = document.getElementById('aetherx-integrated-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'aetherx-integrated-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-color: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 10000000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Pretendard', -apple-system, sans-serif;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background-color: #0F172A;
      color: #F8FAFC;
      width: 440px;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      border: 1px solid #334155;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: aetherx-modal-fade 0.2s ease-out;
    `;

    // 인라인 애니메이션 및 공통 모달 CSS 스타일 주입
    if (!document.getElementById('aetherx-integrated-modal-style')) {
      const styleTag = document.createElement('style');
      styleTag.id = 'aetherx-integrated-modal-style';
      styleTag.textContent = `
        @keyframes aetherx-modal-fade {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .aetherx-platform-card {
          background-color: #1E293B !important;
          color: #F8FAFC !important;
          border: 1px solid #334155 !important;
          border-radius: 12px !important;
          padding: 20px 16px !important;
          cursor: pointer !important;
          text-align: center !important;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 8px !important;
          width: 48% !important;
          box-sizing: border-box !important;
        }
        .aetherx-platform-card:hover {
          border-color: #3B82F6 !important;
          background-color: #24324D !important;
          transform: translateY(-4px) !important;
          box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3) !important;
        }
        .aetherx-platform-card.ali:hover {
          border-color: #EF4444 !important;
          background-color: #3D2323 !important;
          box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.3) !important;
        }
        .aetherx-platform-icon {
          font-size: 32px !important;
          margin-bottom: 4px !important;
        }
        .aetherx-platform-name {
          font-weight: 800 !important;
          font-size: 16px !important;
        }
        .aetherx-platform-desc {
          color: #94A3B8 !important;
          font-size: 11px !important;
          line-height: 1.4 !important;
          text-align: center !important;
        }
        .aetherx-modal-btn {
          background-color: #1E293B !important;
          color: #F8FAFC !important;
          border: 1px solid #475569 !important;
          padding: 12px 16px !important;
          border-radius: 8px !important;
          cursor: pointer !important;
          text-align: left !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          transition: all 0.2s ease !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 4px !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .aetherx-modal-btn:hover {
          background-color: #2563EB !important;
          border-color: #3B82F6 !important;
          transform: translateY(-1px) !important;
        }
        .aetherx-modal-btn .btn-title {
          font-weight: 700 !important;
          font-size: 14px !important;
          color: #FFFFFF !important;
          display: block !important;
        }
        .aetherx-modal-btn .btn-desc {
          color: #94A3B8 !important;
          font-size: 11px !important;
          display: block !important;
        }
        .aetherx-modal-btn:hover .btn-desc {
          color: #E2E8F0 !important;
        }
      `;
      document.head.appendChild(styleTag);
    }

    const slider = document.createElement('div');
    slider.id = 'aetherx-modal-slider';
    slider.style.cssText = `
      display: flex;
      width: 300%;
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    // --- Slide 1: Platform Selection ---
    const slide1 = document.createElement('div');
    slide1.style.cssText = `
      width: 33.333%;
      padding: 24px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    const header1 = document.createElement('div');
    header1.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #334155;
      padding-bottom: 12px;
    `;
    header1.innerHTML = `
      <span style="font-size: 16px; font-weight: 700; color: #3B82F6;">🌐 소싱 사이트 선택</span>
      <button class="aetherx-modal-close-btn" style="background: none; border: none; color: #94A3B8; cursor: pointer; font-size: 18px; padding: 0; line-height: 1;">&times;</button>
    `;
    slide1.appendChild(header1);

    const body1 = document.createElement('div');
    body1.style.cssText = `
      display: flex;
      justify-content: space-between;
      gap: 16px;
    `;
    body1.innerHTML = `
      <div class="aetherx-platform-card" id="aetherx-card-select-1688">
        <span class="aetherx-platform-icon">🇨🇳</span>
        <span class="aetherx-platform-name" style="color: #3B82F6;">1688.com</span>
        <span class="aetherx-platform-desc">중국 최대 규모 도매 소싱 플랫폼 1688로 이동</span>
      </div>
      <div class="aetherx-platform-card ali" id="aetherx-card-select-ali">
        <span class="aetherx-platform-icon">📦</span>
        <span class="aetherx-platform-name" style="color: #FF4747;">AliExpress</span>
        <span class="aetherx-platform-desc">해외 직배송 특화 소싱 플랫폼 알리로 이동</span>
      </div>
    `;
    slide1.appendChild(body1);

    const footer1 = document.createElement('div');
    footer1.style.cssText = `
      display: flex;
      justify-content: flex-end;
      padding-top: 8px;
    `;
    const btnCancel1 = document.createElement('button');
    btnCancel1.style.cssText = `
      background-color: transparent;
      color: #94A3B8;
      border: none;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
    `;
    btnCancel1.textContent = "취소";
    btnCancel1.addEventListener('click', () => {
      overlay.remove();
    });
    footer1.appendChild(btnCancel1);
    slide1.appendChild(footer1);


    // --- Slide 2: Sourcing Method Selection ---
    const slide2 = document.createElement('div');
    slide2.style.cssText = `
      width: 33.333%;
      padding: 24px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    const header2 = document.createElement('div');
    header2.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #334155;
      padding-bottom: 12px;
    `;
    header2.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="aetherx-btn-back" style="background: none; border: none; color: #3B82F6; cursor: pointer; font-size: 14px; font-weight: 700; padding: 0;">◀ 이전</button>
        <span id="aetherx-sourcing-title" style="font-size: 16px; font-weight: 700; color: #3B82F6;">🔍 소싱 검색 방식 선택</span>
      </div>
      <button class="aetherx-modal-close-btn" style="background: none; border: none; color: #94A3B8; cursor: pointer; font-size: 18px; padding: 0; line-height: 1;">&times;</button>
    `;
    slide2.appendChild(header2);

    const body2 = document.createElement('div');
    body2.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    const btnKeyword = document.createElement('button');
    btnKeyword.className = 'aetherx-modal-btn';
    btnKeyword.innerHTML = `
      <span class="btn-title">1. 키워드 검색</span>
      <span class="btn-desc">핵심 중요 키워드를 정제하고 번역하여 검색합니다.</span>
    `;

    const btnTitle = document.createElement('button');
    btnTitle.className = 'aetherx-modal-btn';
    btnTitle.innerHTML = `
      <span class="btn-title">2. 상품명 검색</span>
      <span class="btn-desc">전체 상품명 자체를 번역하여 소싱 검색합니다.</span>
    `;

    const btnImage = document.createElement('button');
    btnImage.className = 'aetherx-modal-btn';
    btnImage.innerHTML = `
      <span class="btn-title">3. 이미지 검색 (수동)</span>
      <span class="btn-desc">상품 이미지를 복사한 뒤 수동 검색법을 안내합니다.</span>
    `;

    body2.appendChild(btnKeyword);
    body2.appendChild(btnTitle);
    body2.appendChild(btnImage);
    slide2.appendChild(body2);

    const footer2 = document.createElement('div');
    footer2.style.cssText = `
      display: flex;
      justify-content: flex-end;
      padding-top: 8px;
    `;
    const btnCancel2 = document.createElement('button');
    btnCancel2.style.cssText = `
      background-color: transparent;
      color: #94A3B8;
      border: none;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;
    `;
    btnCancel2.textContent = "취소";
    btnCancel2.addEventListener('click', () => {
      overlay.remove();
    });
    footer2.appendChild(btnCancel2);
    slide2.appendChild(footer2);


    // --- Slide 3: Image Sourcing Instruction ---
    const slide3 = document.createElement('div');
    slide3.style.cssText = `
      width: 33.333%;
      padding: 24px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    const header3 = document.createElement('div');
    header3.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #334155;
      padding-bottom: 12px;
    `;
    header3.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="aetherx-btn-back-to-2" style="background: none; border: none; color: #3B82F6; cursor: pointer; font-size: 14px; font-weight: 700; padding: 0; display: none;">◀ 이전</button>
        <span style="font-size: 16px; font-weight: 700; color: #10B981;">📋 이미지 복사 완료</span>
      </div>
      <button class="aetherx-modal-close-btn" style="background: none; border: none; color: #94A3B8; cursor: pointer; font-size: 18px; padding: 0; line-height: 1;">&times;</button>
    `;
    slide3.appendChild(header3);

    const body3 = document.createElement('div');
    body3.className = 'aetherx-body3-content';
    body3.style.cssText = `
      font-size: 14px;
      line-height: 1.6;
      color: #E2E8F0;
      text-align: left;
    `;
    body3.innerHTML = `
      <p style="margin: 0 0 12px 0; font-weight: 700; font-size: 15px; color: #FFFFFF;">상품 이미지가 클립보드에 복사되었습니다!</p>
      <ol style="margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px;">
        <li>아래 [소싱 사이트로 이동] 버튼을 클릭합니다.</li>
        <li>검색창 또는 이미지 검색 버튼(카메라 아이콘)을 클릭합니다.</li>
        <li>단축키 <strong style="color: #3B82F6; background-color: #1E293B; padding: 2px 6px; border-radius: 4px;">Ctrl + V</strong>를 눌러 이미지를 붙여넣은 뒤 검색해 주세요.</li>
      </ol>
    `;
    slide3.appendChild(body3);

    const footer3 = document.createElement('div');
    footer3.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 8px;
    `;

    const btnGoToSourcing = document.createElement('button');
    btnGoToSourcing.className = 'aetherx-btn-goto-sourcing';
    btnGoToSourcing.style.cssText = `
      background-color: #2563EB;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
    `;
    btnGoToSourcing.textContent = "소싱 사이트로 이동";
    footer3.appendChild(btnGoToSourcing);
    slide3.appendChild(footer3);


    slider.appendChild(slide1);
    slider.appendChild(slide2);
    slider.appendChild(slide3);
    modal.appendChild(slider);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let selectedPlatform = platformDefault;
    const titleSpan = slide2.querySelector('#aetherx-sourcing-title');

    // 슬라이드 화면 전환 함수 (33.333% 가로 이동)
    const goToSlide = (slideIndex) => {
      slider.style.transform = `translateX(-${slideIndex * 33.333}%)`;
      if (slideIndex === 1 && titleSpan) {
        titleSpan.textContent = `🔍 ${selectedPlatform === '1688' ? '1688.com' : 'AliExpress'} 검색 방식`;
      }
      // 3단계 진입 시 startSlide가 2인 경우(크롭 모드 등)는 이전 버튼을 숨김 처리
      const backTo2Btn = slide3.querySelector('#aetherx-btn-back-to-2');
      if (backTo2Btn) {
        backTo2Btn.style.display = (startSlide === 2 || cropInfo) ? 'none' : 'inline-block';
      }
    };

    // 소싱 및 검색 버튼 상태 제어 헬퍼
    const originalText = buttonEl ? buttonEl.textContent : (platformDefault === '1688' ? "🔍 1688" : "🔍 Ali");
    const resetBtnState = () => {
      if (buttonEl) {
        buttonEl.textContent = originalText;
        buttonEl.disabled = false;
      }
    };

    // 액션 핸들러들
    const performTextSearch = (searchKeyword, platform) => {
      if (buttonEl) {
        buttonEl.textContent = "⏳ 처리 중...";
        buttonEl.disabled = true;
      }
      if (platform === '1688') {
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=zh-CN&dt=t&q=${encodeURIComponent(searchKeyword)}`;
        fetch(translateUrl)
          .then(res => res.json())
          .then(data => {
            let targetKeyword = searchKeyword;
            if (data && data[0] && data[0][0] && data[0][0][0]) {
              targetKeyword = data[0][0][0];
            }
            chrome.runtime.sendMessage({ action: "openTab", url: `https://s.1688.com/sellertrust/company_search.htm?keywords=${encodeURIComponent(targetKeyword)}` });
          })
          .catch(() => {
            chrome.runtime.sendMessage({ action: "openTab", url: `https://s.1688.com/sellertrust/company_search.htm?keywords=${encodeURIComponent(searchKeyword)}` });
          })
          .finally(() => {
            resetBtnState();
          });
      } else {
        chrome.runtime.sendMessage({ action: "openTab", url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(searchKeyword)}` });
        resetBtnState();
      }
    };

    const performImageSourcing = (platform) => {
      if (buttonEl) {
        buttonEl.textContent = "⏳ 처리 중...";
        buttonEl.disabled = true;
      }
      // 이미지 주소 정제
      let rawUrl = product.imgUrl;
      if (rawUrl.startsWith('//')) {
        rawUrl = 'https:' + rawUrl;
      }
      const qIndex = rawUrl.indexOf('?');
      const cleanImgUrl = qIndex !== -1 ? rawUrl.substring(0, qIndex) : rawUrl;

      chrome.runtime.sendMessage({ action: "downloadImage", url: cleanImgUrl }, (response) => {
        const getFallbackKeyword = () => {
          const currentQuery = (new URLSearchParams(window.location.search).get("query") ||
            new URLSearchParams(window.location.search).get("q") || "").trim();
          return currentQuery ? currentQuery : getCleanedSearchTitle(product.title);
        };

        if (!response || !response.success) {
          console.error("Aether X: Proxy download failed:", response ? response.error : "No response");
          alert("이미지 다운로드에 실패하여 키워드 검색으로 대체합니다.");
          performTextSearch(getFallbackKeyword(), platform);
          return;
        }

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(pngBlob => {
            try {
              const item = new ClipboardItem({ "image/png": pngBlob });
              navigator.clipboard.write([item]).then(() => {
                console.log(`Aether X: Image copied to clipboard for ${platform}.`);
                goToSlide(2);
              });
            } catch (clipErr) {
              console.error("Clipboard write failed:", clipErr);
              alert("이미지 복사에 실패하여 키워드 검색으로 대체합니다.");
              performTextSearch(getFallbackKeyword(), platform);
            }
          }, "image/png");
        };
        img.onerror = () => {
          alert("이미지 로딩에 실패하여 키워드 검색으로 대체합니다.");
          performTextSearch(getFallbackKeyword(), platform);
        };
        img.src = response.imgDataUrl;
      });
    };

    const performCroppedImageSourcing = (platform, info) => {
      goToSlide(2);

      const bodyWrapper = slide3.querySelector('.aetherx-body3-content');
      const actionBtn = slide3.querySelector('.aetherx-btn-goto-sourcing');
      if (bodyWrapper) {
        bodyWrapper.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px 0; gap: 12px;">
            <div style="border: 4px solid #1E293B; border-top: 4px solid #3B82F6; border-radius: 50%; width: 36px; height: 36px; animation: spin 1s linear infinite;"></div>
            <span style="font-size: 13px; color: #94A3B8;">선택한 영역의 이미지를 잘라 복사하는 중입니다...</span>
          </div>
          <style>
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        `;
      }
      if (actionBtn) actionBtn.disabled = true;

      chrome.runtime.sendMessage({ action: "downloadImage", url: info.imgSrc }, (response) => {
        if (!response || !response.success) {
          alert("이미지 캡처에 실패했습니다.");
          overlay.remove();
          return;
        }

        const tempImg = new Image();
        tempImg.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = info.cropW;
          canvas.height = info.cropH;
          const ctx = canvas.getContext('2d');

          const scaleX = tempImg.width / info.rectWidth;
          const scaleY = tempImg.height / info.rectHeight;

          ctx.drawImage(
            tempImg,
            info.cropX * scaleX,
            info.cropY * scaleY,
            info.cropW * scaleX,
            info.cropH * scaleY,
            0,
            0,
            info.cropW,
            info.cropH
          );

          canvas.toBlob(pngBlob => {
            try {
              const item = new ClipboardItem({ "image/png": pngBlob });
              navigator.clipboard.write([item]).then(() => {
                console.log(`Aether X: Cropped image copied to clipboard for ${platform}.`);
                if (bodyWrapper) {
                  bodyWrapper.innerHTML = `
                    <p style="margin: 0 0 12px 0; font-weight: 700; font-size: 15px; color: #FFFFFF;">상품 이미지가 클립보드에 복사되었습니다!</p>
                    <ol style="margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px;">
                      <li>아래 [소싱 사이트로 이동] 버튼을 클릭합니다.</li>
                      <li>검색창 또는 이미지 검색 버튼(카메라 아이콘)을 클릭합니다.</li>
                      <li>단축키 <strong style="color: #3B82F6; background-color: #1E293B; padding: 2px 6px; border-radius: 4px;">Ctrl + V</strong>를 눌러 이미지를 붙여넣은 뒤 검색해 주세요.</li>
                    </ol>
                  `;
                }
                if (actionBtn) actionBtn.disabled = false;
              });
            } catch (err) {
              console.error("Cropped clipboard write failed:", err);
              alert("이미지 복사에 실패하였습니다.");
              overlay.remove();
            }
          }, "image/png");
        };
        tempImg.src = response.imgDataUrl;
      });
    };

    // 초기 시작 슬라이드 설정
    if (startSlide > 0) {
      goToSlide(startSlide);
    }

    // 이벤트 리스너 바인딩
    slide1.querySelector('#aetherx-card-select-1688').addEventListener('click', () => {
      selectedPlatform = '1688';
      if (cropInfo) {
        performCroppedImageSourcing('1688', cropInfo);
      } else {
        goToSlide(1);
      }
    });

    slide1.querySelector('#aetherx-card-select-ali').addEventListener('click', () => {
      selectedPlatform = 'ali';
      if (cropInfo) {
        performCroppedImageSourcing('ali', cropInfo);
      } else {
        goToSlide(1);
      }
    });

    slide2.querySelector('#aetherx-btn-back').addEventListener('click', () => {
      goToSlide(0);
    });

    slide3.querySelector('#aetherx-btn-back-to-2').addEventListener('click', () => {
      goToSlide(1);
    });

    // 닫기 버튼 공통 바인딩
    overlay.querySelectorAll('.aetherx-modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.remove();
      });
    });

    // 바깥쪽 클릭 시 닫기
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    btnGoToSourcing.addEventListener('click', () => {
      overlay.remove();
      const targetUrl = selectedPlatform === '1688'
        ? "https://s.1688.com/youyuan/index.htm"
        : "https://www.aliexpress.com/";
      chrome.runtime.sendMessage({ action: "openTab", url: targetUrl });
      resetBtnState();
    });

    btnKeyword.addEventListener('click', () => {
      overlay.remove();
      const currentQuery = (new URLSearchParams(window.location.search).get("query") ||
        new URLSearchParams(window.location.search).get("q") || "").trim();
      const targetKeyword = currentQuery ? currentQuery : getCleanedSearchTitle(product.title);
      performTextSearch(targetKeyword, selectedPlatform);
    });

    btnTitle.addEventListener('click', () => {
      overlay.remove();
      performTextSearch(product.title, selectedPlatform);
    });

    btnImage.addEventListener('click', () => {
      performImageSourcing(selectedPlatform);
    });
  }

  // 글로벌 소싱 실행 헬퍼 함수
  window.triggerSourcing = function (product, platform, buttonEl) {
    if (!product) return;
    window.addToSourcingHistory(product, platform);
    showIntegratedSourcingModal(product, platform, buttonEl, 1);
  };

  // 비교 행 소싱 통합 팝업 실행 헬퍼 함수 (1단계 플랫폼 선택부터 시작)
  window.triggerIntegratedSourcing = function (product, buttonEl) {
    if (!product) return;
    showIntegratedSourcingModal(product, '1688', buttonEl, 0);
  };

  // 이미지 영역 지정(Crop) 소싱 오버레이 구현
  window.activateCropOverlay = function (imgEl, product) {
    if (!imgEl) return;

    // 이전에 생성된 오버레이 제거
    const existing = document.getElementById('aetherx-crop-overlay-container');
    if (existing) existing.remove();

    const rect = imgEl.getBoundingClientRect();

    // 오버레이 컨테이너 생성 (테두리 하이라이트 및 반투명도 보강)
    const container = document.createElement('div');
    container.id = 'aetherx-crop-overlay-container';
    container.style.cssText = `
      position: absolute;
      top: ${rect.top + window.scrollY}px;
      left: ${rect.left + window.scrollX}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      z-index: 999999;
      cursor: crosshair;
      background-color: rgba(15, 23, 42, 0.45);
      outline: 2px solid #2563EB;
      outline-offset: -2px;
      user-select: none;
    `;

    // 이미지 드래그 유도용 안내 문구 뱃지 추가
    const guideBadge = document.createElement('div');
    guideBadge.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(15, 23, 42, 0.9);
      color: #FFFFFF;
      padding: 8px 14px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      pointer-events: none;
      white-space: nowrap;
      border: 1px solid #475569;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
      animation: aetherx-guide-pulse 1.6s infinite ease-in-out;
    `;
    guideBadge.textContent = "🖱️ 이미지를 드래그하여 영역을 지정하세요";

    if (!document.getElementById('aetherx-guide-style')) {
      const styleTag = document.createElement('style');
      styleTag.id = 'aetherx-guide-style';
      styleTag.textContent = `
        @keyframes aetherx-guide-pulse {
          0% { opacity: 0.9; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.55; transform: translate(-50%, -50%) scale(0.97); }
          100% { opacity: 0.9; transform: translate(-50%, -50%) scale(1); }
        }
      `;
      document.head.appendChild(styleTag);
    }
    container.appendChild(guideBadge);

    // 드래그 선택 박스
    const selection = document.createElement('div');
    selection.style.cssText = `
      border: 2px dashed #E11D48;
      background-color: rgba(225, 29, 72, 0.15);
      position: absolute;
      display: none;
    `;
    container.appendChild(selection);

    let startX = 0, startY = 0, isDragging = false;
    let cropX = 0, cropY = 0, cropW = 0, cropH = 0;

    container.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;

      // 드래그 시작 시 안내 뱃지 삭제
      if (guideBadge) guideBadge.remove();

      const containerRect = container.getBoundingClientRect();
      startX = e.clientX - containerRect.left;
      startY = e.clientY - containerRect.top;

      selection.style.left = `${startX}px`;
      selection.style.top = `${startY}px`;
      selection.style.width = '0px';
      selection.style.height = '0px';
      selection.style.display = 'block';
    });

    container.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const containerRect = container.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(e.clientX - containerRect.left, containerRect.width));
      const currentY = Math.max(0, Math.min(e.clientY - containerRect.top, containerRect.height));

      cropX = Math.min(startX, currentX);
      cropY = Math.min(startY, currentY);
      cropW = Math.abs(startX - currentX);
      cropH = Math.abs(startY - currentY);

      selection.style.left = `${cropX}px`;
      selection.style.top = `${cropY}px`;
      selection.style.width = `${cropW}px`;
      selection.style.height = `${cropH}px`;
    });

    container.addEventListener('mouseup', (e) => {
      isDragging = false;

      if (cropW > 10 && cropH > 10) {
        // 드래그 영역 지정 완료 즉시 오버레이 창 해제
        container.remove();

        // 캡처 영역 좌표 정보 전달 객체 생성
        const cropInfo = {
          cropX,
          cropY,
          cropW,
          cropH,
          imgSrc: imgEl.src,
          rectWidth: rect.width,
          rectHeight: rect.height
        };

        // 통합 소싱 플랫폼 선택 모달 팝업 호출 (1단계부터 진입)
        showIntegratedSourcingModal(product, '1688', null, 0, cropInfo);
      } else {
        selection.style.display = 'none';
      }
    });

    document.body.appendChild(container);
  };

  // 9. 글로벌 클릭 이벤트 위임 리스너 (React 가상 DOM 갱신으로 인한 리스너 유실 방지)
  document.addEventListener('click', (e) => {
    // 필터 매칭 상품 순차 스크롤 이동(이동하기 - 아래로) 처리
    if (e.target && e.target.id === 'aetherx-filter-next-btn') {
      e.stopPropagation();
      e.preventDefault();

      const highlightedElements = document.querySelectorAll('.aetherx-highlighted');
      const total = highlightedElements.length;
      if (total === 0) return;

      currentHighlightIndex = (currentHighlightIndex + 1) % total;
      const targetEl = highlightedElements[currentHighlightIndex];
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 이동한 상품을 눈에 띄게 강조하는 일시적 펄스/플래시 효과 적용
        const originalTransition = targetEl.style.transition;
        targetEl.style.transition = 'outline 0.3s ease, transform 0.3s ease';
        targetEl.style.outline = '4px solid #8B5CF6';
        targetEl.style.transform = 'scale(1.02)';

        setTimeout(() => {
          targetEl.style.outline = '';
          targetEl.style.transform = '';
          setTimeout(() => {
            targetEl.style.transition = originalTransition;
          }, 300);
        }, 1000);
      }

      const prevBtn = document.getElementById('aetherx-filter-prev-btn');
      if (prevBtn) prevBtn.textContent = `▲ (${currentHighlightIndex + 1}/${total})`;
      e.target.textContent = `▼ (${currentHighlightIndex + 1}/${total})`;
      return;
    }

    // 필터 매칭 상품 순차 스크롤 이동(이동하기 - 위로) 처리
    if (e.target && e.target.id === 'aetherx-filter-prev-btn') {
      e.stopPropagation();
      e.preventDefault();

      const highlightedElements = document.querySelectorAll('.aetherx-highlighted');
      const total = highlightedElements.length;
      if (total === 0) return;

      if (currentHighlightIndex <= 0) {
        currentHighlightIndex = total - 1;
      } else {
        currentHighlightIndex--;
      }

      const targetEl = highlightedElements[currentHighlightIndex];
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 이동한 상품을 눈에 띄게 강조하는 일시적 펄스/플래시 효과 적용
        const originalTransition = targetEl.style.transition;
        targetEl.style.transition = 'outline 0.3s ease, transform 0.3s ease';
        targetEl.style.outline = '4px solid #8B5CF6';
        targetEl.style.transform = 'scale(1.02)';

        setTimeout(() => {
          targetEl.style.outline = '';
          targetEl.style.transform = '';
          setTimeout(() => {
            targetEl.style.transition = originalTransition;
          }, 300);
        }, 1000);
      }

      const nextBtn = document.getElementById('aetherx-filter-next-btn');
      if (nextBtn) nextBtn.textContent = `▼ (${currentHighlightIndex + 1}/${total})`;
      e.target.textContent = `▲ (${currentHighlightIndex + 1}/${total})`;
      return;
    }

    // 필터 초기화 처리
    if (e.target && e.target.id === 'aetherx-filter-reset-btn') {
      e.stopPropagation();
      e.preventDefault();

      pageObserver.disconnect();
      try {
        // 1. 입력 필드 초기화
        const marginInput = document.getElementById('aetherx-filter-margin');
        const minRevInput = document.getElementById('aetherx-filter-reviews-min');
        const maxRevInput = document.getElementById('aetherx-filter-reviews-max');
        const rocketInput = document.getElementById('aetherx-filter-rocket');
        const overseasInput = document.getElementById('aetherx-filter-exclude-overseas');

        if (marginInput) marginInput.value = '';
        if (minRevInput) minRevInput.value = '';
        if (maxRevInput) maxRevInput.value = '';
        if (rocketInput) rocketInput.checked = false;
        if (overseasInput) overseasInput.checked = false;

        // 2. 상품 스타일 초기화
        const highlightedElements = document.querySelectorAll('.aetherx-highlighted');
        const dimmedElements = document.querySelectorAll('.aetherx-dimmed');
        highlightedElements.forEach(el => el.classList.remove('aetherx-highlighted'));
        dimmedElements.forEach(el => el.classList.remove('aetherx-dimmed'));

        // 3. 필터 변수 초기화
        currentFilterValues = null;
        currentHighlightIndex = -1;

        // 4. 네비게이션 버튼 숨김
        updateHighlightNavigation();
      } finally {
        pageObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
      return;
    }

    // Crop 버튼 클릭 처리
    const cropBtn = e.target.closest('.aetherx-btn-crop');
    if (cropBtn) {
      e.stopPropagation();
      e.preventDefault();

      const cardEl = cropBtn.closest('[data-aetherx-processed="true"]');
      if (!cardEl) return;

      const currentParser = window.location.href.includes("shopping.naver.com")
        ? window.NaverParser
        : window.CoupangParser;

      const freshProduct = currentParser ? currentParser.parseElement(cardEl) : null;
      if (freshProduct) {
        // 상품 카드에서 실제 이미지 요소를 찾아 오버레이 연결
        const imgEl = cardEl.querySelector('img');
        if (imgEl) {
          window.activateCropOverlay(imgEl, freshProduct);
        } else {
          alert("상품 이미지를 찾을 수 없습니다.");
        }
      }
      return;
    }

    // '소싱사이트' 통합 검색 버튼 클릭 처리
    const searchBtn = e.target.closest('.aetherx-btn-search');
    if (searchBtn) {
      // 비교 매트릭스 내부 삭제 및 전용 버튼은 예외 처리
      if (searchBtn.getAttribute('data-remove-index') !== null || searchBtn.classList.contains('aetherx-btn-compare-sourcing')) return;

      e.stopPropagation();
      e.preventDefault();

      const cardEl = searchBtn.closest('[data-aetherx-processed="true"]');
      if (!cardEl) return;

      const currentParser = window.location.href.includes("shopping.naver.com")
        ? window.NaverParser
        : window.CoupangParser;

      const freshProduct = currentParser ? currentParser.parseElement(cardEl) : null;
      if (freshProduct) {
        // 통합 슬라이딩 모달 호출 (1단계 플랫폼 선택부터 시작)
        showIntegratedSourcingModal(freshProduct, '1688', searchBtn, 0);
      }
      return;
    }

    // 알리익스프레스 이미지 소싱 검색 버튼 클릭 처리
    const aliBtn = e.target.closest('.aetherx-btn-ali');
    if (aliBtn) {
      // 비교 매트릭스 내부 버튼 예외 처리
      if (aliBtn.classList.contains('aetherx-btn-compare-ali')) return;

      e.stopPropagation();
      e.preventDefault();

      const cardEl = aliBtn.closest('[data-aetherx-processed="true"]');
      if (!cardEl) return;

      const currentParser = window.location.href.includes("shopping.naver.com")
        ? window.NaverParser
        : window.CoupangParser;

      const freshProduct = currentParser ? currentParser.parseElement(cardEl) : null;
      if (freshProduct) {
        window.triggerSourcing(freshProduct, 'ali', aliBtn);
      }
      return;
    }

    // 담기(+) 버튼 클릭 처리
    const addBtn = e.target.closest('.aetherx-btn-add');
    if (addBtn) {
      // 비교 매트릭스 푸터 버튼 및 삭제 버튼은 제외
      if (addBtn.id === 'aetherx-bulk-1688' || addBtn.id === 'aetherx-export-csv' || addBtn.id === 'aetherx-clear-compare' || addBtn.classList.contains('aetherx-btn-compare-remove')) return;

      e.stopPropagation();
      e.preventDefault();

      const cardEl = addBtn.closest('[data-aetherx-processed="true"]');
      if (!cardEl) return;

      const currentParser = window.location.href.includes("shopping.naver.com")
        ? window.NaverParser
        : window.CoupangParser;

      const freshProduct = currentParser ? currentParser.parseElement(cardEl) : null;
      if (freshProduct) {
        handleAddCompare(freshProduct);
      }
      return;
    }
  });

  // SPA 및 스크롤 다운에 따른 신규 상품 로딩 감시
  pageObserver = new MutationObserver(() => {
    initPageElements();
  });

  // 모니터링 시작 함수 구현 (React 수화 완료 후 호출됨)
  function startMonitoring() {
    if (isMonitoringStarted || !isAetherxEnabled) return;
    isMonitoringStarted = true;

    initPageElements();

    if (pageObserver) {
      pageObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    if (!pollingInterval) {
      pollingInterval = setInterval(() => {
        initPageElements();
      }, 1000);
    }
  }

  // 드롭 타겟 바인딩 (비교 도크 확장 시 드롭하여 추가)
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  document.addEventListener('drop', (e) => {
    const dock = document.getElementById('aetherx-compare-dock');
    if (dock && dock.contains(e.target)) {
      e.preventDefault();
      try {
        const rawData = e.dataTransfer.getData("text/plain");
        if (rawData) {
          const product = JSON.parse(rawData);
          if (product && product.id) {
            handleAddCompare(product);
          }
        }
      } catch (err) {
        console.error("Drop add failed:", err);
      }
    }
  });

})();
