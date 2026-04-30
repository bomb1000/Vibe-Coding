console.log("EW_CONTENT: Script started injecting/running. Timestamp:", Date.now());
try {
// Global variables
let isFabDragging = false;
let fabDragStartX = 0, fabDragStartY = 0;
let fabInitialX = 0, fabInitialY = 0;
let fabWasDragged = false; // To distinguish drag from click
const EW_FAB_STORAGE_KEY = 'ewFabPosition'; // Unique key

let sidebar = null;
let sidebarContent = null;
let ewSidebarHeader = null; 
let fabButton = null; // Added fabButton
let fabObserver = null; // Observer for FAB
let isExtensionEnabled = true;
let ewFontSizeMultiplier = 1.0; 
const EW_BASE_FONT_SIZE = 14; 
const EW_INPUT_DEBOUNCE_MS = 900;
const EW_MIN_INPUT_LENGTH = 2;
const EW_NON_ENGLISH_SIGNAL_RE = /[^\x00-\x7F]/;
const EW_BOPOMOFO_ONLY_RE = /^[\u3100-\u312F\u31A0-\u31BF\s˙ˊˇˋ]+$/;
let ewInputListenerAttached = false;
let ewInputDebounceTimer = null;
let ewLastSubmittedInputText = '';
const ewComposingTargets = new WeakSet();

let isEwDragging = false;
let ewDragStartX = 0, ewDragStartY = 0;
let ewSidebarInitialX = 0, ewSidebarInitialY = 0;

let isEwResizing = false;
let ewResizeType = ''; 
let ewResizeStartX = 0, ewResizeStartY = 0;
let ewInitialSidebarWidth = 0, ewInitialSidebarHeight = 0;
let ewInitialSidebarLeft = 0; 

const EW_SIDEBAR_MIN_WIDTH = 200; 
const EW_SIDEBAR_MAX_WIDTH = 800; 
const EW_SIDEBAR_MIN_HEIGHT = 150; 
let EW_SIDEBAR_MAX_HEIGHT = 600; 
let ewUiLanguage = EWI18n.detectLanguage();

function ewT(key) {
  return EWI18n.translate(key, ewUiLanguage);
}

function updateExistingUiText() {
  const header = document.getElementById('ew-sidebar-header');
  if (header) header.textContent = ewT('sidebarTitle');
  const optionsButton = document.getElementById('ew-options-button');
  if (optionsButton) {
    optionsButton.title = ewT('optionsTitle');
    optionsButton.setAttribute('aria-label', ewT('optionsAria'));
  }
  const feedbackButton = document.getElementById('ew-feedback-button');
  if (feedbackButton) feedbackButton.textContent = ewT('feedbackButton');
  const copyButton = document.getElementById('ew-copy-button');
  if (copyButton && copyButton.dataset.copied !== 'true') copyButton.textContent = ewT('copyTranslation');
  const whatsNewTitle = document.getElementById('ew-whats-new-title');
  if (whatsNewTitle) whatsNewTitle.textContent = ewT('whatsNewTitle');
  const whatsNewBody = document.getElementById('ew-whats-new-body');
  if (whatsNewBody) whatsNewBody.textContent = ewT('whatsNewBody');
  const whatsNewButton = document.getElementById('ew-whats-new-dismiss');
  if (whatsNewButton) whatsNewButton.textContent = ewT('whatsNewDismiss');
  const usageConsentTitle = document.getElementById('ew-usage-consent-title');
  if (usageConsentTitle) usageConsentTitle.textContent = ewT('usageConsentTitle');
  const usageConsentBody = document.getElementById('ew-usage-consent-body');
  if (usageConsentBody) usageConsentBody.textContent = ewT('usageConsentBody');
  const usageConsentBonus = document.getElementById('ew-usage-consent-bonus');
  if (usageConsentBonus) usageConsentBonus.textContent = ewT('usageConsentBonus');
  const usageConsentAccept = document.getElementById('ew-usage-consent-accept');
  if (usageConsentAccept) usageConsentAccept.textContent = ewT('usageConsentAccept');
  const usageConsentDecline = document.getElementById('ew-usage-consent-decline');
  if (usageConsentDecline) usageConsentDecline.textContent = ewT('usageConsentDecline');
}

EWI18n.getStoredLanguage().then(language => {
  ewUiLanguage = language;
  updateExistingUiText();
});

// Refactored Initialization Logic
let domReady = (document.readyState === "complete" || document.readyState === "interactive");
let settingsLoaded = false; // Flag to track if settings are loaded

function attemptInitialize() {
    // console.log("EW_CONTENT_DEBUG: attemptInitialize called. domReady:", domReady, "settingsLoaded:", settingsLoaded, "isExtensionEnabled:", isExtensionEnabled);
    if (domReady && settingsLoaded && isExtensionEnabled) {
        console.log("EW_CONTENT: DOM ready, settings loaded, and extension enabled. Initializing UI.");
        initializeUI();
    } else if (domReady && settingsLoaded && !isExtensionEnabled) {
        console.log("EW_CONTENT: DOM ready, settings loaded, but extension is disabled. Not initializing UI.");
        // removeUI(); // Be cautious if removeUI itself depends on initialized elements
    }
}

if (chrome.runtime?.id) {
  chrome.storage.sync.get(['isEnabled', 'writingStyle'], (result) => {
    console.log("EW_CONTENT: Storage settings received.", result);
    isExtensionEnabled = typeof result.isEnabled === 'undefined' ? true : result.isEnabled;
    // writingStyle is loaded here but used elsewhere (e.g. triggerTranslation)
    settingsLoaded = true;
    attemptInitialize(); // Attempt to initialize after settings are loaded
  });
} else {
  console.log("EW_CONTENT: Context invalidated, cannot load settings. Assuming disabled.");
  isExtensionEnabled = false;
  settingsLoaded = true; // Mark as loaded to allow domReady check to proceed if it happens
  attemptInitialize();
}

// DOMContentLoaded listener
if (!domReady) {
    document.addEventListener("DOMContentLoaded", () => {
        console.log("EW_CONTENT: DOMContentLoaded event fired.");
        domReady = true;
        attemptInitialize(); // Attempt to initialize once DOM is ready
    });
} else {
    // If DOM is already ready when this part of script runs,
    // settings might not be loaded yet, attemptInitialize will handle that.
    attemptInitialize();
}

// Listen for messages from popup or background
try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`EW_CONTENT: Message received - Type: ${request?.type}, From: ${sender?.id}, Tab: ${sender?.tab?.id}`);
    if (request.type === 'TOGGLE_ENABLED') {
      isExtensionEnabled = request.enabled;
      if (isExtensionEnabled) {
        initializeUI(); // This will correctly do nothing in an iframe
        if (window.self === window.top && sidebar) { // Explicit check for top frame
          sidebar.style.display = 'block'; 
        }
      } else {
        if (window.self === window.top) { // removeUI should only run in top frame
            removeUI();
        }
      }
      sendResponse({ status: "Visibility toggled" });
    } else if (request.type === 'UPDATE_SIDEBAR') {
      if (window.self === window.top) { // Explicit check for top frame
        if (sidebarContent && isExtensionEnabled) {
          sidebarContent.textContent = request.text;
        }
      }
      sendResponse({ status: "Sidebar updated" });
    } else if (request.type === 'TRANSLATION_STARTED') {
      console.log("EW: content.js received TRANSLATION_STARTED message.");
      if (window.self === window.top) { // Explicit check for top frame
        if (!sidebar || !sidebarContent) {
            console.log("EW: Sidebar panel not fully initialized (top frame), creating it now for TRANSLATION_STARTED.");
            createSidebar();
        }
        
        if (sidebarContent) {
            sidebarContent.innerHTML = `<span class="ew-loading-spinner"></span> ${ewT('translating')}`;
        }

        const copyButton = document.getElementById('ew-copy-button');
        if (copyButton) {
            copyButton.style.display = 'none';
        }

        // Ensure the panel is open if a translation is started
        if (sidebar && fabButton && !sidebar.classList.contains('open')) {
           console.log("EW: Translation started, ensuring panel is open.");
           sidebar.classList.add('open');
           fabButton.textContent = '✕';
        }

      } else {
        console.log("EW: TRANSLATION_STARTED received in iframe, not creating or manipulating sidebar.");
      }
      sendResponse({ status: "Translation started UI updated" });

    } else if (request.type === 'DISPLAY_TRANSLATION') {
      console.log("EW: content.js received DISPLAY_TRANSLATION message.");
      if (window.self === window.top) { // Explicit check for top frame
        if (!sidebar || !sidebarContent) {
          console.log("EW: Sidebar panel not fully initialized (top frame), creating it now for DISPLAY_TRANSLATION.");
          createSidebar();
        }

        const copyButton = document.getElementById('ew-copy-button');

        if (request.data) {
          if (request.data.translatedText && request.data.translatedText.trim() !== "") {
            if(sidebarContent) sidebarContent.textContent = request.data.translatedText;
            if (copyButton) copyButton.style.display = 'block';
          } else if (request.data.error) {
            if(sidebarContent) sidebarContent.textContent = request.data.error;
            if (copyButton) copyButton.style.display = 'none';
          } else {
            if(sidebarContent) sidebarContent.textContent = ewT('noTranslationResult');
            if (copyButton) copyButton.style.display = 'none';
          }
        } else {
          if(sidebarContent) sidebarContent.textContent = ewT('invalidTranslationData'); 
          if (copyButton) copyButton.style.display = 'none';
        }

        // Ensure the panel is open if a translation is displayed
        if (sidebar && fabButton && !sidebar.classList.contains('open')) {
           console.log("EW: Translation displayed, ensuring panel is open.");
           sidebar.classList.add('open');
           fabButton.textContent = '✕';
        }

      } else {
        console.log("EW: DISPLAY_TRANSLATION received in iframe, not creating or manipulating sidebar.");
      }
      sendResponse({ status: "Translation displayed" });
    } else if (request.type === 'PING_CONTENT_SCRIPT') {
      console.log("EW_CONTENT: Received PING_CONTENT_SCRIPT, sending PONG.");
      sendResponse({ type: "PONG_FROM_CONTENT" });
      return true;
    }
    return true; 
  });
  console.log("EW_CONTENT: Message listener attached successfully.");
} catch (e) {
  console.error("EW_CONTENT: Error attaching message listener:", e);
}

