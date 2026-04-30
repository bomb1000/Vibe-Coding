document.addEventListener('DOMContentLoaded', () => {
  const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview'];
  const OPENAI_MODELS = ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o'];
  const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
  const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
  const DEFAULT_CUSTOM_PROMPT = 'Please translate the text from its original language into natural English. Keep the meaning accurate, choose wording that fits the context, and only output the English translation without explanations.';
  const MANAGED_BALANCE_ENDPOINT = 'https://english-writing-helper-usage.michael-ewh.workers.dev/managed/balance';
  const MANAGED_CHECKOUT_ENDPOINT = 'https://english-writing-helper-usage.michael-ewh.workers.dev/checkout';

  const apiKeyInput = document.getElementById('apiKey');
  const usageModeSelect = document.getElementById('usageMode');
  const byokSettings = document.getElementById('byokSettings');
  const managedSettings = document.getElementById('managedSettings');
  const managedLicenseKeyInput = document.getElementById('managedLicenseKey');
  const managedCreditBalanceSpan = document.getElementById('managedCreditBalance');
  const refreshManagedBalanceButton = document.getElementById('refreshManagedBalance');
  const managedBuyButtons = document.querySelectorAll('.managed-buy');
  const writingStyleSelect = document.getElementById('writingStyle');
  const currentGeminiModelSpan = document.getElementById('currentGeminiModel');
  const geminiModelSelect = document.getElementById('geminiModelSelect');
  const currentOpenAIModelSpan = document.getElementById('currentOpenAIModel');
  const openaiModelSelect = document.getElementById('openaiModelSelect');
  const saveButton = document.getElementById('saveOptions');
  const statusDiv = document.getElementById('status');
  const apiProviderSelect = document.getElementById('apiProvider');
  const geminiKeyGroup = document.getElementById('geminiKeyGroup');
  const openaiKeyGroup = document.getElementById('openaiKeyGroup');
  const openaiApiKeyInput = document.getElementById('openaiApiKey');
  const customPromptEnabledInput = document.getElementById('customPromptEnabled');
  const customPromptInput = document.getElementById('customPrompt');
  const resetPromptButton = document.getElementById('resetPrompt');
  const openShortcutSettingsButton = document.getElementById('openShortcutSettings');
  const uiLanguageSelect = document.getElementById('uiLanguage');
  const anonymousUsageEnabledInput = document.getElementById('anonymousUsageEnabled');
  const whatsNewNotice = document.getElementById('whatsNewNotice');
  const whatsNewVersionLine = document.getElementById('whatsNewVersionLine');
  const dismissWhatsNewButton = document.getElementById('dismissWhatsNew');
  const usageConsentNotice = document.getElementById('usageConsentNotice');
  const acceptUsageConsentButton = document.getElementById('acceptUsageConsent');
  const declineUsageConsentButton = document.getElementById('declineUsageConsent');

  let currentLanguage = 'en';

  async function refreshLanguage() {
    currentLanguage = await EWI18n.applyDocument();
    uiLanguageSelect.value = await EWI18n.getRawStoredLanguage();
  }

  function text(key) {
    return EWI18n.translate(key, currentLanguage);
  }

  function refreshWhatsNewNotice() {
    chrome.runtime.sendMessage({ type: 'GET_WHATS_NEW_STATE' }, response => {
      if (chrome.runtime.lastError || !response?.shouldShow || !whatsNewNotice) return;
      whatsNewVersionLine.textContent = `${text('whatsNewVersion')} ${response.currentVersion}`;
      whatsNewNotice.hidden = false;
    });
  }

  function refreshUsageConsentNotice() {
    chrome.runtime.sendMessage({ type: 'GET_USAGE_CONSENT_STATE' }, response => {
      if (chrome.runtime.lastError || !response?.shouldShow || !usageConsentNotice) return;
      usageConsentNotice.hidden = false;
    });
  }

  function populateSelect(selectElement, models) {
    selectElement.innerHTML = ''; // Added this line
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      selectElement.appendChild(option);
    });
  }
  populateSelect(geminiModelSelect, GEMINI_MODELS);
  populateSelect(openaiModelSelect, OPENAI_MODELS);

  // 載入儲存的設定
  function updateCustomPromptState() {
    customPromptInput.disabled = !customPromptEnabledInput.checked;
    customPromptInput.style.opacity = customPromptEnabledInput.checked ? '1' : '0.6';
  }

  function updateUsageModeState() {
    const mode = usageModeSelect.value || 'byok';
    byokSettings.hidden = mode !== 'byok';
    managedSettings.hidden = mode !== 'managed';
  }

  async function refreshManagedBalance() {
    const licenseKey = managedLicenseKeyInput.value.trim();
    if (!licenseKey) {
      managedCreditBalanceSpan.textContent = '--';
      return;
    }
    managedCreditBalanceSpan.textContent = text('managedBalanceLoading');
    try {
      const anonymousUserId = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_ANONYMOUS_USAGE_ID' }, response => {
          resolve(response?.anonymousUserId || '');
        });
      });
      const url = new URL(MANAGED_BALANCE_ENDPOINT);
      url.searchParams.set('licenseKey', licenseKey);
      if (anonymousUserId) url.searchParams.set('anonymousUserId', anonymousUserId);
      const response = await fetch(url.toString());
      const data = await response.json();
      if (!response.ok || !data.ok) {
        managedCreditBalanceSpan.textContent = data.error || text('managedBalanceUnavailable');
        return;
      }
      managedCreditBalanceSpan.textContent = `${Number(data.balanceCharacters || 0).toLocaleString('en-US')} ${text('managedCharactersUnit')}`;
    } catch (error) {
      managedCreditBalanceSpan.textContent = text('managedBalanceUnavailable');
    }
  }

  refreshLanguage();

  chrome.storage.sync.get(['usageMode', 'apiProvider', 'geminiApiKey', 'openaiApiKey', 'writingStyle', 'geminiUserSelectedModel', 'openaiUserSelectedModel', 'customPromptEnabled', 'customPrompt', 'anonymousUsageEnabled', 'managedLicenseKey'], (result) => {
    usageModeSelect.value = result.usageMode || 'byok';
    managedLicenseKeyInput.value = result.managedLicenseKey || '';
    if (result.apiProvider) {
      apiProviderSelect.value = result.apiProvider;
      geminiKeyGroup.style.display = result.apiProvider === 'gemini' ? 'block' : 'none';
      openaiKeyGroup.style.display = result.apiProvider === 'openai' ? 'block' : 'none';
    }
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.openaiApiKey) {
      openaiApiKeyInput.value = result.openaiApiKey;
    }
    if (result.writingStyle) {
      writingStyleSelect.value = result.writingStyle;
    }
    // After other settings are loaded...
    const savedGeminiModel = result.geminiUserSelectedModel || DEFAULT_GEMINI_MODEL;
    currentGeminiModelSpan.textContent = savedGeminiModel;
    geminiModelSelect.value = savedGeminiModel;

    const savedOpenAIModel = result.openaiUserSelectedModel || DEFAULT_OPENAI_MODEL;
    currentOpenAIModelSpan.textContent = savedOpenAIModel;
    openaiModelSelect.value = savedOpenAIModel;

    customPromptEnabledInput.checked = result.customPromptEnabled === true;
    customPromptInput.value = result.customPrompt || DEFAULT_CUSTOM_PROMPT;
    anonymousUsageEnabledInput.checked = result.anonymousUsageEnabled === true;
    updateCustomPromptState();
    updateUsageModeState();
    refreshWhatsNewNotice();
    refreshUsageConsentNotice();
    if (usageModeSelect.value === 'managed' && result.managedLicenseKey) refreshManagedBalance();
  });

  usageModeSelect.addEventListener('change', updateUsageModeState);

  uiLanguageSelect.addEventListener('change', async () => {
    await EWI18n.setLanguage(uiLanguageSelect.value);
    await refreshLanguage();
    if (whatsNewNotice && !whatsNewNotice.hidden) refreshWhatsNewNotice();
  });

  dismissWhatsNewButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'MARK_WHATS_NEW_SEEN' }, () => {
      if (whatsNewNotice) whatsNewNotice.hidden = true;
    });
  });

  function setUsageConsent(enabled) {
    chrome.runtime.sendMessage({ type: 'SET_USAGE_CONSENT', enabled }, () => {
      anonymousUsageEnabledInput.checked = enabled;
      if (usageConsentNotice) usageConsentNotice.hidden = true;
    });
  }

  acceptUsageConsentButton.addEventListener('click', () => setUsageConsent(true));
  declineUsageConsentButton.addEventListener('click', () => setUsageConsent(false));

  apiProviderSelect.addEventListener('change', () => {
    const provider = apiProviderSelect.value;
    geminiKeyGroup.style.display = provider === 'gemini' ? 'block' : 'none';
    openaiKeyGroup.style.display = provider === 'openai' ? 'block' : 'none';
  });

  customPromptEnabledInput.addEventListener('change', updateCustomPromptState);

  resetPromptButton.addEventListener('click', () => {
    customPromptInput.value = DEFAULT_CUSTOM_PROMPT;
    customPromptEnabledInput.checked = true;
    updateCustomPromptState();
  });

  openShortcutSettingsButton.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  refreshManagedBalanceButton.addEventListener('click', refreshManagedBalance);
  managedBuyButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const anonymousUserId = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_ANONYMOUS_USAGE_ID' }, response => {
          resolve(response?.anonymousUserId || '');
        });
      });
      const url = new URL(MANAGED_CHECKOUT_ENDPOINT);
      url.searchParams.set('package', button.dataset.packageId || 'starter');
      if (managedLicenseKeyInput.value.trim()) url.searchParams.set('licenseKey', managedLicenseKeyInput.value.trim());
      if (anonymousUserId) url.searchParams.set('anonymousUserId', anonymousUserId);
      if (anonymousUsageEnabledInput.checked) url.searchParams.set('analyticsBonus', '1');
      chrome.tabs.create({ url: url.toString() });
    });
  });

  // 儲存設定
  saveButton.addEventListener('click', () => {
    const provider = apiProviderSelect.value;
    const usageMode = usageModeSelect.value || 'byok';
    const apiKey = apiKeyInput.value.trim();
    const openaiKey = openaiApiKeyInput.value.trim();
    const managedLicenseKey = managedLicenseKeyInput.value.trim();
    const style = writingStyleSelect.value;
    const customPromptEnabled = customPromptEnabledInput.checked;
    const customPrompt = customPromptInput.value.trim();
    const anonymousUsageEnabled = anonymousUsageEnabledInput.checked;

    if (usageMode === 'byok' && provider === 'gemini' && !apiKey) {
      statusDiv.textContent = text('geminiKeyRequired');
      statusDiv.style.color = 'red';
      return;
    }
    if (usageMode === 'byok' && provider === 'openai' && !openaiKey) {
      statusDiv.textContent = text('openaiKeyRequired');
      statusDiv.style.color = 'red';
      return;
    }
    if (usageMode === 'managed' && !managedLicenseKey) {
      statusDiv.textContent = text('managedLicenseRequired');
      statusDiv.style.color = 'red';
      return;
    }
    if (customPromptEnabled && !customPrompt) {
      statusDiv.textContent = text('customPromptRequired');
      statusDiv.style.color = 'red';
      return;
    }

    chrome.storage.sync.set({
      usageMode,
      apiProvider: provider,
      geminiApiKey: apiKey,
      openaiApiKey: openaiKey,
      managedLicenseKey,
      writingStyle: style,
      geminiUserSelectedModel: geminiModelSelect.value,
      openaiUserSelectedModel: openaiModelSelect.value,
      customPromptEnabled,
      customPrompt,
      anonymousUsageEnabled,
    }, () => {
      statusDiv.textContent = text('saveSuccess');
      currentGeminiModelSpan.textContent = geminiModelSelect.value;
      currentOpenAIModelSpan.textContent = openaiModelSelect.value;
      statusDiv.style.color = 'green';
      if (usageMode === 'managed') refreshManagedBalance();
      setTimeout(() => { statusDiv.textContent = ''; }, 3000);
    });
  });
}); 
