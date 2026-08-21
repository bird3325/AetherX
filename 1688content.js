// Aether X isolated-world content script running on s.1688.com
(function() {
  function startSourcing() {
    chrome.storage.local.get(["aetherx_sourcing"], (result) => {
      if (!result.aetherx_sourcing) return;

      const sourcing = result.aetherx_sourcing;
      chrome.storage.local.remove(["aetherx_sourcing"]);

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
        <div style="font-size: 24px; font-weight: 700; color: #2563EB; margin-bottom: 12px;">Aether X Sourcing</div>
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">1688 이미지 검색을 구동 중입니다.</div>
        <div style="font-size: 13px; color: #94A3B8; margin-bottom: 20px;">이미지를 격리 영역에서 디코딩하여 안전하게 주입하고 있습니다...</div>
        <div style="font-size: 11px; color: #64748B;">자동 처리 실패 시 화면에서 직접 Ctrl + V (붙여넣기)를 누르시거나 아래 버튼을 누르세요.</div>
        <button id="aetherx-overlay-fallback" style="margin-top: 15px; background-color: #1E293B; border: 1px solid #475569; color: white; border-radius: 4px; padding: 6px 12px; font-size: 12px; cursor: pointer;">번역 텍스트 검색</button>
      `;
      document.body.appendChild(loadingOverlay);

      document.getElementById("aetherx-overlay-fallback").addEventListener("click", () => {
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
              window.postMessage({ type: 'AETHERX_1688_INJECT_FILE', file: file }, '*');
            }, 200);
          })
          .catch(err => {
            console.error("Aether X Isolated: Image fetch failed:", err);
            fallbackToKeyword(sourcing.title);
          });

        // 6초 후 로딩 오버레이 자동 제거
        setTimeout(() => {
          if (loadingOverlay.parentNode) {
            document.body.removeChild(loadingOverlay);
          }
        }, 6000);
      } else {
        fallbackToKeyword(sourcing.title);
      }

      function fallbackToKeyword(titleText) {
        if (loadingOverlay.parentNode) {
          document.body.removeChild(loadingOverlay);
        }
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=zh-CN&dt=t&q=${encodeURIComponent(titleText)}`;
        fetch(translateUrl)
          .then(response => response.json())
          .then(data => {
            let targetKeyword = titleText;
            if (data && data[0] && data[0][0] && data[0][0][0]) {
              targetKeyword = data[0][0][0];
            }
            window.location.href = `https://s.1688.com/sellertrust/company_search.htm?keywords=${encodeURIComponent(targetKeyword)}`;
          })
          .catch(() => {
            window.location.href = `https://s.1688.com/sellertrust/company_search.htm?keywords=${encodeURIComponent(titleText)}`;
          });
      }
    });
  }

  // 페이지 로드가 완전히 끝나고 스크립트들이 바인딩될 수 있도록 대기
  if (document.readyState === "complete") {
    setTimeout(startSourcing, 500);
  } else {
    window.addEventListener("load", () => {
      setTimeout(startSourcing, 500);
    });
  }
})();