function onFabMouseDown(event) {
  if (event.button !== 0 || !fabButton) return;
  isFabDragging = true;
  fabWasDragged = false; // Reset drag flag
  fabDragStartX = event.clientX;
  fabDragStartY = event.clientY;
  const fabRect = fabButton.getBoundingClientRect();
  fabInitialX = fabRect.left;
  fabInitialY = fabRect.top;
  fabButton.style.cursor = 'move';
  document.documentElement.style.userSelect = 'none';
  document.addEventListener('mousemove', onFabMouseMove, { passive: false });
  document.addEventListener('mouseup', onFabMouseUp, { once: true });
  event.preventDefault();
}

function onFabMouseMove(event) {
  if (!isFabDragging || !fabButton) return;
  event.preventDefault();
  let deltaX = event.clientX - fabDragStartX;
  let deltaY = event.clientY - fabDragStartY;

  // If moved more than a few pixels, consider it a drag
  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      fabWasDragged = true;
  }

  let newLeft = fabInitialX + deltaX;
  let newTop = fabInitialY + deltaY;
  newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - fabButton.offsetWidth));
  newTop = Math.max(0, Math.min(newTop, window.innerHeight - fabButton.offsetHeight));
  fabButton.style.left = newLeft + 'px';
  fabButton.style.top = newTop + 'px';
  fabButton.style.right = 'auto';
  fabButton.style.bottom = 'auto';
}

function onFabMouseUp(event) {
  if (!isFabDragging || !fabButton) return;
  isFabDragging = false;
  fabButton.style.cursor = 'pointer';
  document.documentElement.style.userSelect = 'auto';
  document.removeEventListener('mousemove', onFabMouseMove);
  // event.stopPropagation(); // May not be needed with fabWasDragged flag

  const finalRect = fabButton.getBoundingClientRect();
  if (chrome.runtime?.id) {
    chrome.storage.local.set({ [EW_FAB_STORAGE_KEY]: { left: finalRect.left, top: finalRect.top } });
  }
  // Reset fabWasDragged slightly later to allow click handler to process
  // This is a common pattern, but ensure the click handler logic is robust.
  // If fabWasDragged is checked in click, it should work.
}

