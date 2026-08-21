// Aether X Main World content script running on s.1688.com
(function() {
  window.addEventListener('message', (e) => {
    // isolated-world에서 토스한 파일 객체 확보
    if (e.data && e.data.type === 'AETHERX_1688_INJECT_FILE') {
      const file = e.data.file;
      let attempts = 0;
      
      const checkInterval = setInterval(() => {
        attempts++;
        const fileInput = document.querySelector('input[type="file"]') || 
                          document.querySelector('input[class*="upload"]') ||
                          document.querySelector('.image-search-upload-input');
        
        if (fileInput) {
          clearInterval(checkInterval);
          
          try {
            const dt = new DataTransfer();
            dt.items.add(file);

            // A. 파일 인풋 바인딩 자동화 (React 16+ 내부 상태 업데이트 우회)
            const nativeFilesSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "files").set;
            const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            
            if (nativeFilesSetter && nativeValueSetter) {
              nativeValueSetter.call(fileInput, "");
              nativeFilesSetter.call(fileInput, dt.files);
            } else {
              fileInput.files = dt.files;
            }
            
            fileInput.dispatchEvent(new Event("input", { bubbles: true }));
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("Aether X MainWorld: File injected successfully with React-bypass.");

            // B. 가상 드롭 이벤트 전송
            const dropEvent = new DragEvent('drop', {
              bubbles: true,
              cancelable: true,
              dataTransfer: dt
            });
            document.body.dispatchEvent(dropEvent);
            fileInput.dispatchEvent(dropEvent);

            // C. 가상 페이스트 이벤트 전송 (1688 전역 리스너용)
            const pasteEvent = new ClipboardEvent('paste', {
              bubbles: true,
              cancelable: true
            });
            Object.defineProperty(pasteEvent, 'clipboardData', {
              value: dt,
              writable: false,
              configurable: true
            });
            
            // 검색창 포커싱 후 페이스트 이벤트 전송
            const searchInput = document.querySelector('input[type="search"]') || 
                                document.querySelector('input[class*="search"]') ||
                                fileInput;
            if (searchInput && typeof searchInput.focus === 'function') {
              searchInput.focus();
            }
            
            document.body.dispatchEvent(pasteEvent);
            fileInput.dispatchEvent(pasteEvent);
            if (searchInput) {
              searchInput.dispatchEvent(pasteEvent);
            }
            console.log("Aether X MainWorld: Simulated paste event sent successfully using real DataTransfer.");
          } catch (err) {
            console.error("Aether X MainWorld: Auto injection trigger error:", err);
          }
        }
        
        if (attempts > 80) {
          clearInterval(checkInterval);
        }
      }, 100);
    }
  });
})();
