const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-EWH-Webhook-Secret, X-Signature',
  'Cache-Control': 'no-store'
};

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};

const ALLOWED_EVENTS = new Set(['translation_completed']);
const ALLOWED_STATUSES = new Set(['success', 'failed']);
const MAX_BODY_BYTES = 4096;
const MAX_TRANSLATE_BODY_BYTES = 16000;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const MANAGED_PACKAGES = {
  starter: { priceUsd: 4.99, characters: 100000 },
  plus: { priceUsd: 9.99, characters: 250000 },
  pro: { priceUsd: 24.99, characters: 750000 },
};
const ANALYTICS_BONUS_RATE = 0.05;
const MODEL_PRICES = {
  openai: {
    'gpt-5.4': { input: 2.5, output: 15 },
    'gpt-5.4-mini': { input: 0.75, output: 4.5 },
    'gpt-5.4-nano': { input: 0.2, output: 1.25 },
  },
  gemini: {
    'gemini-3-flash-preview': { input: 0.5, output: 3 },
    'gemini-2.5-pro': { input: 1.25, output: 10 },
    'gemini-2.5-flash': { input: 0.3, output: 2.5 },
    'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  },
};

const DEFAULT_MANAGED_PROVIDER = 'gemini';
const DEFAULT_MANAGED_MODEL = 'gemini-2.5-flash-lite';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function html(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { ...HTML_HEADERS, ...headers } });
}

function cleanText(value, fallback, max = 80) {
  const text = String(value || fallback || '').trim();
  return text.slice(0, max) || fallback;
}

function cleanCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(Math.floor(number), 500000);
}