// Initialize UI elements and event listeners
function initializeUI() {
    // console.log("EW_CONTENT_DEBUG: initializeUI called.");
    if (window.self !== window.top) {
      // console.log("EW_CONTENT_DEBUG: initializeUI: In an iframe, skipping.");
      return;
    }

    // console.log("EW_CONTENT_DEBUG: initializeUI: Top window, proceeding.");

    if (!document.getElementById('ew-sidebar')) {
      // console.log("EW_CONTENT_DEBUG: initializeUI: #ew-sidebar not found, calling createSidebar().");
      createSidebar();
    } else {
      // console.log("EW_CONTENT_DEBUG: initializeUI: #ew-sidebar already exists.");
    }

    if (!document.getElementById('q-fab-button')) {
      // console.log("EW_CONTENT_DEBUG: initializeUI: #q-fab-button not found, calling createFabButton().");
      createFabButton();
    } else {
      // console.log("EW_CONTENT_DEBUG: initializeUI: #q-fab-button already exists.");
    }

    attachInputTranslationListeners();

    if (document.getElementById('ew-sidebar') && !document.getElementById('ew-font-controls') && sidebar) {
        // console.log("EW_CONTENT_DEBUG: initializeUI: Re-adding font controls.");
        const fontControlsContainer = document.createElement('div');
        fontControlsContainer.id = 'ew-font-controls';
        const newFontDecreaseButton = document.createElement('button');
        newFontDecreaseButton.id = 'ew-font-decrease';
        newFontDecreaseButton.textContent = 'A-';
        const newFontIncreaseButton = document.createElement('button');
        newFontIncreaseButton.id = 'ew-font-increase';
        newFontIncreaseButton.textContent = 'A+';
        fontControlsContainer.appendChild(newFontDecreaseButton);
        fontControlsContainer.appendChild(newFontIncreaseButton);
        
        const shortcutDisplay = document.getElementById('ew-shortcut-display');
        if (shortcutDisplay) {
            sidebar.insertBefore(fontControlsContainer, shortcutDisplay);
        } else if (sidebarContent) {
            sidebar.insertBefore(fontControlsContainer, sidebarContent);
        } else {
            sidebar.appendChild(fontControlsContainer);
        }
        newFontDecreaseButton.addEventListener('click', handleFontDecrease);
        newFontDecreaseButton.ewListenerAttached = true; 
        newFontIncreaseButton.addEventListener('click', handleFontIncrease);
        newFontIncreaseButton.ewListenerAttached = true;
    }

    // console.log("EW_CONTENT_DEBUG: initializeUI: Calling applyInitialSidebarStateAndSettings().");
    applyInitialSidebarStateAndSettings();

    const fontDecreaseButton = document.getElementById('ew-font-decrease');
    const fontIncreaseButton = document.getElementById('ew-font-increase');

    if (fontDecreaseButton && !fontDecreaseButton.ewListenerAttached) {
      fontDecreaseButton.addEventListener('click', handleFontDecrease);
      fontDecreaseButton.ewListenerAttached = true;
    }
    if (fontIncreaseButton && !fontIncreaseButton.ewListenerAttached) {
      fontIncreaseButton.addEventListener('click', handleFontIncrease);
      fontIncreaseButton.ewListenerAttached = true;
    }

    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({ type: "GET_SHORTCUT_INFO" }, (response) => {
        const shortcutDiv = document.getElementById('ew-shortcut-display');
        if (!shortcutDiv) {
            // console.warn("EW_CONTENT_DEBUG: initializeUI: Shortcut display div not found.");
            // Keep original warnings if any, or remove if they were debug only
            console.warn("EW: Shortcut display div not found.");
            return;
        }
        if (chrome.runtime.lastError) {
          // console.error("EW_CONTENT_DEBUG: initializeUI: Error getting shortcut info:", chrome.runtime.lastError.message);
          // Keep original errors if any
          console.error("EW: Error getting shortcut info:", chrome.runtime.lastError.message);
          shortcutDiv.textContent = ewT('shortcutError');
          return;
        }
        if (response && response.shortcut) {
          shortcutDiv.textContent = `${ewT('shortcutPrefix')}: ${response.shortcut}`;
        } else {
          shortcutDiv.textContent = ewT('shortcutNA');
        }
      });
    } else {
      const shortcutDiv = document.getElementById('ew-shortcut-display');
      if (sidebar && shortcutDiv) {
          shortcutDiv.textContent = ewT('shortcutNA');
      }
    }
    // console.log("EW_CONTENT_DEBUG: initializeUI completed.");
}

// MODIFIED applyFontSize function
function applyFontSize(multiplier) {
  if (sidebarContent) { // sidebarContent might not exist if UI not fully initialized
    sidebarContent.style.fontSize = `${EW_BASE_FONT_SIZE * multiplier}px`;
  }
  // Removed the block that modifies shortcutDisplay.style.fontSize
}

function handleFontDecrease() {
    ewFontSizeMultiplier -= 0.1;
    if (ewFontSizeMultiplier < 0.7) ewFontSizeMultiplier = 0.7; 
    applyFontSize(ewFontSizeMultiplier);
    if (chrome.runtime?.id) chrome.storage.local.set({ fontSizeMultiplier: ewFontSizeMultiplier });
}

function handleFontIncrease() {
    ewFontSizeMultiplier += 0.1;
    if (ewFontSizeMultiplier > 2.0) ewFontSizeMultiplier = 2.0; 
    applyFontSize(ewFontSizeMultiplier);
    if (chrome.runtime?.id) chrome.storage.local.set({ fontSizeMultiplier: ewFontSizeMultiplier });
}

function applyDefaultDimensions() {
  if (sidebar) {
    sidebar.style.width = ''; 
    sidebar.style.height = ''; 
    sidebar.style.left = 'auto'; 
    sidebar.style.right = '0px'; 
    sidebar.style.top = '20%';   
    sidebar.style.bottom = 'auto';
  }
}

function applyInitialSidebarStateAndSettings() {
  if (!sidebar) {
    console.warn("EW_CONTENT: applyInitialSidebarStateAndSettings called but sidebar is null.");
    return;
  }

  if (chrome.runtime?.id) {
    chrome.storage.local.get(['ewSidebarWidth', 'ewSidebarHeight', 'ewSidebarTop', 'ewSidebarLeft'], (result) => {
      if (chrome.runtime.lastError || !sidebar) return;
      if (result.ewSidebarWidth) sidebar.style.width = result.ewSidebarWidth;
      if (result.ewSidebarHeight) sidebar.style.height = result.ewSidebarHeight;
      if (result.ewSidebarTop) sidebar.style.top = result.ewSidebarTop;
      if (result.ewSidebarLeft) {
        sidebar.style.left = result.ewSidebarLeft;
        sidebar.style.right = 'auto';
      }
    });
    if (typeof loadAndApplyFontSize === "function") {
      loadAndApplyFontSize();
    }
  } else {
    // Fallback for invalid context
    console.warn("EW_CONTENT: Context invalidated during applyInitialSidebarStateAndSettings.");
    if (typeof loadAndApplyFontSize === "function") loadAndApplyFontSize();
  }
}

function loadAndApplyFontSize() {
  if (!sidebar) return; 
  if (chrome.runtime?.id) {
    chrome.storage.local.get('fontSizeMultiplier', (result) => {
      if (chrome.runtime.lastError) {
        applyFontSize(ewFontSizeMultiplier); 
        return;
      }
      if (result.fontSizeMultiplier) {
        let loadedMultiplier = parseFloat(result.fontSizeMultiplier);
        ewFontSizeMultiplier = (isNaN(loadedMultiplier) || loadedMultiplier < 0.7 || loadedMultiplier > 2.0) ? 1.0 : loadedMultiplier;
      }
      applyFontSize(ewFontSizeMultiplier);
    });
  } else {
    applyFontSize(ewFontSizeMultiplier); 
  }
}

