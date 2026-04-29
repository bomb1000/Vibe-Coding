console.log("EW_BACKGROUND_TOPLEVEL: background.js script started parsing.");
const EW_USAGE_ID_KEY = 'ewAnonymousUsageId';
const EW_USAGE_STATS_KEY = 'ewUsageStats';
const EW_USAGE_REPORT_ENDPOINT = '';
const EW_WHATS_NEW_KEY = 'ewWhatsNewState';

// 監聽來自 content_script 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TRANSLATE_TEXT') {
    translateAndTrack(request.text, request.style, 'content_script')
      .then(sendResponse)
      .catch(error => {
        console.error('Translation error:', error);
        sendResponse({ error: error.message || 'Translation failed' });
      });
    return true; // 表示我們將異步發送響應
  } else if (request.type === 'GET_SHORTCUT_INFO') {
    console.log("EW_BACKGROUND: Received GET_SHORTCUT_INFO request.");
    chrome.commands.getAll(commands => {
      if (chrome.runtime.lastError) {
        console.error("EW_BACKGROUND: Error getting commands:", chrome.runtime.lastError.message);
        sendResponse({ shortcut: "Error: Could not retrieve shortcuts" });
        return;
      }
      const translateCmd = commands.find(cmd => cmd.name === "translate-selection");
      if (translateCmd) {
        console.log("EW_BACKGROUND: Sending 'translate-selection' shortcut:", translateCmd.shortcut);
        sendResponse({ shortcut: translateCmd.shortcut || "N/A" }); // "N/A" if user cleared it
      } else {
        console.error("EW_BACKGROUND: 'translate-selection' command not found.");
        sendResponse({ shortcut: "Error: Command not found" });
      }
    });
    return true; // Important for async response
  } else if (request.type === 'OPEN_OPTIONS_PAGE') {
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  } else if (request.type === 'OPEN_FEEDBACK_PAGE') {
    chrome.tabs.create({ url: chrome.runtime.getURL('feedback.html') }, tab => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, tabId: tab?.id });
      }
    });
    return true;
  } else if (request.type === 'GET_WHATS_NEW_STATE') {
    getWhatsNewState()
      .then(sendResponse)
      .catch(error => {
        console.error('Whats new state error:', error);
        sendResponse({ shouldShow: false, error: error.message });
      });
    return true;
  } else if (request.type === 'MARK_WHATS_NEW_SEEN') {
    markWhatsNewSeen(request.version)
      .then(sendResponse)
      .catch(error => {
        console.error('Whats new mark seen error:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }
});

function sendMessagePromise(tabId, item, options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, item, options, response => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

async function handleTranslationRequest(text, style) {
  if (!text.trim()) {
    return { translatedText: '' };
  }

  const settings = await chrome.storage.sync.get(['apiProvider', 'geminiApiKey', 'openaiApiKey', 'writingStyle', 'geminiUserSelectedModel', 'openaiUserSelectedModel', 'customPromptEnabled', 'customPrompt']);
  const apiProvider = settings.apiProvider || 'gemini';
  const currentStyle = style || settings.writingStyle || 'formal';
  const customInstruction = settings.customPromptEnabled && settings.customPrompt ? settings.customPrompt.trim() : '';

  const prompt = buildPrompt(text, currentStyle, customInstruction);
  const systemInstruction = buildSystemInstruction(currentStyle, customInstruction);

  if (apiProvider === 'openai') {
    // OpenAI API
    if (!settings.openaiApiKey) {
      throw new Error('OpenAI API Key not configured. Please set it in the extension options.');
    }
    const API_URL = 'https://api.openai.com/v1/chat/completions';
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.openaiApiKey}`
        },
        body: JSON.stringify({
          model: settings.openaiUserSelectedModel || 'gpt-5.4-mini',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: text }
          ]
        })
      });
      if (!response.ok) {
        let errorText = await response.text();
        let errorData;
        try { errorData = JSON.parse(errorText); } catch (e) { errorData = { error: { message: errorText } }; }
        throw new Error(`API Error: ${JSON.stringify(errorData)}`);
      }
      const data = await response.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
        return { translatedText: cleanTranslationText(data.choices[0].message.content) };
      } else {
        throw new Error('Could not extract translation from OpenAI API response.');
      }
    } catch (error) {
      throw error;
    }
  } else {
    // Gemini API (預設)
    if (!settings.geminiApiKey) {
      throw new Error('Gemini API Key not configured. Please set it in the extension options.');
    }
    const geminiModelToUse = settings.geminiUserSelectedModel || 'gemini-2.5-flash';
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelToUse}:generateContent?key=${settings.geminiApiKey}`;
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
        }),
      });
      if (!response.ok) {
        let errorText = await response.text();
        let errorData;
        try { errorData = JSON.parse(errorText); } catch (e) { errorData = { error: { message: errorText } }; }
        throw new Error(`API Error: ${JSON.stringify(errorData)}`);
      }
      const data = await response.json();
      console.log("EW_BACKGROUND_API_RESPONSE: Raw JSON response from Gemini API:", JSON.parse(JSON.stringify(data)));
      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
        const translatedText = data.candidates[0].content.parts[0].text;
        return { translatedText: cleanTranslationText(translatedText) };
      } else if (data.promptFeedback && data.promptFeedback.blockReason) {
        throw new Error(`Content blocked by API: ${data.promptFeedback.blockReason}`);
      } else {
        throw new Error('Could not extract translation from Gemini API response.');
      }
    } catch (error) {
      throw error;
    }
  }
}