function cleanLicense(value) {
  return String(value || '').trim().slice(0, 120);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function number(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function percent(part, total) {
  const denominator = Number(total || 0);
  if (!denominator) return '0%';
  return `${Math.round((Number(part || 0) / denominator) * 100)}%`;
}

function estimateTokens(charCount) {
  return Math.ceil(Number(charCount || 0) / CHARS_PER_TOKEN_ESTIMATE);
}

function getModelPrice(provider, model) {
  return MODEL_PRICES[String(provider || '').toLowerCase()]?.[String(model || '').toLowerCase()] || null;
}

function estimateUsd(provider, model, sourceChars, outputChars) {
  const price = getModelPrice(provider, model);
  if (!price) return 0;
  const inputTokens = estimateTokens(sourceChars);
  const outputTokens = estimateTokens(outputChars);
  return ((inputTokens * price.input) + (outputTokens * price.output)) / 1000000;
}

function money(value) {
  const amount = Number(value || 0);
  if (amount === 0) return '$0.0000';
  if (amount < 0.0001) return '< $0.0001';
  return `$${amount.toFixed(4)}`;
}

function buildManagedPrompt(sourceText, style, customInstruction = '') {
  const outputRule = 'Only output the final English translation itself. Do not add any prefix, title, label, explanation, quotation wrapper, or phrase like "Here is the translation".';
  if (customInstruction) {
    return `${customInstruction}\n\n${outputRule}\n\nSource text: "${sourceText}"\n\nEnglish:`;
  }
  const styleDescription = style === 'casual'
    ? 'Please translate the following text from its original language into casual, spoken English, like how a native speaker would chat with a friend.'
    : 'Please translate the following text from its original language into formal, written English suitable for academic or professional contexts.';
  return `${styleDescription}\n\n${outputRule}\n\nSource text: "${sourceText}"\n\nEnglish:`;
}

function cleanTranslationText(text) {
  return String(text || '')
    .trim()
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/^(?:here(?:'s| is)\s+(?:the\s+)?(?:formal\s+written\s+|casual\s+|english\s+)?translation(?:\s+in\s+english)?|the\s+(?:formal\s+written\s+|casual\s+|english\s+)?translation\s+is|english(?:\s+translation)?|translation)\s*[:：\-–—]\s*/i, '')
    .trim();
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const prefix = `${name}=`;
  const found = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : '';
}

function hasDashboardAccess(request, env) {
  const expected = String(env.ADMIN_TOKEN || '').trim();
  if (!expected) return false;
  const url = new URL(request.url);
  const provided = url.searchParams.get('token') || getCookie(request, 'ewh_dashboard_token');
  return provided === expected;
}

function makeLicenseKey() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `EWHC-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{1,4}/g).join('-')}`;
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bytesToHex(signature);
}

function getLemonVariantId(env, packageId) {
  const key = `LEMON_VARIANT_${String(packageId || '').toUpperCase()}`;
  return String(env[key] || '').trim();
}

function normalizeEvent(input) {
  const event = cleanText(input.event, 'translation_completed', 60);
  const status = cleanText(input.status, 'failed', 20);
  const anonymousUserId = cleanText(input.anonymousUserId, '', 80);
  const dateBucket = /^\d{4}-\d{2}-\d{2}$/.test(String(input.dateBucket || '')) ? input.dateBucket : new Date().toISOString().slice(0, 10);

  if (!anonymousUserId || !anonymousUserId.startsWith('EWH-')) return { error: 'invalid anonymous user id' };
  if (!ALLOWED_EVENTS.has(event)) return { error: 'invalid event' };
  if (!ALLOWED_STATUSES.has(status)) return { error: 'invalid status' };

  return {
    anonymousUserId,
    event,
    status,
    sourceCharCount: cleanCount(input.sourceCharCount),
    outputCharCount: cleanCount(input.outputCharCount),
    provider: cleanText(input.provider, 'unknown', 40),
    model: cleanText(input.model, 'unknown', 80),
    style: cleanText(input.style, 'formal', 40),
    source: cleanText(input.source, 'unknown', 40),
    extensionVersion: cleanText(input.extensionVersion, 'unknown', 30),
    dateBucket,
    isTest: input.isTest === true || input.isTest === 1 ? 1 : 0
  };
}

async function storeUsage(env, event) {
  await env.DB.prepare(
    'INSERT INTO usage_events (anonymous_user_id, event, status, source_char_count, output_char_count, provider, model, style, source, extension_version, date_bucket, is_test) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    event.anonymousUserId,
    event.event,
    event.status,
    event.sourceCharCount,
    event.outputCharCount,
    event.provider,
    event.model,
    event.style,
    event.source,
    event.extensionVersion,
    event.dateBucket,
    event.isTest
  ).run();

  await env.DB.prepare([
    'INSERT INTO daily_usage_summary (date_bucket, total_events, successful_translations, failed_translations, source_char_count, output_char_count, unique_users, updated_at)',
    "VALUES (?, 1, ?, ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    'ON CONFLICT(date_bucket) DO UPDATE SET',
    'total_events = total_events + 1,',
    'successful_translations = successful_translations + excluded.successful_translations,',
    'failed_translations = failed_translations + excluded.failed_translations,',
    'source_char_count = source_char_count + excluded.source_char_count,',
    'output_char_count = output_char_count + excluded.output_char_count,',
    "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ].join(' ')).bind(
    event.dateBucket,
    event.status === 'success' ? 1 : 0,
    event.status === 'failed' ? 1 : 0,
    event.sourceCharCount,
    event.outputCharCount
  ).run();

  await env.DB.prepare([
    'UPDATE daily_usage_summary',
    'SET unique_users = (SELECT COUNT(DISTINCT anonymous_user_id) FROM usage_events WHERE date_bucket = ?),',
    "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    'WHERE date_bucket = ?'
  ].join(' ')).bind(event.dateBucket, event.dateBucket).run();
}

async function getManagedAccount(env, licenseKey) {
  return env.DB.prepare(
    'SELECT license_key, anonymous_user_id, status, analytics_bonus_enabled FROM managed_accounts WHERE license_key = ?'
  ).bind(licenseKey).first();
}

async function getManagedBalance(env, licenseKey) {
  const credits = await env.DB.prepare(
    'SELECT COALESCE(SUM(delta_characters), 0) AS credits FROM credit_ledger WHERE license_key = ?'
  ).bind(licenseKey).first();
  const usage = await env.DB.prepare(
    'SELECT COALESCE(SUM(credits_charged), 0) AS charged FROM managed_translation_usage WHERE license_key = ? AND status = ?'
  ).bind(licenseKey, 'success').first();
  return Math.max(0, Number(credits?.credits || 0) - Number(usage?.charged || 0));
}

async function upsertManagedAccount(env, { licenseKey, anonymousUserId = '', analyticsBonusEnabled = false }) {
  await env.DB.prepare([
    'INSERT INTO managed_accounts (license_key, anonymous_user_id, status, analytics_bonus_enabled, updated_at)',
    "VALUES (?, ?, 'active', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    'ON CONFLICT(license_key) DO UPDATE SET',
    'anonymous_user_id = COALESCE(NULLIF(excluded.anonymous_user_id, \'\'), managed_accounts.anonymous_user_id),',
    'status = \'active\',',
    'analytics_bonus_enabled = excluded.analytics_bonus_enabled,',
    "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ].join(' ')).bind(licenseKey, anonymousUserId, analyticsBonusEnabled ? 1 : 0).run();
}

async function addManagedCredits(env, { licenseKey, anonymousUserId, packageId, orderId, analyticsBonusEligible }) {
  const pack = MANAGED_PACKAGES[packageId];
  if (!pack) return { error: 'invalid package id' };
  const baseCharacters = pack.characters;
  const bonusCharacters = analyticsBonusEligible ? Math.floor(baseCharacters * ANALYTICS_BONUS_RATE) : 0;
  const totalCharacters = baseCharacters + bonusCharacters;
  await upsertManagedAccount(env, { licenseKey, anonymousUserId, analyticsBonusEnabled: analyticsBonusEligible });
  await env.DB.prepare(
    'INSERT OR IGNORE INTO credit_ledger (license_key, order_id, delta_characters, reason, analytics_bonus_applied) VALUES (?, ?, ?, ?, ?)'
  ).bind(licenseKey, orderId || null, totalCharacters, `purchase:${packageId}`, analyticsBonusEligible ? 1 : 0).run();
  return {
    ok: true,
    licenseKey,
    packageId,
    baseCharacters,
    bonusCharacters,
    totalCharacters,
    balanceCharacters: await getManagedBalance(env, licenseKey)
  };
}

async function storeManagedTranslationUsage(env, event) {
  await env.DB.prepare([
    'INSERT INTO managed_translation_usage',
    '(license_key, anonymous_user_id, status, source_char_count, output_char_count, provider, model, credits_charged, estimated_cost_usd, extension_version, date_bucket, is_test)',
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ].join(' ')).bind(
    event.licenseKey,
    event.anonymousUserId,
    event.status,
    event.sourceCharCount,
    event.outputCharCount,
    event.provider,
    event.model,
    event.creditsCharged,
    event.estimatedCostUsd,
    event.extensionVersion,
    event.dateBucket,
    event.isTest ? 1 : 0
  ).run();
}

async function callManagedGemini(env, { text, style, customInstruction, model }) {
  const apiKey = String(env.MANAGED_GEMINI_API_KEY || env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return { error: 'managed AI service is not configured' };
  const prompt = buildManagedPrompt(text, style, customInstruction);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: data?.error?.message || 'managed AI request failed' };
  }
  const translatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!translatedText) return { error: 'managed AI response did not include a translation' };
  return { translatedText: cleanTranslationText(translatedText) };
}

async function handleManagedBalance(request, env) {
  const url = new URL(request.url);
  const licenseKey = cleanLicense(url.searchParams.get('licenseKey'));
  if (!licenseKey) return json({ ok: false, error: 'license key required' }, 400);
  const account = await getManagedAccount(env, licenseKey);
  if (!account || account.status !== 'active') return json({ ok: false, error: 'license not active' }, 404);
  return json({
    ok: true,
    status: account.status,
    analyticsBonusEnabled: account.analytics_bonus_enabled === 1,
    balanceCharacters: await getManagedBalance(env, licenseKey)
  });
}

async function handleManagedTranslate(request, env) {
  if (Number(request.headers.get('content-length') || 0) > MAX_TRANSLATE_BODY_BYTES) {
    return json({ ok: false, error: 'payload too large' }, 413);
  }
  const payload = await request.json().catch(() => null);
  if (!payload) return json({ ok: false, error: 'invalid json' }, 400);
  const licenseKey = cleanLicense(payload.licenseKey);
  const text = String(payload.text || '').trim();
  const anonymousUserId = cleanText(payload.anonymousUserId, '', 80);
  const style = cleanText(payload.style, 'formal', 40);
  const customInstruction = cleanText(payload.customInstruction, '', 1500);
  const extensionVersion = cleanText(payload.extensionVersion, 'unknown', 30);
  const isTest = payload.isTest === true || payload.isTest === 1;
  const provider = cleanText(env.MANAGED_AI_PROVIDER, DEFAULT_MANAGED_PROVIDER, 40);
  const model = cleanText(env.MANAGED_GEMINI_MODEL, DEFAULT_MANAGED_MODEL, 80);
  const sourceCharCount = cleanCount(text);
  const dateBucket = new Date().toISOString().slice(0, 10);

  if (!licenseKey) return json({ ok: false, error: 'license key required' }, 400);
  if (!text) return json({ ok: false, error: 'text required' }, 400);
  if (anonymousUserId && !anonymousUserId.startsWith('EWH-')) return json({ ok: false, error: 'invalid anonymous user id' }, 400);

  const account = await getManagedAccount(env, licenseKey);
  if (!account || account.status !== 'active') return json({ ok: false, error: 'license not active' }, 402);
  const balanceBefore = await getManagedBalance(env, licenseKey);
  if (balanceBefore < sourceCharCount) return json({ ok: false, error: 'not enough managed credits', balanceCharacters: balanceBefore }, 402);

  const aiResult = provider === 'gemini'
    ? await callManagedGemini(env, { text, style, customInstruction, model })
    : { error: 'managed provider not supported yet' };
  const outputCharCount = aiResult.translatedText ? cleanCount(aiResult.translatedText) : 0;
  const status = aiResult.error ? 'failed' : 'success';
  const creditsCharged = status === 'success' ? sourceCharCount : 0;
  const estimatedCostUsd = estimateUsd(provider, model, sourceCharCount, outputCharCount);

  await storeManagedTranslationUsage(env, {
    licenseKey,
    anonymousUserId,
    status,
    sourceCharCount,
    outputCharCount,
    provider,
    model,
    creditsCharged,
    estimatedCostUsd,
    extensionVersion,
    dateBucket,
    isTest
  });

  if (aiResult.error) return json({ ok: false, error: aiResult.error, balanceCharacters: balanceBefore }, 502);
  return json({
    ok: true,
    translatedText: aiResult.translatedText,
    provider,
    model,
    chargedCharacters: creditsCharged,
    balanceCharacters: await getManagedBalance(env, licenseKey)
  });
}

async function handlePaymentWebhook(request, env) {
  const signingSecret = String(env.LEMON_WEBHOOK_SECRET || env.PAYMENT_WEBHOOK_SECRET || '').trim();
  const signature = request.headers.get('X-Signature') || '';
  if (!signingSecret || !signature) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'payload too large' }, 413);
  }
  const rawBody = await request.text();
  const expectedSignature = await hmacSha256Hex(signingSecret, rawBody);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return json({ ok: false, error: 'invalid signature' }, 401);
  }
  let payload;
  try {
    payload = JSON.parse(rawBody || 'null');
  } catch (error) {
    return json({ ok: false, error: 'invalid json' }, 400);
  }
  if (!payload) return json({ ok: false, error: 'invalid json' }, 400);
  const eventName = cleanText(payload?.meta?.event_name, '', 80);
  if (eventName && eventName !== 'order_created') return json({ ok: true, ignored: eventName });
  const custom = payload?.meta?.custom_data || {};
  const licenseKey = cleanLicense(custom.license_key || payload.licenseKey);
  const packageId = cleanText(custom.package_id || payload.packageId, '', 40);
  const orderId = cleanText(payload?.data?.id || payload.orderId, '', 120);
  const anonymousUserId = cleanText(custom.anonymous_user_id || payload.anonymousUserId, '', 80);
  const analyticsBonusEligible = custom.analytics_bonus === true || custom.analytics_bonus === '1' || payload.analyticsBonusEligible === true;
  if (!licenseKey) return json({ ok: false, error: 'license key required' }, 400);
  if (anonymousUserId && !anonymousUserId.startsWith('EWH-')) return json({ ok: false, error: 'invalid anonymous user id' }, 400);
  const result = await addManagedCredits(env, { licenseKey, anonymousUserId, packageId, orderId, analyticsBonusEligible });
  if (result.error) return json({ ok: false, error: result.error }, 400);
  return json(result);
}