function ewOnResizeMouseDown(event) {
  if (event.button !== 0 || !sidebar) return; // Only left mouse button and if sidebar exists

  isEwResizing = true;
  ewResizeType = event.target.dataset.resizeType; 
  
  ewResizeStartX = event.clientX;
  ewResizeStartY = event.clientY;
  
  ewInitialSidebarWidth = sidebar.offsetWidth;
  ewInitialSidebarHeight = sidebar.offsetHeight;
  
  const computedStyle = window.getComputedStyle(sidebar);
  const sidebarRect = sidebar.getBoundingClientRect();
  ewInitialSidebarLeft = sidebarRect.left;
  ewSidebarInitialY = sidebarRect.top;

  if (computedStyle.left === 'auto') {
    ewInitialSidebarLeft = sidebarRect.left;
  }

  // Update max height dynamically based on current viewport
  EW_SIDEBAR_MAX_HEIGHT = Math.floor(window.innerHeight * 0.9);

  document.documentElement.style.userSelect = 'none';
  document.documentElement.addEventListener('mousemove', ewOnResizeMouseMove, { passive: false });
  document.documentElement.addEventListener('mouseup', ewOnResizeMouseUp, { once: true });
  event.preventDefault();
}

function ewOnResizeMouseMove(event) {
  if (!isEwResizing || !sidebar) return;
  event.preventDefault();
  const dx = event.clientX - ewResizeStartX;
  const dy = event.clientY - ewResizeStartY;

  if (ewResizeType.includes('left')) {
    let newWidth = ewInitialSidebarWidth - dx;
    newWidth = Math.max(EW_SIDEBAR_MIN_WIDTH, Math.min(newWidth, EW_SIDEBAR_MAX_WIDTH));
    const widthChange = ewInitialSidebarWidth - newWidth;
    let newLeft = ewInitialSidebarLeft + widthChange;
    newLeft = Math.max(0, newLeft);
    if (newLeft + newWidth > window.innerWidth) {
      newLeft = window.innerWidth - newWidth;
      newWidth = Math.max(EW_SIDEBAR_MIN_WIDTH, Math.min(window.innerWidth - newLeft, EW_SIDEBAR_MAX_WIDTH));
    }
    sidebar.style.width = newWidth + 'px';
    sidebar.style.left = newLeft + 'px';
    sidebar.style.right = 'auto'; 
  } else if (ewResizeType.includes('right')) {
    let newWidth = ewInitialSidebarWidth + dx;
    const maxWidth = Math.min(EW_SIDEBAR_MAX_WIDTH, window.innerWidth - ewInitialSidebarLeft);
    newWidth = Math.max(EW_SIDEBAR_MIN_WIDTH, Math.min(newWidth, maxWidth));
    sidebar.style.width = newWidth + 'px';
    sidebar.style.left = ewInitialSidebarLeft + 'px';
    sidebar.style.right = 'auto';
  }

  if (ewResizeType.includes('bottom')) {
    let newHeight = ewInitialSidebarHeight + dy;
    newHeight = Math.max(EW_SIDEBAR_MIN_HEIGHT, Math.min(newHeight, EW_SIDEBAR_MAX_HEIGHT));
    sidebar.style.height = newHeight + 'px';
  } else if (ewResizeType.includes('top')) {
    let newHeight = ewInitialSidebarHeight - dy;
    newHeight = Math.max(EW_SIDEBAR_MIN_HEIGHT, Math.min(newHeight, EW_SIDEBAR_MAX_HEIGHT));
    const heightChange = ewInitialSidebarHeight - newHeight;
    let newTop = ewSidebarInitialY + heightChange;
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - newHeight));
    sidebar.style.height = newHeight + 'px';
    sidebar.style.top = newTop + 'px';
    sidebar.style.bottom = 'auto';
  }
}

function ewOnResizeMouseUp() {
  if (!isEwResizing || !sidebar) return;
  isEwResizing = false;
  document.documentElement.style.userSelect = 'auto';
  document.documentElement.removeEventListener('mousemove', ewOnResizeMouseMove);
  let dimensionsToSave = {
    ewSidebarWidth: sidebar.style.width,
    ewSidebarHeight: sidebar.style.height,
    ...(sidebar.style.left !== 'auto' && { ewSidebarLeft: sidebar.style.left }),
    ...(sidebar.style.top !== 'auto' && { ewSidebarTop: sidebar.style.top })
  };
  if (chrome.runtime?.id) chrome.storage.local.set(dimensionsToSave);
  ewResizeType = ''; 
}

function shouldStartSidebarDrag(event) {
  if (!sidebar || event.button !== 0) return false;
  if (event.target.closest('button, a, input, textarea, select, label')) return false;
  if (event.target.closest('#ew-sidebar-content')) return false;
  if (event.target.closest('[id^="ew-resize-handle"]')) return false;
  return sidebar.contains(event.target);
}

function ewOnMouseDown(event) {
  if (!shouldStartSidebarDrag(event)) return; 
  isEwDragging = true;
  ewDragStartX = event.clientX;
  ewDragStartY = event.clientY;
  const sidebarRect = sidebar.getBoundingClientRect();
  ewSidebarInitialX = sidebarRect.left;
  ewSidebarInitialY = sidebarRect.top;
  sidebar.style.userSelect = 'none'; 
  document.documentElement.style.userSelect = 'none'; 
  document.documentElement.addEventListener('mousemove', ewOnMouseMove, { passive: false });
  document.documentElement.addEventListener('mouseup', ewOnMouseUp, { once: true }); 
  event.preventDefault(); 
}

function ewOnMouseMove(event) {
  if (!isEwDragging || !sidebar) return;
  event.preventDefault(); 
  let newLeft = ewSidebarInitialX + (event.clientX - ewDragStartX);
  let newTop = ewSidebarInitialY + (event.clientY - ewDragStartY);
  const sidebarWidth = sidebar.offsetWidth;
  const sidebarHeight = sidebar.offsetHeight;
  newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - sidebarWidth));
  newTop = Math.max(0, Math.min(newTop, window.innerHeight - sidebarHeight));
  sidebar.style.left = newLeft + 'px';
  sidebar.style.top = newTop + 'px';
  sidebar.style.right = 'auto';  
  sidebar.style.bottom = 'auto'; 
}

function ewOnMouseUp() {
  if (!isEwDragging || !sidebar) return; 
  isEwDragging = false;
  sidebar.style.userSelect = 'auto';
  document.documentElement.style.userSelect = 'auto';
  document.documentElement.removeEventListener('mousemove', ewOnMouseMove);
  if (chrome.runtime?.id) {
    // Save the final dragged position
    chrome.storage.local.set({ 
        ewSidebarTop: sidebar.style.top, 
        ewSidebarLeft: sidebar.style.left,
        // Also save current dimensions when drag ends, as dragging might be combined with resizing implicitly
        ewSidebarWidth: sidebar.style.width, 
        ewSidebarHeight: sidebar.style.height 
    });
  }
}