function buildSystemInstruction(style, customInstruction = '') {
  const outputRule = 'Only output the final English translation itself. Do not add any prefix, title, label, explanation, quotation wrapper, or phrase like "Here is the translation".';
  if (customInstruction) {
    return `${customInstruction}\n\n${outputRule}`;
  }
  return style === 'formal' ?
    `You are a professional English translator. Translate the user's text from its original language into formal, written English suitable for academic or professional contexts. ${outputRule}` :
    `You are a native English speaker. Translate the user's text from its original language into casual, spoken English as if chatting with a friend. ${outputRule}`;
}

function buildPrompt(sourceText, style, customInstruction = '') {
  const outputRule = 'Only output the final English translation itself. Do not add any prefix, title, label, explanation, quotation wrapper, or phrase like "Here is the translation".';
  if (customInstruction) {
    return `${customInstruction}\n\n${outputRule}\n\nSource text: \"${sourceText}\"\n\nEnglish:`;
  }
  let styleDescription = "";
  if (style === 'formal') {
    styleDescription = "Please translate the following text from its original language into formal, written English suitable for academic or professional contexts. Ensure the translation is accurate, grammatically correct, and maintains a professional tone.";
  } else {
    styleDescription = "Please translate the following text from its original language into casual, spoken English, like how a native speaker would chat with a friend. Use common idioms and contractions if appropriate, but keep it natural.";
  }
  return `${styleDescription}\n\n${outputRule}\n\nSource text: \"${sourceText}\"\n\nEnglish:`;
}

function cleanTranslationText(text) {
  return String(text || '')
    .trim()
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/^(?:here(?:'s| is)\s+(?:the\s+)?(?:formal\s+written\s+|casual\s+|english\s+)?translation(?:\s+in\s+english)?|the\s+(?:formal\s+written\s+|casual\s+|english\s+)?translation\s+is|english(?:\s+translation)?|translation)\s*[:：\-–—]\s*/i, '')
    .trim();
}

function storageLocalGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, result => resolve(result || {})));
}

function storageLocalSet(values) {
  return new Promise(resolve => chrome.storage.local.set(values, resolve));
}

async function getWhatsNewState() {
  const currentVersion = chrome.runtime.getManifest().version;
  const stored = await storageLocalGet([EW_WHATS_NEW_KEY]);
  const state = stored[EW_WHATS_NEW_KEY] || {};
  return {
    previousVersion: state.previousVersion || '',
    currentVersion: state.currentVersion || currentVersion,
    hasSeenWhatsNew: state.hasSeenWhatsNew !== false,
    shouldShow: state.currentVersion === currentVersion && state.hasSeenWhatsNew === false,
    updatedAt: state.updatedAt || ''
  };
}