async function handleCheckout(request, env) {
  const url = new URL(request.url);
  const packageId = cleanText(url.searchParams.get('package'), 'starter', 40);
  const pack = MANAGED_PACKAGES[packageId] || MANAGED_PACKAGES.starter;
  const licenseKey = cleanLicense(url.searchParams.get('licenseKey')) || makeLicenseKey();
  const anonymousUserId = cleanText(url.searchParams.get('anonymousUserId'), '', 80);
  const analyticsBonus = url.searchParams.get('analyticsBonus') === '1';
  const apiKey = String(env.LEMON_API_KEY || '').trim();
  const storeId = String(env.LEMON_STORE_ID || '').trim();
  const variantId = getLemonVariantId(env, packageId);
  if (apiKey && storeId && variantId) {
    const redirectUrl = String(env.MANAGED_SUCCESS_URL || '').trim();
    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            product_options: {
              enabled_variants: [Number(variantId)],
              ...(redirectUrl ? { redirect_url: redirectUrl } : {})
            },
            checkout_data: {
              custom: {
                license_key: licenseKey,
                package_id: packageId,
                anonymous_user_id: anonymousUserId,
                analytics_bonus: analyticsBonus ? '1' : '0'
              }
            },
            test_mode: String(env.LEMON_TEST_MODE || '').toLowerCase() === 'true'
          },
          relationships: {
            store: { data: { type: 'stores', id: storeId } },
            variant: { data: { type: 'variants', id: variantId } }
          }
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    const checkoutUrl = data?.data?.attributes?.url;
    if (!response.ok || !checkoutUrl) {
      return json({ ok: false, error: data?.errors?.[0]?.detail || 'could not create checkout' }, 502);
    }
    return new Response(null, { status: 302, headers: { Location: checkoutUrl, 'Cache-Control': 'no-store' } });
  }
  const bonusText = analyticsBonus ? ` With the 5% anonymous statistics bonus, this purchase would add ${number(Math.floor(pack.characters * (1 + ANALYTICS_BONUS_RATE)))} characters.` : '';
  return html(`<!doctype html><meta charset="utf-8"><title>Managed Credits checkout</title><body style="font-family:system-ui;padding:32px;line-height:1.5;max-width:720px"><h1>Managed Credits checkout is not connected yet</h1><p>This package is US$${pack.priceUsd} for ${number(pack.characters)} characters.${bonusText}</p><p>Your generated license key is:</p><pre style="padding:12px;background:#f4f4f4;border-radius:8px">${escapeHtml(licenseKey)}</pre><p>Before real purchases can run, configure <code>LEMON_API_KEY</code>, <code>LEMON_STORE_ID</code>, <code>LEMON_VARIANT_STARTER</code>, <code>LEMON_VARIANT_PLUS</code>, <code>LEMON_VARIANT_PRO</code>, and <code>LEMON_WEBHOOK_SECRET</code>.</p></body>`, 503);
}

