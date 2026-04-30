#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function loadPlaywright() {
  const candidates = [
    'playwright',
    '/Users/michael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }

  throw new Error('Playwright is not available. Run: node <playwright-cli>/cli.js install chromium');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function startTestServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>English Writing Helper Smoke Test</title>
        </head>
        <body>
          <h1>English Writing Helper Smoke Test</h1>
          <label for="writing">Writing</label>
          <textarea id="writing" rows="5" cols="70"></textarea>
          <p id="status">ready</p>
        </body>
      </html>`);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

function getExtensionId(workerUrl) {
  const match = workerUrl.match(/^chrome-extension:\/\/([^/]+)\//);
  if (!match) {
    throw new Error(`Could not parse extension id from service worker URL: ${workerUrl}`);
  }
  return match[1];
}

function readKeychainPassword(service) {
  try {
    return execFileSync('security', ['find-generic-password', '-s', service, '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

async function configureOptionalApiKey(worker) {
  const geminiApiKey = process.env.EW_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    readKeychainPassword('codex-ewh-gemini-api-key');
  const openaiApiKey = process.env.EW_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    readKeychainPassword('codex-ewh-openai-api-key');

  if (!geminiApiKey && !openaiApiKey) {
    return { provider: 'gemini', liveApi: false };
  }

  const provider = openaiApiKey ? 'openai' : 'gemini';
  const settings = {
    apiProvider: provider,
    writingStyle: 'formal',
    geminiApiKey: geminiApiKey || '',
    openaiApiKey: openaiApiKey || '',
    geminiUserSelectedModel: 'gemini-2.5-flash',
    openaiUserSelectedModel: 'gpt-5.4-mini',
    customPromptEnabled: true,
    customPrompt: 'Translate Traditional Chinese into clear, professional English. Only output the English translation.',
    anonymousUsageEnabled: true,
  };

  await worker.evaluate(options => new Promise((resolve, reject) => {
    chrome.storage.sync.set(options, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  }), settings);

  await worker.evaluate(() => new Promise((resolve, reject) => {
    chrome.storage.local.set({ ewUsageIsTestProfile: true }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  }));

  return { provider, liveApi: true };
}

async function main() {
  const { chromium } = loadPlaywright();
  const extensionPath = path.resolve(__dirname, '..');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ew-extension-smoke-'));
  const server = await startTestServer();
  const pageErrors = [];
  let context;

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const extensionId = getExtensionId(worker.url());
    const apiConfig = await configureOptionalApiKey(worker);
    const manifestVersion = await worker.evaluate(() => chrome.runtime.getManifest().version);

    async function setWhatsNewPending(previousVersion = '0.2.0') {
      await worker.evaluate(state => new Promise((resolve, reject) => {
        chrome.storage.local.set({ ewWhatsNewState: state }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      }), {
        previousVersion,
        currentVersion: manifestVersion,
        hasSeenWhatsNew: false,
        updatedAt: new Date().toISOString(),
      });
    }

    await setWhatsNewPending();
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.waitForSelector('#apiProvider', { timeout: 10000 });
    await optionsPage.waitForSelector('#whatsNewNotice:not([hidden])', { timeout: 10000 });
    assert(await optionsPage.locator('#dismissWhatsNew').count() === 1, 'Options page is missing the whats new dismiss button.');
    await optionsPage.locator('#dismissWhatsNew').click();
    await optionsPage.waitForFunction(() => document.querySelector('#whatsNewNotice')?.hidden === true, { timeout: 3000 });
    const seenWhatsNew = await worker.evaluate(() => new Promise(resolve => {
      chrome.storage.local.get(['ewWhatsNewState'], result => resolve(result.ewWhatsNewState));
    }));
    assert(seenWhatsNew?.hasSeenWhatsNew === true, 'Whats new notice was not marked as seen after dismissing it.');
    assert(await optionsPage.locator('#uiLanguage').count() === 1, 'Options page is missing the interface language selector.');
    assert(await optionsPage.locator('#usageMode').count() === 1, 'Options page is missing the usage mode selector.');
    assert(await optionsPage.locator('#managedLicenseKey').count() === 1, 'Options page is missing the Managed Credits license input.');
    assert(await optionsPage.locator('#refreshManagedBalance').count() === 1, 'Options page is missing the Managed Credits balance refresh button.');
    assert(await optionsPage.locator('.managed-buy').count() === 3, 'Options page is missing the Managed Credits purchase buttons.');
    assert(await optionsPage.locator('#usageConsentNotice').count() === 1, 'Options page is missing the first-run anonymous usage consent notice container.');
    assert(await optionsPage.locator('#anonymousUsageEnabled').count() === 1, 'Options page is missing the anonymous usage reporting toggle.');
    const geminiModels = await optionsPage.$$eval('#geminiModelSelect option', options => options.map(option => option.value));
    const openaiModels = await optionsPage.$$eval('#openaiModelSelect option', options => options.map(option => option.value));
    assert(geminiModels.includes('gemini-2.5-flash'), 'Options page is missing gemini-2.5-flash.');
    assert(openaiModels.includes('gpt-5.4-mini'), 'Options page is missing gpt-5.4-mini.');
    assert(await optionsPage.locator('#writingStyle').count() === 1, 'Options page is missing the writing style dropdown.');
    assert(await optionsPage.locator('#customPromptEnabled').count() === 1, 'Options page is missing the custom prompt toggle.');
    assert(await optionsPage.locator('#customPrompt').count() === 1, 'Options page is missing the custom prompt textarea.');
    assert(await optionsPage.locator('#geminiApiKeyGuide').count() === 1, 'Options page is missing the Gemini API key guide link.');
    assert(await optionsPage.locator('#openaiApiKeyGuide').count() === 1, 'Options page is missing the OpenAI API key guide link.');
    assert(await optionsPage.locator('#openShortcutSettings').count() === 1, 'Options page is missing the shortcut settings button.');
    const storedKeysBeforeModeSwitch = await worker.evaluate(() => new Promise(resolve => {
      chrome.storage.sync.get(['geminiApiKey', 'openaiApiKey'], resolve);
    }));
    await optionsPage.selectOption('#usageMode', 'managed');
    await optionsPage.fill('#managedLicenseKey', 'EWH-TEST-LICENSE');
    await optionsPage.locator('#saveOptions').click();
    await optionsPage.waitForTimeout(250);
    const storedKeysAfterModeSwitch = await worker.evaluate(() => new Promise(resolve => {
      chrome.storage.sync.get(['geminiApiKey', 'openaiApiKey', 'usageMode', 'managedLicenseKey'], resolve);
    }));
    assert(storedKeysAfterModeSwitch.usageMode === 'managed', 'Managed Credits usage mode was not saved.');
    assert(storedKeysAfterModeSwitch.managedLicenseKey === 'EWH-TEST-LICENSE', 'Managed Credits license key was not saved.');
    assert(storedKeysAfterModeSwitch.geminiApiKey === storedKeysBeforeModeSwitch.geminiApiKey, 'Gemini API key changed while switching usage mode.');
    assert(storedKeysAfterModeSwitch.openaiApiKey === storedKeysBeforeModeSwitch.openaiApiKey, 'OpenAI API key changed while switching usage mode.');
    await worker.evaluate(() => new Promise((resolve, reject) => {
      chrome.storage.sync.set({ usageMode: 'byok' }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    }));
    await optionsPage.selectOption('#uiLanguage', 'en');
    await optionsPage.waitForFunction(() => document.documentElement.lang === 'en');
    await optionsPage.selectOption('#uiLanguage', 'zh_TW');
    await optionsPage.waitForFunction(() => document.documentElement.lang === 'zh-TW');
    await optionsPage.close();

    await setWhatsNewPending();
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForSelector('#whatsNewNotice:not([hidden])', { timeout: 10000 });
    await popupPage.locator('#dismissWhatsNew').click();
    await popupPage.waitForFunction(() => document.querySelector('#whatsNewNotice')?.hidden === true, { timeout: 3000 });
    await popupPage.close();

    const feedbackPage = await context.newPage();
    await feedbackPage.goto(`chrome-extension://${extensionId}/feedback.html`);
    await feedbackPage.waitForSelector('#feedbackType', { timeout: 10000 });
    await feedbackPage.waitForSelector('#feedbackId', { timeout: 10000 });
    assert(await feedbackPage.locator('#openIssue').count() === 1, 'Feedback page is missing the GitHub issue button.');
    assert(await feedbackPage.locator('#copyFeedback').count() === 1, 'Feedback page is missing the copy feedback button.');
    await feedbackPage.close();

    await setWhatsNewPending();
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('#q-fab-button', { timeout: 10000 });
    await page.waitForSelector('#ew-sidebar', { state: 'attached', timeout: 10000 });
    await page.waitForSelector('#ew-options-button', { state: 'attached', timeout: 10000 });
    await page.waitForSelector('#ew-feedback-button', { state: 'attached', timeout: 10000 });

    await page.locator('#q-fab-button').click();
    await page.waitForSelector('#ew-sidebar.open', { timeout: 3000 });
    await page.waitForSelector('#ew-whats-new-notice', { timeout: 5000 });
    await page.locator('#ew-whats-new-dismiss').click();
    await page.waitForSelector('#ew-whats-new-notice', { state: 'detached', timeout: 3000 });

    const beforeDrag = await page.locator('#ew-sidebar').boundingBox();
    assert(beforeDrag, 'Sidebar bounding box should be available before drag.');
    await page.mouse.move(beforeDrag.x + 32, beforeDrag.y + 18);
    await page.mouse.down();
    await page.mouse.move(beforeDrag.x + 92, beforeDrag.y + 58);
    await page.mouse.up();
    const afterDrag = await page.locator('#ew-sidebar').boundingBox();
    assert(afterDrag, 'Sidebar bounding box should be available after drag.');
    assert(Math.abs(afterDrag.x - beforeDrag.x) > 20 || Math.abs(afterDrag.y - beforeDrag.y) > 20, 'Sidebar did not move when dragged from lavender chrome.');

    if (page.viewportSize().width - (afterDrag.x + afterDrag.width) < 90) {
      await page.mouse.move(afterDrag.x + 32, afterDrag.y + 18);
      await page.mouse.down();
      await page.mouse.move(Math.max(20, afterDrag.x - 140), afterDrag.y + 18);
      await page.mouse.up();
    }

    const beforeRightResize = await page.locator('#ew-sidebar').boundingBox();
    await page.mouse.move(beforeRightResize.x + beforeRightResize.width - 2, beforeRightResize.y + beforeRightResize.height / 2);
    await page.mouse.down();
    await page.mouse.move(beforeRightResize.x + beforeRightResize.width + 45, beforeRightResize.y + beforeRightResize.height / 2);
    await page.mouse.up();
    const afterRightResize = await page.locator('#ew-sidebar').boundingBox();
    assert(afterRightResize.width > beforeRightResize.width + 20, 'Sidebar right resize handle did not increase width.');

    const beforeTopResize = await page.locator('#ew-sidebar').boundingBox();
    await page.mouse.move(beforeTopResize.x + beforeTopResize.width / 2, beforeTopResize.y + 2);
    await page.mouse.down();
    await page.mouse.move(beforeTopResize.x + beforeTopResize.width / 2, beforeTopResize.y - 35);
    await page.mouse.up();
    const afterTopResize = await page.locator('#ew-sidebar').boundingBox();
    assert(afterTopResize.height > beforeTopResize.height + 20, 'Sidebar top resize handle did not increase height.');

    const beforeBottomRightResize = await page.locator('#ew-sidebar').boundingBox();
    await page.mouse.move(beforeBottomRightResize.x + beforeBottomRightResize.width - 2, beforeBottomRightResize.y + beforeBottomRightResize.height - 2);
    await page.mouse.down();
    await page.mouse.move(beforeBottomRightResize.x + beforeBottomRightResize.width + 35, beforeBottomRightResize.y + beforeBottomRightResize.height + 35);
    await page.mouse.up();
    const afterBottomRightResize = await page.locator('#ew-sidebar').boundingBox();
    assert(afterBottomRightResize.width > beforeBottomRightResize.width + 15, 'Sidebar bottom-right corner did not increase width.');
    assert(afterBottomRightResize.height > beforeBottomRightResize.height + 15, 'Sidebar bottom-right corner did not increase height.');

    const beforeTopLeftResize = await page.locator('#ew-sidebar').boundingBox();
    await page.mouse.move(beforeTopLeftResize.x + 2, beforeTopLeftResize.y + 2);
    await page.mouse.down();
    await page.mouse.move(beforeTopLeftResize.x - 25, beforeTopLeftResize.y - 25);
    await page.mouse.up();
    const afterTopLeftResize = await page.locator('#ew-sidebar').boundingBox();
    assert(afterTopLeftResize.width > beforeTopLeftResize.width + 10, 'Sidebar top-left corner did not increase width.');
    assert(afterTopLeftResize.height > beforeTopLeftResize.height + 10, 'Sidebar top-left corner did not increase height.');

    await page.locator('#q-fab-button').click();

    await page.fill('#writing', '明天早上十點我們會在會議室討論新的產品計畫。');
    await page.waitForSelector('#ew-sidebar.open', { timeout: 5000 });
    await page.waitForFunction(() => {
      const content = document.querySelector('#ew-sidebar-content');
      return content && content.textContent.trim() && !content.textContent.includes('翻譯進行中');
    }, { timeout: apiConfig.liveApi ? 30000 : 8000 });

    const sidebarText = (await page.locator('#ew-sidebar-content').innerText()).trim();
    assert(sidebarText.length > 0, 'Sidebar translation text should not be empty.');
    assert(!/^here(?:'s| is)\b/i.test(sidebarText), `Translation should not include an intro phrase, got: ${sidebarText}`);
    if (!apiConfig.liveApi) {
      assert(
        sidebarText.includes('API Key not configured'),
        `Expected missing API key message without live key, got: ${sidebarText}`
      );
    }
    const usageStats = await worker.evaluate(() => new Promise(resolve => {
      chrome.storage.local.get(['ewUsageStats'], result => resolve(result.ewUsageStats));
    }));
    assert(usageStats && usageStats.totalTranslationAttempts >= 1, 'Anonymous local usage stats were not recorded.');
    assert(usageStats.sourceCharCount > 0, 'Anonymous local usage source character count was not recorded.');
    assert(pageErrors.length === 0, `Page errors detected: ${pageErrors.join('; ')}`);

    console.log(JSON.stringify({
      ok: true,
      extensionId,
      workerUrl: worker.url(),
      provider: apiConfig.provider,
      liveApi: apiConfig.liveApi,
      sidebarText,
    }, null, 2));
  } finally {
    if (context) await context.close();
    server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