function removeUI() {
  if (fabObserver) {
      fabObserver.disconnect();
      fabObserver = null; // Clear the reference
      console.log("EW_CONTENT: FAB MutationObserver disconnected.");
  }
  if (sidebar) { 
    sidebar.remove();
    sidebar = null;
    sidebarContent = null;
    ewSidebarHeader = null; 
  }
  if (fabButton) { // Remove FAB button
    fabButton.remove();
    fabButton = null;
  }
  document.documentElement.removeEventListener('mousemove', ewOnMouseMove);
  document.documentElement.removeEventListener('mouseup', ewOnMouseUp);
  document.documentElement.style.userSelect = 'auto'; 
}

function triggerTranslation(text) {
  if (!isExtensionEnabled || !text) return;
  if (chrome.runtime?.id) {
    chrome.storage.sync.get(['writingStyle'], (settings) => {
      if (chrome.runtime.lastError) return;
      if (chrome.runtime?.id) {
        showTranslationStarted();
        chrome.runtime.sendMessage({ type: 'TRANSLATE_TEXT', text: text, style: settings.writingStyle }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error sending message:", chrome.runtime.lastError.message);
            showTranslationResult({ error: chrome.runtime.lastError.message });
            return;
          }
          showTranslationResult(response);
        });
      }
    });
  }
}

function attachInputTranslationListeners() {
  if (ewInputListenerAttached) return;
  document.addEventListener('input', ewHandleEditableInput, true);
  document.addEventListener('compositionstart', ewHandleCompositionStart, true);
  document.addEventListener('compositionend', ewHandleCompositionEnd, true);
  ewInputListenerAttached = true;
}

function ewHandleEditableInput(event) {
  if (!isExtensionEnabled) return;
  const target = event.target;
  if (!isTranslatableEditable(target)) return;
  if (event.isComposing || event.inputType === 'insertCompositionText' || ewComposingTargets.has(target)) {
    window.clearTimeout(ewInputDebounceTimer);
    return;
  }

  scheduleInputTranslation(target);
}

function ewHandleCompositionStart(event) {
  if (isTranslatableEditable(event.target)) {
    ewComposingTargets.add(event.target);
    window.clearTimeout(ewInputDebounceTimer);
  }
}

function ewHandleCompositionEnd(event) {
  const target = event.target;
  if (!isTranslatableEditable(target)) return;
  ewComposingTargets.delete(target);
  window.clearTimeout(ewInputDebounceTimer);
  window.setTimeout(() => {
    if (!ewComposingTargets.has(target)) scheduleInputTranslation(target);
  }, 0);
}

function scheduleInputTranslation(target) {
  const text = getEditableText(target).trim();
  if (!shouldTranslateInputText(text)) return;

  window.clearTimeout(ewInputDebounceTimer);
  ewInputDebounceTimer = window.setTimeout(() => {
    if (text === ewLastSubmittedInputText) return;
    ewLastSubmittedInputText = text;
    triggerTranslation(text);
  }, EW_INPUT_DEBOUNCE_MS);
}

function isTranslatableEditable(element) {
  if (!element || element.disabled || element.readOnly) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel'].includes(type);
  }
  return element.isContentEditable === true;
}

function getEditableText(element) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value || '';
  }
  return element.innerText || element.textContent || '';
}

function shouldTranslateInputText(text) {
  return text.length >= EW_MIN_INPUT_LENGTH &&
    EW_NON_ENGLISH_SIGNAL_RE.test(text) &&
    !EW_BOPOMOFO_ONLY_RE.test(text);
}

function ensureSidebarReadyForTranslation() {
  if (window.self !== window.top) return false;
  if (!sidebar || !sidebarContent) {
    createSidebar();
  }
  if (sidebar && fabButton && !sidebar.classList.contains('open')) {
    sidebar.classList.add('open');
    fabButton.textContent = '✕';
  }
  return !!(sidebar && sidebarContent);
}

function showTranslationStarted() {
  if (!ensureSidebarReadyForTranslation()) return;
  sidebarContent.innerHTML = `<span class="ew-loading-spinner"></span> ${ewT('translating')}`;
  const copyButton = document.getElementById('ew-copy-button');
  if (copyButton) copyButton.style.display = 'none';
}

function showTranslationResult(data) {
  if (!ensureSidebarReadyForTranslation()) return;
  const copyButton = document.getElementById('ew-copy-button');
  if (data?.translatedText && data.translatedText.trim() !== "") {
    sidebarContent.textContent = data.translatedText;
    if (copyButton) copyButton.style.display = 'block';
  } else if (data?.error) {
    sidebarContent.textContent = data.error;
    if (copyButton) copyButton.style.display = 'none';
  } else {
    sidebarContent.textContent = ewT('noTranslationResult');
    if (copyButton) copyButton.style.display = 'none';
  }
}

function openExtensionOptions() {
  if (!chrome.runtime?.id) return;
  chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("EW: Could not open options page:", chrome.runtime.lastError.message);
    } else if (response?.error) {
      console.error("EW: Could not open options page:", response.error);
    }
  });
}

function openFeedbackPage() {
  if (!chrome.runtime?.id) return;
  chrome.runtime.sendMessage({ type: 'OPEN_FEEDBACK_PAGE' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("EW: Could not open feedback page:", chrome.runtime.lastError.message);
    } else if (response?.error) {
      console.error("EW: Could not open feedback page:", response.error);
    }
  });
}

function maybeShowWhatsNewNotice() {
  if (!chrome.runtime?.id || window.self !== window.top) return;
  chrome.runtime.sendMessage({ type: 'GET_WHATS_NEW_STATE' }, (response) => {
    if (chrome.runtime.lastError || !response?.shouldShow || !sidebar) return;
    if (document.getElementById('ew-whats-new-notice')) return;

    const notice = document.createElement('div');
    notice.id = 'ew-whats-new-notice';

    const title = document.createElement('strong');
    title.id = 'ew-whats-new-title';
    title.textContent = ewT('whatsNewTitle');

    const version = document.createElement('p');
    version.id = 'ew-whats-new-version';
    version.textContent = `${ewT('whatsNewVersion')} ${response.currentVersion}`;

    const body = document.createElement('p');
    body.id = 'ew-whats-new-body';
    body.textContent = ewT('whatsNewBody');

    const dismissButton = document.createElement('button');
    dismissButton.id = 'ew-whats-new-dismiss';
    dismissButton.type = 'button';
    dismissButton.textContent = ewT('whatsNewDismiss');
    dismissButton.addEventListener('mousedown', event => event.stopPropagation());
    dismissButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      chrome.runtime.sendMessage({ type: 'MARK_WHATS_NEW_SEEN', version: response.currentVersion }, () => {
        notice.remove();
      });
    });

    notice.appendChild(title);
    notice.appendChild(version);
    notice.appendChild(body);
    notice.appendChild(dismissButton);

    const fixedControls = document.getElementById('ew-sidebar-fixed-controls');
    if (fixedControls) fixedControls.appendChild(notice);
  });
}

