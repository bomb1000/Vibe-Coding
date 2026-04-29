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

async function startTestServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>English Writing Helper Manual Test</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 760px; margin: 48px auto; line-height: 1.5; }
            textarea { width: 100%; min-height: 140px; font-size: 16px; padding: 12px; box-sizing: border-box; }
          </style>
        </head>
        <body>
          <h1>English Writing Helper Manual Test</h1>
          <p>Type Traditional Chinese below. The extension should open its sidebar and show the English translation.</p>
          <label for="writing">Writing</label>
          <textarea id="writing">明天早上十點我們會在會議室討論新的產品計畫。</textarea>
        </body>
      </html>`);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function configureKeys(worker) {
  const geminiApiKey = process.env.EW_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    readKeychainPassword('codex-ewh-gemini-api-key');
  const openaiApiKey = process.env.EW_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    readKeychainPassword('codex-ewh-openai-api-key');

  const provider = openaiApiKey ? 'openai' : 'gemini';

  await worker.evaluate(options => new Promise((resolve, reject) => {
    chrome.storage.sync.set(options, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  }), {
    apiProvider: provider,
    writingStyle: 'formal',
    geminiApiKey: geminiApiKey || '',
    openaiApiKey: openaiApiKey || '',
    geminiUserSelectedModel: 'gemini-2.5-flash',
    openaiUserSelectedModel: 'gpt-5.4-mini',
  });

  return { provider, hasLiveKey: Boolean(openaiApiKey || geminiApiKey) };
}

async function main() {
  const { chromium } = loadPlaywright();
  const extensionPath = path.resolve(__dirname, '..');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ew-manual-test-'));
  const server = await startTestServer();

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
  const extensionId = worker.url().match(/^chrome-extension:\/\/([^/]+)\//)?.[1];
  const config = await configureKeys(worker);

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);

  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

  console.log(JSON.stringify({
    ok: true,
    message: 'Manual test browser is open. Close the Chromium window or press Ctrl+C here when finished.',
    extensionPath,
    extensionId,
    provider: config.provider,
    hasLiveKey: config.hasLiveKey,
    profile: userDataDir,
  }, null, 2));

  process.on('SIGINT', async () => {
    await context.close();
    server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    process.exit(0);
  });

  context.on('close', () => {
    server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    process.exit(0);
  });

  await new Promise(() => {});
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