async function getDashboardData(env) {
  const totals = await env.DB.prepare([
    'SELECT COUNT(*) AS total_events,',
    "SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_translations,",
    "SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_translations,",
    'SUM(source_char_count) AS source_char_count,',
    'SUM(output_char_count) AS output_char_count,',
    'COUNT(DISTINCT anonymous_user_id) AS unique_users',
    'FROM usage_events WHERE is_test = 0'
  ].join(' ')).first();

  const testTotals = await env.DB.prepare([
    'SELECT COUNT(*) AS total_events,',
    'SUM(source_char_count) AS source_char_count,',
    'SUM(output_char_count) AS output_char_count,',
    'COUNT(DISTINCT anonymous_user_id) AS unique_users',
    'FROM usage_events WHERE is_test = 1'
  ].join(' ')).first();

  const daily = await env.DB.prepare(
    [
      'SELECT date_bucket, COUNT(*) AS total_events,',
      "SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_translations,",
      "SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_translations,",
      'SUM(source_char_count) AS source_char_count, SUM(output_char_count) AS output_char_count,',
      'COUNT(DISTINCT anonymous_user_id) AS unique_users',
      'FROM usage_events WHERE is_test = 0',
      'GROUP BY date_bucket ORDER BY date_bucket DESC LIMIT 14'
    ].join(' ')
  ).all();

  const versions = await env.DB.prepare(
    'SELECT extension_version, COUNT(*) AS events, COUNT(DISTINCT anonymous_user_id) AS unique_users FROM usage_events WHERE is_test = 0 GROUP BY extension_version ORDER BY events DESC LIMIT 10'
  ).all();

  const providers = await env.DB.prepare(
    'SELECT provider, COUNT(*) AS events, COUNT(DISTINCT anonymous_user_id) AS unique_users FROM usage_events WHERE is_test = 0 GROUP BY provider ORDER BY events DESC LIMIT 10'
  ).all();

  const models = await env.DB.prepare(
    'SELECT provider, model, COUNT(*) AS events, COUNT(DISTINCT anonymous_user_id) AS unique_users, SUM(source_char_count) AS source_char_count, SUM(output_char_count) AS output_char_count FROM usage_events WHERE is_test = 0 GROUP BY provider, model ORDER BY events DESC LIMIT 20'
  ).all();

  const users = await env.DB.prepare([
    'SELECT anonymous_user_id, COUNT(*) AS translation_events,',
    "SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_translations,",
    "SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_translations,",
    'SUM(source_char_count) AS source_char_count,',
    'MAX(model) AS latest_model, MAX(extension_version) AS latest_version,',
    'MIN(received_at) AS first_seen, MAX(received_at) AS last_seen',
    'FROM usage_events',
    'WHERE is_test = 0',
    'GROUP BY anonymous_user_id',
    'ORDER BY last_seen DESC LIMIT 50'
  ].join(' ')).all();

  const testUsers = await env.DB.prepare([
    'SELECT anonymous_user_id, COUNT(*) AS translation_events,',
    'MAX(provider) AS provider, MAX(model) AS model,',
    'MAX(extension_version) AS latest_version,',
    'MIN(received_at) AS first_seen, MAX(received_at) AS last_seen',
    'FROM usage_events',
    'WHERE is_test = 1',
    'GROUP BY anonymous_user_id',
    'ORDER BY last_seen DESC LIMIT 50'
  ].join(' ')).all();

  const managedTotals = await env.DB.prepare([
    'SELECT COUNT(*) AS total_events,',
    "SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_translations,",
    'SUM(source_char_count) AS source_char_count,',
    'SUM(output_char_count) AS output_char_count,',
    'SUM(credits_charged) AS credits_charged,',
    'SUM(estimated_cost_usd) AS estimated_cost_usd,',
    'COUNT(DISTINCT license_key) AS active_licenses',
    'FROM managed_translation_usage WHERE is_test = 0'
  ].join(' ')).first();

  const managedCredits = await env.DB.prepare([
    'SELECT COUNT(DISTINCT license_key) AS licenses,',
    'SUM(delta_characters) AS credits_purchased,',
    'SUM(CASE WHEN analytics_bonus_applied = 1 THEN delta_characters ELSE 0 END) AS bonus_related_credits',
    'FROM credit_ledger'
  ].join(' ')).first();

  const managedLicenses = await env.DB.prepare([
    'SELECT a.license_key, a.status, a.analytics_bonus_enabled,',
    'COALESCE(SUM(l.delta_characters), 0) AS credits_purchased,',
    'COALESCE((SELECT SUM(u.credits_charged) FROM managed_translation_usage u WHERE u.license_key = a.license_key AND u.status = \'success\'), 0) AS credits_used,',
    'MAX(a.updated_at) AS updated_at',
    'FROM managed_accounts a',
    'LEFT JOIN credit_ledger l ON l.license_key = a.license_key',
    'GROUP BY a.license_key',
    'ORDER BY updated_at DESC LIMIT 50'
  ].join(' ')).all();

  return {
    totals: totals || {},
    testTotals: testTotals || {},
    managedTotals: managedTotals || {},
    managedCredits: managedCredits || {},
    daily: daily.results || [],
    versions: versions.results || [],
    providers: providers.results || [],
    models: (models.results || []).map(row => {
      const inputTokens = estimateTokens(row.source_char_count);
      const outputTokens = estimateTokens(row.output_char_count);
      const estimatedCost = estimateUsd(row.provider, row.model, row.source_char_count, row.output_char_count);
      return { ...row, input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: estimatedCost };
    }),
    users: users.results || [],
    testUsers: testUsers.results || [],
    managedLicenses: managedLicenses.results || [],
    generatedAt: new Date().toISOString()
  };
}