function maybeShowUsageConsentNotice() {
  if (!chrome.runtime?.id || window.self !== window.top) return;
  chrome.runtime.sendMessage({ type: 'GET_USAGE_CONSENT_STATE' }, (response) => {
    if (chrome.runtime.lastError || !response?.shouldShow || !sidebar) return;
    if (document.getElementById('ew-usage-consent-notice')) return;

    const notice = document.createElement('div');
    notice.id = 'ew-usage-consent-notice';
    notice.className = 'ew-usage-consent-notice';

    const title = document.createElement('strong');
    title.id = 'ew-usage-consent-title';
    title.textContent = ewT('usageConsentTitle');

    const body = document.createElement('p');
    body.id = 'ew-usage-consent-body';
    body.textContent = ewT('usageConsentBody');

    const bonus = document.createElement('p');
    bonus.id = 'ew-usage-consent-bonus';
    bonus.textContent = ewT('usageConsentBonus');

    const actions = document.createElement('div');
    actions.className = 'ew-usage-consent-actions';

    const acceptButton = document.createElement('button');
    acceptButton.id = 'ew-usage-consent-accept';
    acceptButton.type = 'button';
    acceptButton.textContent = ewT('usageConsentAccept');

    const declineButton = document.createElement('button');
    declineButton.id = 'ew-usage-consent-decline';
    declineButton.type = 'button';
    declineButton.textContent = ewT('usageConsentDecline');

    function choose(enabled) {
      chrome.runtime.sendMessage({ type: 'SET_USAGE_CONSENT', enabled }, () => {
        notice.remove();
      });
    }

    [acceptButton, declineButton].forEach(button => {
      button.addEventListener('mousedown', event => event.stopPropagation());
    });
    acceptButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      choose(true);
    });
    declineButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      choose(false);
    });

    actions.appendChild(acceptButton);
    actions.appendChild(declineButton);
    notice.appendChild(title);
    notice.appendChild(body);
    notice.appendChild(bonus);
    notice.appendChild(actions);

    const fixedControls = document.getElementById('ew-sidebar-fixed-controls');
    if (fixedControls) fixedControls.appendChild(notice);
  });
}

