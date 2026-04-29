const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

const ALLOWED_STATUSES = new Set(['success', 'failed']);
const ALLOWED_EVENTS = new Set(['translation_completed']);
const MAX_BODY_BYTES = 4096;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
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

function todayBucket() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEvent(input) {
  const event = cleanText(input.event, 'translation_completed', 60);
  const status = cleanText(input.status, 'failed', 20);
  const dateBucket = /^\d{4}-\d{2}-\d{2}$/.test(String(input.dateBucket || '')) ? input.dateBucket : todayBucket();
  const anonymousUserId = cleanText(input.anonymousUserId, '', 80);

  if (!anonymousUserId || !anonymousUserId.startsWith('EWH-')) {
    return { error: 'invalid anonymous user id' };
  }
  if (!ALLOWED_EVENTS.has(event)) return { error: 'invalid event' };
  if (!ALLOWED_STATUSES.has(status)) return { error: 'invalid status' };

  return {
    anonymousUserId,
    event,
    status,
    sourceCharCount: cleanCount(input.sourceCharCount),
    outputCharCount: cleanCount(input.outputCharCount),
    provider: cleanText(input.provider, 'unknown', 40),
    style: cleanText(input.style, 'formal', 40),
    source: cleanText(input.source, 'unknown', 40),
    extensionVersion: cleanText(input.extensionVersion, 'unknown', 30),
    dateBucket
  };
}

async function storeUsage(env, event) {
  await env.DB.prepare(
    'INSERT INTO usage_events (anonymous_user_id, event, status, source_char_count, output_char_count, provider, style, source, extension_version, date_bucket) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    event.anonymousUserId,
    event.event,
    event.status,
    event.sourceCharCount,
    event.outputCharCount,
    event.provider,
    event.style,
    event.source,
    event.extensionVersion,
    event.dateBucket
  ).run();

  const summarySql = [
    'INSERT INTO daily_usage_summary (date_bucket, total_events, successful_translations, failed_translations, source_char_count, output_char_count, unique_users, updated_at)',
    "VALUES (?, 1, ?, ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    'ON CONFLICT(date_bucket) DO UPDATE SET',
    'total_events = total_events + 1,',
    'successful_translations = successful_translations + excluded.successful_translations,',
    'failed_translations = failed_translations + excluded.failed_translations,',
    'source_char_count = source_char_count + excluded.source_char_count,',
    'output_char_count = output_char_count + excluded.output_char_count,',
    "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
  ].join(' ');

  await env.DB.prepare(summarySql).bind(
    event.dateBucket,
    event.status === 'success' ? 1 : 0,
    event.status === 'failed' ? 1 : 0,
    event.sourceCharCount,
    event.outputCharCount
  ).run();

  const uniqueSql = [
    'UPDATE daily_usage_summary',
    'SET unique_users = (SELECT COUNT(DISTINCT anonymous_user_id) FROM usage_events WHERE date_bucket = ?),',
    "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    'WHERE date_bucket = ?'
  ].join(' ');

  await env.DB.prepare(uniqueSql).bind(event.dateBucket, event.dateBucket).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'english-writing-helper-usage' });
    }

    if (request.method !== 'POST' || url.pathname !== '/usage') {
      return json({ ok: false, error: 'not found' }, 404);
    }

    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) {
      return json({ ok: false, error: 'payload too large' }, 413);
    }

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