function table(rows, columns) {
  if (!rows.length) return '<div class="empty">目前還沒有資料。等使用者開啟匿名統計並完成翻譯後，這裡就會出現。</div>';
  const head = columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = rows.map(row => `<tr>${columns.map(column => {
    const value = column.format ? column.format(row[column.key], row) : row[column.key];
    return `<td>${escapeHtml(value)}</td>`;
  }).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderDashboard(data) {
  const totals = data.totals || {};
  const testTotals = data.testTotals || {};
  const avgInput = totals.total_events ? Math.round(Number(totals.source_char_count || 0) / Number(totals.total_events || 1)) : 0;
  const avgOutput = totals.total_events ? Math.round(Number(totals.output_char_count || 0) / Number(totals.total_events || 1)) : 0;
  const dailyRows = data.daily.map(row => ({ ...row, success_rate: percent(row.successful_translations, row.total_events) }));
  const estimatedCost = data.models.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
  const managedTotals = data.managedTotals || {};
  const managedCredits = data.managedCredits || {};
  const managedLicenses = (data.managedLicenses || []).map(row => ({
    ...row,
    balance: Number(row.credits_purchased || 0) - Number(row.credits_used || 0),
    analytics_bonus_enabled_text: row.analytics_bonus_enabled === 1 ? 'yes' : 'no'
  }));

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>English Writing Helper 使用情況</title>
  <style>
    :root{color-scheme:light;--ink:#202124;--muted:#5f6368;--line:#dadce0;--panel:#fff;--bg:#f8fafd;--soft:#efe9ff}
    *{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
    header{padding:28px 32px 18px;border-bottom:1px solid var(--line);background:#fff}h1{margin:0 0 8px;font-size:28px}h2{margin:0 0 14px;font-size:19px}p{margin:0;color:var(--muted);line-height:1.5}
    main{max-width:1180px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}
    .card,section{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px}.label{color:var(--muted);font-size:13px;margin-bottom:8px}.value{font-size:30px;font-weight:760}.hint{margin-top:6px;color:var(--muted);font-size:13px}
    section{margin-top:18px}.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}.note{margin-top:12px;padding:12px;background:var(--soft);border-radius:8px;color:#33215f}.empty{padding:18px;color:var(--muted);background:#fafafa;border-radius:8px}
    table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;border-bottom:1px solid #edf0f2;padding:10px 8px;vertical-align:top}th{color:var(--muted);font-size:12px;background:#fafafa}
    footer{color:var(--muted);font-size:12px;margin-top:22px}@media(max-width:900px){.grid,.two{grid-template-columns:1fr}main,header{padding-left:16px;padding-right:16px}}
  </style>
</head>
<body>
  <header><h1>English Writing Helper 使用情況</h1><p>這裡只顯示匿名統計。沒有原文、譯文、API key、網址或瀏覽紀錄。</p></header>
  <main>
    <div class="grid">
      <div class="card"><div class="label">總翻譯次數</div><div class="value">${number(totals.total_events)}</div><div class="hint">成功與失敗都算一次</div></div>
      <div class="card"><div class="label">匿名使用者</div><div class="value">${number(totals.unique_users)}</div><div class="hint">匿名 ID，不是 email</div></div>
      <div class="card"><div class="label">成功率</div><div class="value">${percent(totals.successful_translations, totals.total_events)}</div><div class="hint">${number(totals.successful_translations)} 成功 / ${number(totals.failed_translations)} 失敗</div></div>
      <div class="card"><div class="label">平均字數</div><div class="value">${number(avgInput)} -> ${number(avgOutput)}</div><div class="hint">每次翻譯的輸入 -> 輸出</div></div>
    </div>
    <section><h2>測試資料隔離</h2><p class="note">正式統計已排除測試資料。目前測試資料有 ${number(testTotals.total_events)} 次翻譯、${number(testTotals.unique_users)} 個測試 user ID。下面有獨立清單，方便辨認。</p></section>
    <section><h2>每天使用情況</h2>${table(dailyRows, [
      { key: 'date_bucket', label: '日期' },
      { key: 'total_events', label: '翻譯次數', format: number },
      { key: 'unique_users', label: '匿名使用者', format: number },
      { key: 'success_rate', label: '成功率' },
      { key: 'source_char_count', label: '輸入字數', format: number },
      { key: 'output_char_count', label: '輸出字數', format: number }
    ])}</section>
    <div class="two">
      <section><h2>版本分布</h2>${table(data.versions, [
        { key: 'extension_version', label: '插件版本', format: value => value || 'unknown' },
        { key: 'events', label: '翻譯次數', format: number },
        { key: 'unique_users', label: '匿名使用者', format: number }
      ])}</section>
      <section><h2>AI 服務商</h2>${table(data.providers, [
        { key: 'provider', label: '服務商', format: value => value || 'unknown' },
        { key: 'events', label: '翻譯次數', format: number },
        { key: 'unique_users', label: '匿名使用者', format: number }
      ])}</section>
    </div>
    <section><h2>Model 與成本估算</h2><p class="note">目前是估算，不是帳單。估算方式：約 ${CHARS_PER_TOKEN_ESTIMATE} 個字元算 1 token，再套用目前已知的標準 API 價格。實際帳單可能因免費額度、快取、thinking tokens、匯率、方案或價格變動而不同。總估算：${money(estimatedCost)}</p>${table(data.models, [
      { key: 'provider', label: '服務商', format: value => value || 'unknown' },
      { key: 'model', label: 'Model', format: value => value || 'unknown' },
      { key: 'events', label: '翻譯次數', format: number },
      { key: 'unique_users', label: '匿名使用者', format: number },
      { key: 'input_tokens', label: '估算輸入 tokens', format: number },
      { key: 'output_tokens', label: '估算輸出 tokens', format: number },
      { key: 'estimated_cost_usd', label: '估算成本 USD', format: money }
    ])}</section>
    <section><h2>Managed Credits</h2><p class="note">這一區是付費點數模式的營運資料。正式統計不顯示原文、譯文或 API key。Managed 翻譯次數：${number(managedTotals.total_events)}，成功：${number(managedTotals.successful_translations)}，已扣點數：${number(managedTotals.credits_charged)}，估算 AI 成本：${money(managedTotals.estimated_cost_usd)}，已售點數：${number(managedCredits.credits_purchased)}。</p>${table(managedLicenses, [
      { key: 'license_key', label: 'License key', format: value => value ? `${String(value).slice(0, 10)}...` : 'unknown' },
      { key: 'status', label: '狀態', format: value => value || 'unknown' },
      { key: 'analytics_bonus_enabled_text', label: '5% 獎勵' },
      { key: 'credits_purchased', label: '已購點數', format: number },
      { key: 'credits_used', label: '已用點數', format: number },
      { key: 'balance', label: '剩餘點數', format: number },
      { key: 'updated_at', label: '最近更新' }
    ])}</section>
    <section><h2>匿名使用者列表</h2><p class="note">這裡的 ID 只能幫你知道同一個匿名使用者大概用了幾次，不能知道他的姓名、email、網址、原文或譯文。</p>${table(data.users, [
      { key: 'anonymous_user_id', label: '匿名 user ID', format: value => value || 'unknown' },
      { key: 'translation_events', label: '翻譯次數', format: number },
      { key: 'successful_translations', label: '成功', format: number },
      { key: 'failed_translations', label: '失敗', format: number },
      { key: 'source_char_count', label: '輸入字數', format: number },
      { key: 'latest_model', label: '最近 model', format: value => value || 'unknown' },
      { key: 'latest_version', label: '最近版本', format: value => value || 'unknown' },
      { key: 'first_seen', label: '第一次看到' },
      { key: 'last_seen', label: '最近一次看到' }
    ])}</section>
    <section><h2>測試 user ID 列表</h2><p class="note">這一區只放我們本地測試、smoke test、手動測試視窗產生的 ID，不會混進上面的正式使用者統計。</p>${table(data.testUsers, [
      { key: 'anonymous_user_id', label: '測試 user ID', format: value => value || 'unknown' },
      { key: 'translation_events', label: '測試翻譯次數', format: number },
      { key: 'provider', label: '服務商', format: value => value || 'unknown' },
      { key: 'model', label: 'Model', format: value => value || 'unknown' },
      { key: 'latest_version', label: '最近版本', format: value => value || 'unknown' },
      { key: 'first_seen', label: '第一次看到' },
      { key: 'last_seen', label: '最近一次看到' }
    ])}</section>
    <footer>最後更新：${escapeHtml(data.generatedAt)}。重新整理頁面即可更新資料。</footer>
  </main>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: 'english-writing-helper-usage' });

    if (request.method === 'GET' && url.pathname === '/dashboard') {
      if (!hasDashboardAccess(request, env)) {
        return html('<!doctype html><meta charset="utf-8"><title>需要管理密碼</title><body style="font-family:system-ui;padding:32px"><h1>需要管理密碼</h1><p>請使用包含管理 token 的 Dashboard 連結。</p></body>', 401);
      }
      const token = url.searchParams.get('token');
      if (token) {
        return new Response(null, {
          status: 302,
          headers: {
            'Cache-Control': 'no-store',
            'Location': '/dashboard',
            'Referrer-Policy': 'no-referrer',
            'Set-Cookie': `ewh_dashboard_token=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`
          }
        });
      }
      return html(renderDashboard(await getDashboardData(env)));
    }

    if (request.method === 'GET' && url.pathname === '/api/dashboard') {
      if (!hasDashboardAccess(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      return json({ ok: true, data: await getDashboardData(env) });
    }

    if (request.method === 'GET' && url.pathname === '/checkout') {
      return handleCheckout(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/managed/balance') {
      return handleManagedBalance(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/managed/translate') {
      return handleManagedTranslate(request, env);
    }

    if (request.method === 'POST' && url.pathname === '/webhooks/payment') {
      return handlePaymentWebhook(request, env);
    }

    if (request.method !== 'POST' || url.pathname !== '/usage') return json({ ok: false, error: 'not found' }, 404);
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return json({ ok: false, error: 'payload too large' }, 413);

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return json({ ok: false, error: 'invalid json' }, 400);
    }

    const event = normalizeEvent(payload || {});
    if (event.error) return json({ ok: false, error: event.error }, 400);
    await storeUsage(env, event);
    return json({ ok: true });
  }
};