function createSidebar() {
    // console.log("EW_CONTENT_DEBUG: createSidebar called.");
    if (window.self !== window.top) {
      // console.log("EW_CONTENT_DEBUG: createSidebar: In an iframe, aborted.");
      console.log("EW_CONTENT: Attempted to create sidebar in an iframe, aborted."); // Keep original if it was this
      return;
    }
    if (document.getElementById('ew-sidebar')) {
      // console.log("EW_CONTENT_DEBUG: createSidebar: #ew-sidebar already exists. Returning.");
      return;
    }

  sidebar = document.createElement('div');
  sidebar.id = 'ew-sidebar';
  sidebar.addEventListener('mousedown', ewOnMouseDown);

    // Create the new fixed controls wrapper
  const fixedControls = document.createElement('div');
  fixedControls.id = 'ew-sidebar-fixed-controls';

  // sidebarContent is created before fixedControls, but appended after
  sidebarContent = document.createElement('div');
  sidebarContent.id = 'ew-sidebar-content';
  sidebarContent.textContent = '...'; 

  const sidebarHeaderRow = document.createElement('div');
  sidebarHeaderRow.id = 'ew-sidebar-header-row';

  ewSidebarHeader = document.createElement('h4');
  ewSidebarHeader.id = 'ew-sidebar-header'; 
  ewSidebarHeader.textContent = ewT('sidebarTitle');

  const optionsButton = document.createElement('button');
  optionsButton.id = 'ew-options-button';
  optionsButton.type = 'button';
  optionsButton.textContent = '⚙︎';
  optionsButton.title = ewT('optionsTitle');
  optionsButton.setAttribute('aria-label', ewT('optionsAria'));
  optionsButton.addEventListener('mousedown', event => event.stopPropagation());
  optionsButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openExtensionOptions();
  });

  sidebarHeaderRow.appendChild(ewSidebarHeader);
  sidebarHeaderRow.appendChild(optionsButton);
  fixedControls.appendChild(sidebarHeaderRow);

  const fontControlsContainer = document.createElement('div');
  fontControlsContainer.id = 'ew-font-controls';
  const fontDecreaseButton = document.createElement('button');
  fontDecreaseButton.id = 'ew-font-decrease';
  fontDecreaseButton.textContent = 'A-';
  const fontIncreaseButton = document.createElement('button');
  fontIncreaseButton.id = 'ew-font-increase';
  fontIncreaseButton.textContent = 'A+';
  fontControlsContainer.appendChild(fontDecreaseButton);
  fontControlsContainer.appendChild(fontIncreaseButton);
  // fixedControls.appendChild(fontControlsContainer); // No longer direct child of fixedControls

  const shortcutDisplay = document.createElement('div');
  shortcutDisplay.id = 'ew-shortcut-display';
  shortcutDisplay.textContent = `${ewT('shortcutPrefix')}: ...`; 
  // fixedControls.appendChild(shortcutDisplay); // No longer direct child of fixedControls

  const fontShortcutWrapper = document.createElement('div');
  fontShortcutWrapper.id = 'ew-font-shortcut-wrapper';
  fontShortcutWrapper.appendChild(fontControlsContainer);
  const feedbackButton = document.createElement('button');
  feedbackButton.id = 'ew-feedback-button';
  feedbackButton.type = 'button';
  feedbackButton.textContent = ewT('feedbackButton');
  feedbackButton.addEventListener('click', event => {
    event.preventDefault();
    openFeedbackPage();
  });
  fontShortcutWrapper.appendChild(feedbackButton);
  fontShortcutWrapper.appendChild(shortcutDisplay);
  fixedControls.appendChild(fontShortcutWrapper);

  const copyButton = document.createElement('button');
  copyButton.id = 'ew-copy-button';
  copyButton.textContent = ewT('copyTranslation');
  copyButton.style.display = 'none'; 
  copyButton.addEventListener('click', () => {
    if (sidebarContent && sidebarContent.textContent && !sidebarContent.textContent.includes(ewT('translating')) && !sidebarContent.textContent.startsWith('錯誤:') && !sidebarContent.textContent.startsWith('Error:') && sidebarContent.textContent !== '...' && sidebarContent.textContent !== ewT('noTranslationResult')) {
      navigator.clipboard.writeText(sidebarContent.textContent).then(() => {
        const originalText = copyButton.textContent;
        copyButton.dataset.copied = 'true';
        copyButton.textContent = ewT('copied');
        setTimeout(() => {
          copyButton.dataset.copied = 'false';
          copyButton.textContent = originalText;
        }, 1500);
      }).catch(err => console.error('EW: Could not copy text: ', err));
    }
  });
  fixedControls.appendChild(copyButton); // Append to fixedControls

  sidebar.appendChild(fixedControls);    // Append the new wrapper
  sidebar.appendChild(sidebarContent);   // Append content after fixed controls

  const resizeHandleLeft = document.createElement('div');
  resizeHandleLeft.id = 'ew-resize-handle-left';
  resizeHandleLeft.dataset.resizeType = 'left'; 
  resizeHandleLeft.addEventListener('mousedown', ewOnResizeMouseDown);

  const resizeHandleBottom = document.createElement('div');
  resizeHandleBottom.id = 'ew-resize-handle-bottom';
  resizeHandleBottom.dataset.resizeType = 'bottom'; 
  resizeHandleBottom.addEventListener('mousedown', ewOnResizeMouseDown);

  const resizeHandleTop = document.createElement('div');
  resizeHandleTop.id = 'ew-resize-handle-top';
  resizeHandleTop.dataset.resizeType = 'top';
  resizeHandleTop.addEventListener('mousedown', ewOnResizeMouseDown);

  const resizeHandleRight = document.createElement('div');
  resizeHandleRight.id = 'ew-resize-handle-right';
  resizeHandleRight.dataset.resizeType = 'right';
  resizeHandleRight.addEventListener('mousedown', ewOnResizeMouseDown);

  const resizeHandleTopLeft = document.createElement('div');
  resizeHandleTopLeft.id = 'ew-resize-handle-top-left';
  resizeHandleTopLeft.dataset.resizeType = 'top-left';
  resizeHandleTopLeft.addEventListener('mousedown', ewOnResizeMouseDown);

  const resizeHandleTopRight = document.createElement('div');
  resizeHandleTopRight.id = 'ew-resize-handle-top-right';
  resizeHandleTopRight.dataset.resizeType = 'top-right';
  resizeHandleTopRight.addEventListener('mousedown', ewOnResizeMouseDown);

  const resizeHandleBottomLeft = document.createElement('div');
  resizeHandleBottomLeft.id = 'ew-resize-handle-bottom-left';
  resizeHandleBottomLeft.dataset.resizeType = 'bottom-left';
  resizeHandleBottomLeft.addEventListener('mousedown', ewOnResizeMouseDown);

  const resizeHandleBottomRight = document.createElement('div');
  resizeHandleBottomRight.id = 'ew-resize-handle-bottom-right';
  resizeHandleBottomRight.dataset.resizeType = 'bottom-right';
  resizeHandleBottomRight.addEventListener('mousedown', ewOnResizeMouseDown);
  
  sidebar.appendChild(resizeHandleLeft);
  sidebar.appendChild(resizeHandleBottom);
  sidebar.appendChild(resizeHandleTop);
  sidebar.appendChild(resizeHandleRight);
  sidebar.appendChild(resizeHandleTopLeft);
  sidebar.appendChild(resizeHandleTopRight);
  sidebar.appendChild(resizeHandleBottomLeft);
  sidebar.appendChild(resizeHandleBottomRight);
  // console.log("EW_CONTENT_DEBUG: createSidebar: Main sidebar element and children created. Attempting to append to document.body.");
  if (!document.body) {
      // console.error("EW_CONTENT_DEBUG: createSidebar: document.body is not available!");
      // Decide if this is a critical error to keep, or if the script would fail anyway.
      // For now, assuming it's a critical scenario that should be logged if it occurs.
      console.error("EW_CONTENT: createSidebar: document.body is not available! Cannot append sidebar.");
      return;
  }
  document.body.appendChild(sidebar);
  maybeShowWhatsNewNotice();
  maybeShowUsageConsentNotice();
  // console.log("EW_CONTENT_DEBUG: createSidebar: Main sidebar element appended to document.body.");
  // console.log("EW_CONTENT_DEBUG: createSidebar completed.");
}

// Function to create the FAB
function createFabButton() {
    // console.log("EW_CONTENT_DEBUG: createFabButton called.");
    if (document.getElementById('q-fab-button')) {
        // console.log("EW_CONTENT_DEBUG: createFabButton: #q-fab-button already exists. Returning.");
        return;
    }

    fabButton = document.createElement('div');
    fabButton.id = 'q-fab-button';
    fabButton.textContent = 'Q';

    if (window.location.hostname.includes('youtube.com')) {
        fabButton.classList.add('ew-fab-youtube');
    }

    // console.log("EW_CONTENT_DEBUG: createFabButton: fabButton element created. Attempting to append to document.body.");
    if (!document.body) {
        // console.error("EW_CONTENT_DEBUG: createFabButton: document.body is not available!");
        console.error("EW_CONTENT: createFabButton: document.body is not available! Cannot append FAB.");
        return;
    }

    setTimeout(() => {
        if (!document.body || !fabButton) { // Check if body and fabButton are still valid
            console.warn("EW_CONTENT: setTimeout in createFabButton: document.body or fabButton no longer available.");
            return;
        }
        document.body.appendChild(fabButton);
        // console.log("EW_CONTENT_DEBUG: createFabButton: fabButton appended to document.body (after timeout).");

        // Add event listener here:
        if (!fabButton.ewFabListenerAttached) {
            fabButton.addEventListener('click', () => {
                if (fabWasDragged) {
                    fabWasDragged = false; // Reset for next interaction
                    return;
                }
                if (sidebar) {
                    sidebar.classList.toggle('open');
                    if (sidebar.classList.contains('open')) {
                        fabButton.textContent = '✕';
                    } else {
                        fabButton.textContent = 'Q';
                    }
                }
            });
            fabButton.ewFabListenerAttached = true;
        }
        fabButton.addEventListener('mousedown', onFabMouseDown);

        if (chrome.runtime?.id) {
          chrome.storage.local.get(EW_FAB_STORAGE_KEY, (result) => {
            if (chrome.runtime.lastError) {
              console.error("EW_CONTENT: Error loading FAB position:", chrome.runtime.lastError.message);
            }
            if (fabButton) { // Check if fabButton still exists
              if (result[EW_FAB_STORAGE_KEY]) {
                fabButton.style.left = result[EW_FAB_STORAGE_KEY].left + 'px';
                fabButton.style.top = result[EW_FAB_STORAGE_KEY].top + 'px';
                fabButton.style.right = 'auto';
                fabButton.style.bottom = 'auto';
              } else {
                // Default position if nothing in storage or key is missing
                fabButton.style.left = 'auto';
                fabButton.style.top = '20px';
                fabButton.style.right = '20px';
                fabButton.style.bottom = 'auto';
              }
            }
          });
        } else if (fabButton) {
             // Default position if runtime.id is not available
             fabButton.style.left = 'auto';
             fabButton.style.top = '20px';
             fabButton.style.right = '20px';
             fabButton.style.bottom = 'auto';
        }
        // console.log("EW_CONTENT_DEBUG: createFabButton logic inside setTimeout completed.");

        // THEN Initialize the observer
        initializeFabObserver();

    }, 1000); // 1-second delay

    // console.log("EW_CONTENT_DEBUG: createFabButton completed (setTimeout scheduled).");
}