async function markWhatsNewSeen(version) {
  const currentVersion = chrome.runtime.getManifest().version;
  const targetVersion = version || currentVersion;
  const stored = await storageLocalGet([EW_WHATS_NEW_KEY]);
  const state = stored[EW_WHATS_NEW_KEY] || {};
  await storageLocalSet({
    [EW_WHATS_NEW_KEY]: {
      ...state,
      currentVersion: targetVersion,
      hasSeenWhatsNew: true,
      seenAt: new Date().toISOString()
    }
  });
  return { ok: true };
}

function storageSyncGet(keys) {
  return new Promise(resolve => chrome.storage.sync.get(keys, result => resolve(result || {})));
}

function makeAnonymousUsageId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `EWH-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{1,4}/g).join('-')}`;
}

async function getAnonymousUsageId() {
  const stored = await storageLocalGet([EW_USAGE_ID_KEY]);
  if (stored[EW_USAGE_ID_KEY]) return stored[EW_USAGE_ID_KEY];
  const id = makeAnonymousUsageId();
  await storageLocalSet({ [EW_USAGE_ID_KEY]: id });
  return id;
}

function getDateBucket() {
  return new Date().toISOString().slice(0, 10);
}

function countCharacters(text) {
  return Array.from(String(text || '').trim()).length;
}

async function updateLocalUsageStats(event) {
  const stored = await storageLocalGet([EW_USAGE_STATS_KEY]);
  const stats = stored[EW_USAGE_STATS_KEY] || {
    totalTranslationAttempts: 0,
    successfulTranslations: 0,
    failedTranslations: 0,
    sourceCharCount: 0,
    outputCharCount: 0,
    byDate: {}
  };
  const date = event.dateBucket;
  stats.byDate[date] = stats.byDate[date] || {
    totalTranslationAttempts: 0,
    successfulTranslations: 0,
    failedTranslations: 0,
    sourceCharCount: 0,
    outputCharCount: 0
  };

  stats.totalTranslationAttempts += 1;
  stats.sourceCharCount += event.sourceCharCount;
  stats.outputCharCount += event.outputCharCount;
  stats.byDate[date].totalTranslationAttempts += 1;
  stats.byDate[date].sourceCharCount += event.sourceCharCount;
  stats.byDate[date].outputCharCount += event.outputCharCount;

  if (event.status === 'success') {
    stats.successfulTranslations += 1;
    stats.byDate[date].successfulTranslations += 1;
  } else {
    stats.failedTranslations += 1;
    stats.byDate[date].failedTranslations += 1;
  }

  await storageLocalSet({ [EW_USAGE_STATS_KEY]: stats });
}

async function sendRemoteUsageEvent(event) {
  if (!EW_USAGE_REPORT_ENDPOINT) return;
  try {
    await fetch(EW_USAGE_REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true
    });
  } catch (error) {
    console.warn('EW_USAGE: Could not send anonymous usage event:', error.message);
  }
}

async function recordUsageEvent({ sourceText, translatedText = '', status, provider, style, source }) {
  const settings = await storageSyncGet(['anonymousUsageEnabled']);
  if (settings.anonymousUsageEnabled === false) return;

  const event = {
    anonymousUserId: await getAnonymousUsageId(),
    event: 'translation_completed',
    status,
    sourceCharCount: countCharacters(sourceText),
    outputCharCount: countCharacters(translatedText),
    provider: provider || 'unknown',
    style: style || 'formal',
    source: source || 'unknown',
    extensionVersion: chrome.runtime.getManifest().version,
    dateBucket: getDateBucket()
  };

  await updateLocalUsageStats(event);
  await sendRemoteUsageEvent(event);
}

