// Aether X Main World content script running on aliexpress.com
(function() {
  window.addEventListener('message', (e) => {
    // isolated-world에서 토스한 파일 객체 확보
    if (e.data && e.data.type === 'AETHERX_ALI_INJECT_FILE') {
      const file = e.data.file;
      
      // 1. DataTransfer 생성 및 파일 추가 (네이티브 객체 사용)
      const dt = new DataTransfer();
      dt.items.add(file);

      // 2. 글로벌 페이스트 이벤트 및 입력창 포커싱 발송 함수 정의
      const sendPasteEvents = () => {
        try {
          const globalPasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true
          });
          Object.defineProperty(globalPasteEvent, 'clipboardData', {
            value: dt,
            writable: false,
            configurable: true
          });

          // 검색 텍스트 입력 칸 포커싱
          const searchInput = document.querySelector('input[type="search"]') || 
                              document.querySelector('input[name="SearchText"]') || 
                              document.querySelector('#search-key') ||
                              document.querySelector('input[class*="search"]');
          if (searchInput) {
            if (typeof searchInput.focus === 'function') {
              searchInput.focus();
            }
            searchInput.dispatchEvent(globalPasteEvent);
          }

          document.dispatchEvent(globalPasteEvent);
          document.body.dispatchEvent(globalPasteEvent);
          console.log("Aether X AliExpress MainWorld: Sent native-like focused paste events.");
        } catch (pasteErr) {
          console.error("Aether X AliExpress MainWorld: Global paste event error:", pasteErr);
        }
      };

      // 즉시 발송 및 프레임워크 초기화 지연 대기 후 다중 주기 발송으로 확실하게 캡처 보장
      sendPasteEvents();
      setTimeout(sendPasteEvents, 200);
      setTimeout(sendPasteEvents, 600);
      setTimeout(sendPasteEvents, 1200);

      // 3. 카메라 버튼 클릭 시도 (파일 인풋 활성화를 유도하기 위해)
      const cameraBtn = document.querySelector('.search-media-icon') || 
                        document.querySelector('[class*="camera"]') ||
                        document.querySelector('[class*="media-icon"]') ||
                        document.querySelector('[class*="search-media"]');
      if (cameraBtn) {
        try {
          cameraBtn.click();
          console.log("Aether X AliExpress MainWorld: Clicked camera button.");
        } catch (clickErr) {
          console.error("Aether X AliExpress MainWorld: Camera click error:", clickErr);
        }
      }

      // 4. 파일 인풋이 생성/존재하는지 주기적으로 확인하여 주입
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        const fileInput = document.querySelector('input[type="file"]') || 
                          document.querySelector('input[class*="upload"]') ||
                          document.querySelector('.image-search-upload-input') ||
                          document.querySelector('[class*="image-search"] input[type="file"]');
        
        if (fileInput) {
          clearInterval(checkInterval);
          
          try {
            // A. 파일 인풋 바인딩 자동화 (React 16+ 내부 상태 업데이트 우회)
            const nativeFilesSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "files").set;
            const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            
            nativeValueSetter.call(fileInput, "");
            nativeFilesSetter.call(fileInput, dt.files);
            
            fileInput.dispatchEvent(new Event("input", { bubbles: true }));
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("Aether X AliExpress MainWorld: Native-bypassed file injected successfully.");

            // B. 가상 드롭 이벤트 전송
            const dropEvent = new DragEvent('drop', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt
            });
            document.body.dispatchEvent(dropEvent);
            fileInput.dispatchEvent(dropEvent);
            if (fileInput.parentElement) {
              fileInput.parentElement.dispatchEvent(dropEvent);
            }

            // C. 가상 페이스트 이벤트 전송 (Ali 전역 리스너용)
            const pasteEvent = new ClipboardEvent('paste', {
              bubbles: true,
              cancelable: true
            });
            Object.defineProperty(pasteEvent, 'clipboardData', {
              value: dt,
              writable: false,
              configurable: true
            });
            document.body.dispatchEvent(pasteEvent);
            fileInput.dispatchEvent(pasteEvent);
            if (fileInput.parentElement) {
              fileInput.parentElement.dispatchEvent(pasteEvent);
            }
            console.log("Aether X AliExpress MainWorld: Simulated native paste event sent successfully.");

            // D. 자동 검색 버튼 클릭 및 폼 제출 비활성화 (이벤트 충돌로 인한 멈춤 현상 제거)
            // React SPA 환경에서는 paste/change 이벤트 디스패치만으로도 자동 업로드 및 검색이 트리거됩니다.
            // 강제 form.submit()이나 중복 click()은 SPA 상태와 충돌하여 페이지가 멈추는 현상을 유발하므로 제거합니다.
            
            // 성공 상태 알림
            window.postMessage({ type: 'AETHERX_ALI_INJECT_SUCCESS' }, '*');
          } catch (err) {
            console.error("Aether X AliExpress MainWorld: Auto injection trigger error:", err);
          }
        }
        
        if (attempts > 80) {
          clearInterval(checkInterval);
        }
      }, 100);
    }
  });
})();