function initializeFabObserver() {
    if (!fabButton || !fabButton.isConnected) {
        console.warn("EW_CONTENT: FAB not found or not in DOM when trying to initialize MutationObserver.");
        return;
    }

    if (fabObserver) {
        fabObserver.disconnect();
    }

    fabObserver = new MutationObserver((mutationsList, observer) => {
        // Critical: Disconnect observer immediately to prevent infinite loops while handling.
        observer.disconnect();

        let fabNeedsRestore = false;
        let fabWasRemoved = false;

        for (const mutation of mutationsList) {
            if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                // Check if fabButton is still part of the document and visible
                if (fabButton.isConnected) {
                    const computedStyle = getComputedStyle(fabButton);
                    if (fabButton.offsetParent === null ||
                        computedStyle.display === 'none' ||
                        computedStyle.visibility === 'hidden' ||
                        parseFloat(computedStyle.opacity) < 0.1) { // Check for near zero opacity
                        fabNeedsRestore = true;
                    }
                } else { // If not connected, it was likely removed by attribute change somehow, mark as removed.
                    fabWasRemoved = true;
                    fabNeedsRestore = true;
                }
            } else if (mutation.type === 'childList') {
                for (const removedNode of mutation.removedNodes) {
                    if (removedNode === fabButton) {
                        fabWasRemoved = true;
                        fabNeedsRestore = true; // If removed, it also needs style restoration
                        break;
                    }
                }
            }
            if (fabNeedsRestore) break; // No need to check further mutations for this cycle
        }

        if (fabNeedsRestore) {
            console.log("EW_CONTENT: MutationObserver detected FAB interference. Attempting restore.");
            // Ensure fabButton variable is still valid
            if (!fabButton) {
                console.error("EW_CONTENT: fabButton is null during restore attempt. Cannot proceed.");
                // Attempt to re-observe body as a last resort if observer is still valid
                if (document.body && observer) {
                    try {
                        observer.observe(document.body, { childList: true, subtree: false });
                    } catch (e) {
                        console.error("EW_CONTENT: Error trying to re-observe body:", e);
                    }
                }
                return;
            }

            if (fabWasRemoved && document.body && !fabButton.isConnected) {
                document.body.appendChild(fabButton);
                console.log("EW_CONTENT: FAB re-appended to body.");
            }

            // Restore styles - ensure it's visible
            fabButton.style.setProperty('display', 'flex', 'important');
            fabButton.style.setProperty('visibility', 'visible', 'important');
            fabButton.style.setProperty('opacity', '1', 'important');
            fabButton.style.setProperty('position', 'fixed', 'important');
            fabButton.style.setProperty('z-index', '2147483647', 'important'); // Max z-index

            // Restore YouTube-specific class if applicable
            if (window.location.hostname.includes('youtube.com')) {
                fabButton.classList.add('ew-fab-youtube');
            }

            // Restore basic position if it seems to have been lost
            const fabRect = fabButton.getBoundingClientRect();
            const isOffScreen = fabRect.top < 0 || fabRect.left < 0 ||
                              fabRect.bottom > window.innerHeight || fabRect.right > window.innerWidth ||
                              fabRect.width === 0 || fabRect.height === 0;

            if (isOffScreen || fabButton.style.getPropertyValue('position') !== 'fixed') {
               console.log("EW_CONTENT: FAB appears off-screen or position altered, resetting to default.");
               fabButton.style.right = '20px';
               fabButton.style.top = '20px';
               fabButton.style.left = 'auto'; // Clear potentially conflicting values
               fabButton.style.bottom = 'auto'; // Clear potentially conflicting values
            }
        }

        // Critical: Re-observe *after* handling mutations.
        if (fabButton && fabButton.isConnected && observer) {
            try {
                observer.observe(fabButton, {
                    attributes: true,
                    attributeFilter: ['style', 'class'],
                    subtree: false
                });
                if (fabButton.parentNode) {
                    observer.observe(fabButton.parentNode, {
                        childList: true,
                        subtree: false
                    });
                } else {
                    console.warn("EW_CONTENT: FAB is connected but has no parentNode for observation.");
                }
            } catch (e) {
                console.error("EW_CONTENT: Error trying to re-observe FAB/parent:", e);
            }
        } else if (document.body && fabButton && !fabButton.isConnected && observer) {
           console.warn("EW_CONTENT: FAB not connected after restore attempt. Observing body.");
           try {
               observer.observe(document.body, { childList: true, subtree: false });
           } catch (e) {
               console.error("EW_CONTENT: Error trying to observe body as fallback:", e);
           }
        } else if (!fabButton && document.body && observer) {
             console.warn("EW_CONTENT: fabButton became null. Observing body.");
              try {
               observer.observe(document.body, { childList: true, subtree: false });
           } catch (e) {
               console.error("EW_CONTENT: Error trying to observe body as fallback (fabButton null):", e);
           }
        }
    });

    if (fabButton && fabButton.isConnected && fabObserver) {
         try {
             fabObserver.observe(fabButton, {
                 attributes: true,
                 attributeFilter: ['style', 'class'],
                 subtree: false
             });
             if (fabButton.parentNode) {
                  fabObserver.observe(fabButton.parentNode, {
                     childList: true,
                     subtree: false
                 });
             } else {
                  console.warn("EW_CONTENT: FAB connected but no parentNode at initial observe setup.");
             }
             console.log("EW_CONTENT: FAB MutationObserver initialized and started.");
         } catch (e) {
             console.error("EW_CONTENT: Error starting initial observation:", e);
         }
    }
}

// Old initialization block removed as per refactoring.
// if (isExtensionEnabled) {
//   if (document.readyState === "complete" || document.readyState === "interactive") {
//     initializeUI();
//   } else {
//     document.addEventListener("DOMContentLoaded", initializeUI);
//   }
// }
} catch (globalError) {
  console.error("EW_CONTENT: !!! Global unhandled error in content script !!!", globalError.message, globalError.stack, globalError);
}
