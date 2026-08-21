document.addEventListener('DOMContentLoaded', () => {
  const checkbox = document.getElementById('aetherx-toggle-checkbox');
  const desc = document.getElementById('status-desc');
  
  const settingsHdr = document.getElementById('aetherx-settings-hdr');
  const settingsBody = document.getElementById('aetherx-settings-body');
  const chevron = document.getElementById('settings-chevron');

  // Load current global state
  chrome.storage.local.get({ aetherxEnabled: true }, (res) => {
    checkbox.checked = res.aetherxEnabled;
    updateStatusText(res.aetherxEnabled);
  });

  // Toggle state change handler
  checkbox.addEventListener('change', () => {
    const isEnabled = checkbox.checked;
    chrome.storage.local.set({ aetherxEnabled: isEnabled }, () => {
      updateStatusText(isEnabled);
    });
  });

  function updateStatusText(isEnabled) {
    desc.textContent = isEnabled 
      ? 'Aether X 기능이 켜져 있습니다.' 
      : 'Aether X 기능이 일시 중지되었습니다.';
    desc.style.setProperty('color', isEnabled ? '#10B981' : '#94A3B8', 'important');
  }

  // settings toggle panel collapse/expand
  let isSettingsOpen = false;
  settingsHdr.addEventListener('click', () => {
    isSettingsOpen = !isSettingsOpen;
    if (isSettingsOpen) {
      settingsBody.style.display = 'block';
      settingsHdr.style.borderRadius = '12px 12px 0 0';
      chevron.textContent = '▲ 접기';
    } else {
      settingsBody.style.display = 'none';
      settingsHdr.style.borderRadius = '12px';
      chevron.textContent = '▼ 펼치기';
    }
  });

  // Load settings fields
  chrome.storage.local.get(["aetherx_settings", "aetherx_cny_rate", "aetherx_rates"], (result) => {
    const rates = result.aetherx_rates || { CNY: 195, USD: 1330, JPY: 9.09, EUR: 1440 };
    const settings = result.aetherx_settings || {
      currency: "CNY",
      customsRate: 8,
      vatRate: 10,
      intShipping: 7000,
      domShipping: 3000,
      targetMarginRate: 25
    };
    const cnyRate = result.aetherx_cny_rate || rates[settings.currency] || 195;

    document.getElementById('sett-currency').value = settings.currency || "CNY";
    document.getElementById('sett-rate').value = cnyRate;
    document.getElementById('sett-customs').value = settings.customsRate !== undefined ? settings.customsRate : 8;
    document.getElementById('sett-vat').value = settings.vatRate !== undefined ? settings.vatRate : 10;
    document.getElementById('sett-int-ship').value = settings.intShipping !== undefined ? settings.intShipping : 7000;
    document.getElementById('sett-dom-ship').value = settings.domShipping !== undefined ? settings.domShipping : 3000;
    document.getElementById('sett-target-margin').value = settings.targetMarginRate !== undefined ? settings.targetMarginRate : 25;
    document.getElementById('sett-translation-blacklist').value = settings.blacklist || "";

    // Currency changed listener to update rate field automatically
    document.getElementById('sett-currency').addEventListener('change', (e) => {
      const cur = e.target.value;
      document.getElementById('sett-rate').value = rates[cur] || 195;
    });
  });

  // Save settings fields
  document.getElementById('btn-settings-save').addEventListener('click', () => {
    const currency = document.getElementById('sett-currency').value;
    const rateVal = parseFloat(document.getElementById('sett-rate').value) || 0;
    const customs = parseFloat(document.getElementById('sett-customs').value) || 0;
    const vat = parseFloat(document.getElementById('sett-vat').value) || 0;
    const intShip = parseFloat(document.getElementById('sett-int-ship').value) || 0;
    const domShip = parseFloat(document.getElementById('sett-dom-ship').value) || 0;
    const margin = parseFloat(document.getElementById('sett-target-margin').value) || 0;
    const blacklist = document.getElementById('sett-translation-blacklist').value;

    // Update rates cache
    chrome.storage.local.get({ aetherx_rates: { CNY: 195, USD: 1330, JPY: 9.09, EUR: 1440 } }, (result) => {
      const rates = result.aetherx_rates;
      rates[currency] = rateVal;

      const newSettings = {
        currency: currency,
        cnyRate: rateVal,
        customsRate: customs,
        vatRate: vat,
        intShipping: intShip,
        domShipping: domShip,
        targetMarginRate: margin,
        blacklist: blacklist
      };

      chrome.storage.local.set({
        aetherx_settings: newSettings,
        aetherx_cny_rate: rateVal,
        aetherx_rates: rates
      }, () => {
        const btn = document.getElementById('btn-settings-save');
        btn.textContent = '저장 완료 ✓';
        btn.style.background = 'linear-gradient(135deg, #10B981, #059669)';
        setTimeout(() => {
          btn.textContent = '설정 저장 및 적용';
          btn.style.background = 'linear-gradient(135deg, #4F46E5, #2563EB)';
        }, 1500);
      });
    });
  });
});