async function translateAndTrack(text, style, source) {
  const settings = await storageSyncGet(['apiProvider', 'writingStyle']);
  const provider = settings.apiProvider || 'gemini';
  const currentStyle = style || settings.writingStyle || 'formal';
  try {
    const result = await handleTranslationRequest(text, currentStyle);
    await recordUsageEvent({
      sourceText: text,
      translatedText: result.translatedText || '',
      status: 'success',
      provider,
      style: currentStyle,
      source
    });
    return result;
  } catch (error) {
    await recordUsageEvent({
      sourceText: text,
      translatedText: '',
      status: 'failed',
      provider,
      style: currentStyle,
      source
    });
    throw error;
  }
}

// Function to setup context menus
function setupContextMenus() {
  console.log("EW_BACKGROUND_SETUP: Entering setupContextMenus function, about to remove all menus.");
  try {
    chrome.contextMenus.removeAll(() => { // Remove all to prevent duplicates during development
      console.log("EW_BACKGROUND_SETUP: All context menus removed (if any). Ready to create new ones.");
      
      console.log("EW_BACKGROUND_SETUP: Creating context menu item: toggleExtensionState");
      chrome.contextMenus.create({
        id: "toggleExtensionState",
        title: "啟用/停用英文寫作助手", // Enable/Disable English Writing Assistant
        contexts: ["action"] // Changed from "all" to "action" (browser action icon)
      });
      
      console.log("EW_BACKGROUND_SETUP: Creating context menu item: translateSelectedText");
      chrome.contextMenus.create({
        id: "translateSelectedText",
        title: "翻譯選取文字", // Translate Selected Text
        contexts: ["selection"]
      });
      
      console.log("EW_BACKGROUND_SETUP: Finished attempting to create context menus.");
    });
  } catch (e) {
    console.error("EW_BACKGROUND_SETUP: Error during setupContextMenus:", e);
  }
}

// Call setup on install or startup
chrome.runtime.onInstalled.addListener((details) => {
  console.log("EW_BACKGROUND_INSTALL: onInstalled event triggered. Details:", JSON.parse(JSON.stringify(details)));
  const currentVersion = chrome.runtime.getManifest().version;
  if (details.reason === 'update') {
    storageLocalSet({
      [EW_WHATS_NEW_KEY]: {
        previousVersion: details.previousVersion || '',
        currentVersion,
        hasSeenWhatsNew: false,
        updatedAt: new Date().toISOString()
      }
    });
  } else if (details.reason === 'install') {
    storageLocalSet({
      [EW_WHATS_NEW_KEY]: {
        previousVersion: '',
        currentVersion,
        hasSeenWhatsNew: true,
        updatedAt: new Date().toISOString()
      }
    });
  }
  setupContextMenus();
});
// chrome.runtime.onStartup.addListener(setupContextMenus); // Optional: re-create on browser startup

