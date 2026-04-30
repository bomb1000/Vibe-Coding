document.addEventListener('DOMContentLoaded', () => {
  EWI18n.applyDocument();

  const enabledToggle = document.getElementById('enabledToggle');
  const openOptionsLink = document.getElementById('openOptions');
  const openFeedbackLink = document.getElementById('openFeedback');
  const whatsNewNotice = document.getElementById('whatsNewNotice');
  const whatsNewVersionLine = document.getElementById('whatsNewVersionLine');
  const dismissWhatsNewButton = document.getElementById('dismissWhatsNew');
  const usageConsentNotice = document.getElementById('usageConsentNotice');
  const acceptUsageConsentButton = document.getElementById('acceptUsageConsent');
  const declineUsageConsentButton = document.getElementById('declineUsageConsent');

  async function refreshWhatsNewNotice() {
    const language = await EWI18n.getStoredLanguage();
    chrome.runtime.sendMessage({ type: 'GET_WHATS_NEW_STATE' }, response => {
      if (chrome.runtime.lastError || !response?.shouldShow || !whatsNewNotice) return;
      whatsNewVersionLine.textContent = `${EWI18n.translate('whatsNewVersion', language)} ${response.currentVersion}`;
      whatsNewNotice.hidden = false;
    });
  }

  function refreshUsageConsentNotice() {
    chrome.runtime.sendMessage({ type: 'GET_USAGE_CONSENT_STATE' }, response => {
      if (chrome.runtime.lastError || !response?.shouldShow || !usageConsentNotice) return;
      usageConsentNotice.hidden = false;
    });
  }

  dismissWhatsNewButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'MARK_WHATS_NEW_SEEN' }, () => {
      if (whatsNewNotice) whatsNewNotice.hidden = true;
    });
  });

  function setUsageConsent(enabled) {
    chrome.runtime.sendMessage({ type: 'SET_USAGE_CONSENT', enabled }, () => {
      if (usageConsentNotice) usageConsentNotice.hidden = true;
    });
  }

  acceptUsageConsentButton.addEventListener('click', () => setUsageConsent(true));
  declineUsageConsentButton.addEventListener('click', () => setUsageConsent(false));

  // 載入儲存的狀態
  chrome.storage.sync.get(['isEnabled'], (result) => {
    enabledToggle.checked = typeof result.isEnabled === 'undefined' ? true : result.isEnabled;
  });

  // 監聽開關變化
  enabledToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ isEnabled: enabledToggle.checked });
    // 通知 content script 狀態改變
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_ENABLED', enabled: enabledToggle.checked });
      }
    });
  });

  openOptionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  openFeedbackLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('feedback.html') });
  });

  refreshWhatsNewNotice();
  refreshUsageConsentNotice();
});
