// Aether X Background Service Worker

// 실시간 국가별 환율 조회 함수 (KRW 기준 단일 통화 단위 단가 변환)
function fetchExchangeRates() {
  fetch("https://open.er-api.com/v6/latest/USD")
    .then(res => res.json())
    .then(data => {
      if (data && data.rates && data.rates.KRW) {
        const krw = data.rates.KRW;
        const rates = {
          USD: parseFloat(krw.toFixed(2)),
          CNY: parseFloat((krw / data.rates.CNY).toFixed(2)),
          JPY: parseFloat((krw / data.rates.JPY).toFixed(4)), // 1엔 기준
          EUR: parseFloat((krw / data.rates.EUR).toFixed(2))
        };
        chrome.storage.local.set({ 
          aetherx_rates: rates, 
          aetherx_cny_rate: rates.CNY 
        }, () => {
          console.log("Aether X background: All rates updated:", rates);
        });
      }
    })
    .catch(err => {
      console.error("Aether X background: Failed to fetch rates:", err);
    });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Aether X Extension Installed successfully.");
  fetchExchangeRates();
});

// 서비스 워커 구동 시 실시간 환율 패치
fetchExchangeRates();

// background.js에서 필요시 API 요청을 대행하거나 탭 관리를 돕는 메시지 리스너를 준비합니다.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openTab") {
    chrome.tabs.create({ url: request.url });
    sendResponse({ success: true });
  } else if (request.action === "syncCNYRate") {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then(res => res.json())
      .then(data => {
        if (data && data.rates && data.rates.KRW) {
          const krw = data.rates.KRW;
          const rates = {
            USD: parseFloat(krw.toFixed(2)),
            CNY: parseFloat((krw / data.rates.CNY).toFixed(2)),
            JPY: parseFloat((krw / data.rates.JPY).toFixed(4)),
            EUR: parseFloat((krw / data.rates.EUR).toFixed(2))
          };
          chrome.storage.local.set({ 
            aetherx_rates: rates, 
            aetherx_cny_rate: rates.CNY 
          }, () => {
            sendResponse({ success: true, rates: rates, rate: rates.CNY });
          });
        } else {
          sendResponse({ success: false });
        }
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true;
  } else if (request.action === "search1688Image") {
    // 백그라운드 서비스 워커의 특수 권한을 활용하여 직접 다운로드 및 1688 업로드를 무풍지대에서 자동 처리합니다.
    fetch(request.imgUrl)
      .then(res => res.blob())
      .then(blob => {
        const formData = new FormData();
        formData.append("imgfile", blob, "sourcing_image.png");

        // 1688 자체 업로드 게이트웨이로 직접 포스팅
        return fetch("https://s.1688.com/youyuan/upload.htm", {
          method: "POST",
          body: formData
        });
      })
      .then(res => {
        const finalUrl = res.url;
        if (finalUrl && (finalUrl.includes("imageId") || finalUrl.includes("imageUrl"))) {
          chrome.tabs.create({ url: finalUrl });
          sendResponse({ success: true });
        } else {
          return res.text().then(text => {
            const idMatch = text.match(/imageId["'\s:]+([a-zA-Z0-9_-]+)/) || 
                            text.match(/imageId=([a-zA-Z0-9_-]+)/);
            if (idMatch && idMatch[1]) {
              chrome.tabs.create({ url: `https://s.1688.com/youyuan/index.htm?tab=imageSearch&imageId=${idMatch[1]}` });
              sendResponse({ success: true });
            } else {
              fallbackToKeywords(request.title, sendResponse);
            }
          });
        }
      })
      .catch(err => {
        console.error("Aether X: Direct 1688 upload pipeline failed:", err);
        fallbackToKeywords(request.title, sendResponse);
      });
    return true;
  } else if (request.action === "downloadImage") {
    // 백그라운드 서비스 워커 전용 host_permissions 권한을 동원해 CORS 제약 없이 이미지를 바이너리로 다운로드합니다.
    fetch(request.url)
      .then(res => res.arrayBuffer())
      .then(buffer => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        const mime = request.url.includes(".png") ? "image/png" : 
                     (request.url.includes(".webp") ? "image/webp" : "image/jpeg");
        sendResponse({ success: true, imgDataUrl: `data:${mime};base64,${base64}` });
      })
      .catch(err => {
        console.error("Background image download failed:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
  return true;
});

// 업로드 실패 시 한자 번역 키워드 검색 탭을 띄우는 백엔드 폴백 기능
function fallbackToKeywords(titleText, sendResponse) {
  const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=zh-CN&dt=t&q=${encodeURIComponent(titleText)}`;
  fetch(translateUrl)
    .then(res => res.json())
    .then(data => {
      let targetKeyword = titleText;
      if (data && data[0] && data[0][0] && data[0][0][0]) {
        targetKeyword = data[0][0][0];
      }
      chrome.tabs.create({ url: `https://s.1688.com/sellertrust/company_search.htm?keywords=${encodeURIComponent(targetKeyword)}` });
      if (sendResponse) sendResponse({ success: false });
    })
    .catch(() => {
      chrome.tabs.create({ url: `https://s.1688.com/sellertrust/company_search.htm?keywords=${encodeURIComponent(titleText)}` });
      if (sendResponse) sendResponse({ success: false });
    });
}