// Refactored function to get selected text and translate
async function getSelectedTextAndTranslate(tab, style = null) {
  console.log("EW_BACKGROUND: getSelectedTextAndTranslate called. Tab ID:", tab?.id);
  if (!tab || typeof tab.id === 'undefined') {
    console.error("EW_BACKGROUND: Invalid tab object or Tab ID is missing in getSelectedTextAndTranslate.");
    // Cannot send message to content script if tab.id is missing.
    return;
  }

  try {
    console.log(`EW_BACKGROUND: Pinging content script in tab ${tab.id}`);
    const pong = await sendMessagePromise(tab.id, { type: "PING_CONTENT_SCRIPT" }, { frameId: 0 });
    if (pong?.type !== "PONG_FROM_CONTENT") {
      console.error(`EW_BACKGROUND: Content script in tab ${tab.id} did not respond correctly to ping.`);
      chrome.tabs.sendMessage(tab.id, { type: "DISPLAY_TRANSLATION", data: { error: "Error: Content script not responsive. Please try refreshing the page." } }, { frameId: 0 });
      return;
    }
    console.log(`EW_BACKGROUND: Content script in tab ${tab.id} responded to ping.`);
  } catch (pingError) {
    console.error(`EW_BACKGROUND: Error pinging content script in tab ${tab.id}:`, pingError.message);
    chrome.tabs.sendMessage(tab.id, { type: "DISPLAY_TRANSLATION", data: { error: "Error: Content script unreachable. Please try refreshing the page." } }, { frameId: 0 });
    return;
  }

  // Now, proceed with TRANSLATION_STARTED (already specifying frameId: 0 from previous fix)
  console.log("EW_BACKGROUND: Sending TRANSLATION_STARTED to tab:", tab.id);
  // Note: This sendMessage doesn't need a response, so not using sendMessagePromise here.
  chrome.tabs.sendMessage(tab.id, { type: "TRANSLATION_STARTED" }, { frameId: 0 });

  console.log("EW_BACKGROUND: Attempting to execute script to get selection in tab:", tab.id);
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => window.getSelection().toString()
  }, async (injectionResults) => { // Made this callback async to use await for handleTranslationRequest
    if (chrome.runtime.lastError) {
      console.error("EW_BACKGROUND: Error executing script to get selection:", chrome.runtime.lastError.message);
      chrome.tabs.sendMessage(tab.id, { type: "DISPLAY_TRANSLATION", data: { error: "Error getting selected text: " + chrome.runtime.lastError.message } }, { frameId: 0 });
      return;
    }
    console.log("EW_BACKGROUND: Injection results received:", JSON.parse(JSON.stringify(injectionResults)));

    if (!injectionResults || injectionResults.length === 0 || !injectionResults[0].result) {
      console.log("EW_BACKGROUND: No text selected or could not retrieve selection.");
      chrome.tabs.sendMessage(tab.id, { type: "DISPLAY_TRANSLATION", data: { error: "No text was selected to translate." } }, { frameId: 0 });
      return;
    }
    
    const selectedText = injectionResults[0].result.trim();
    
    if (selectedText) {
      console.log("EW_BACKGROUND: Selected text for translation:", selectedText);
      try {
        const translationResult = await translateAndTrack(selectedText, style, 'selection');
        console.log("EW_BACKGROUND: Translation successful, sending to content script. Result:", JSON.parse(JSON.stringify(translationResult)));
        chrome.tabs.sendMessage(tab.id, { type: "DISPLAY_TRANSLATION", data: translationResult }, { frameId: 0 });
      } catch (error) {
        console.error("EW_BACKGROUND: Translation failed, sending error to content script. Error:", error.message);
        chrome.tabs.sendMessage(tab.id, { type: "DISPLAY_TRANSLATION", data: { error: error.message || "An unknown error occurred during translation." } }, { frameId: 0 });
      }
    } else {
      console.log("EW_BACKGROUND: Selected text is empty after trim.");
      chrome.tabs.sendMessage(tab.id, { type: "DISPLAY_TRANSLATION", data: { error: "Selected text is empty." } }, { frameId: 0 });
    }
  });
}

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "toggleExtensionState") {
    // Ensure tab.id check for sendMessage
    if (tab && tab.id) { 
      chrome.storage.sync.get(['isEnabled'], (result) => {
        const newState = typeof result.isEnabled === 'undefined' ? false : !result.isEnabled;
        chrome.storage.sync.set({ isEnabled: newState }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error setting isEnabled:", chrome.runtime.lastError);
            return;
          }
          chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_ENABLED', enabled: newState }, { frameId: 0 }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn("EW: Could not send TOGGLE_ENABLED to tab " + tab.id + ". It might be a system page or closed.", chrome.runtime.lastError.message);
            }
          });
        });
      });
    }
  } else if (info.menuItemId === "translateSelectedText") {
    console.log("EW_BACKGROUND: 'translateSelectedText' context menu clicked. Info:", JSON.parse(JSON.stringify(info)), "Tab:", JSON.parse(JSON.stringify(tab)));
    getSelectedTextAndTranslate(tab); // Call the refactored function
  }
});

// Listener for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command, tab) => {
  console.log("EW_BACKGROUND: Command received:", command, "Tab:", JSON.parse(JSON.stringify(tab)));
  if (command === "translate-selection") {
    if (tab) {
      getSelectedTextAndTranslate(tab); // Call the refactored function
    } else {
      console.error("EW_BACKGROUND: Tab object is undefined for command:", command);
    }
  }
});
