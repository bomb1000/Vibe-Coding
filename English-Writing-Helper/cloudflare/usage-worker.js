const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

async function getDashboardData(env) {
  const totals = await env.DB.prepare([
    'SELECT COUNT(*) AS total_events,',
    "SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_translations,",
    "SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_translations,",
    'SUM(source_char_count) AS source_char_count,',
    'SUM(output_char_count) AS output_char_count,',
    'COUNT(DISTINCT anonymous_user_id) AS unique_users',
    'FROM usage_events'
  ].join(' ')).first();

  const daily = await env.DB.prepare(
    'SELECT date_bucket, total_events, successful_translations, failed_translations, source_char_count, output_char_count, unique_users FROM daily_usage_summary ORDER BY date_bucket DESC LIMIT 14'
  ).all();

  const versions = await env.DB.prepare(
    'SELECT extension_version, COUNT(*) AS events, COUNT(DISTINCT anonymous_user_id) AS unique_users FROM usage_events GROUP BY extension_version ORDER BY events DESC LIMIT 10'
  ).all();

  const providers = await env.DB.prepare(
    'SELECT provider, COUNT(*) AS events, COUNT(DISTINCT anonymous_user_id) AS unique_users FROM usage_events GROUP BY provider ORDER BY events DESC LIMIT 10'
  ).all();

  const users = await env.DB.prepare([
    'SELECT anonymous_user_id, COUNT(*) AS translation_events,',
    "SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_translations,",
    "SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_translations,",
    'SUM(source_char_count) AS source_char_count,',
    'MAX(extension_version) AS latest_version,',
    'MIN(received_at) AS first_seen, MAX(received_at) AS last_seen',
    'FROM usage_events',
    'GROUP BY anonymous_user_id',
    'ORDER BY last_seen DESC LIMIT 50'
  ].join(' ')).all();

  return {
    totals: totals || {},
    daily: daily.results || [],
    versions: versions.results || [],
    providers: providers.results || [],
    users: users.results || [],
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
  const avgInput = totals.total_events ? Math.round(Number(totals.source_char_count || 0) / Number(totals.total_events || 1)) : 0;
  const avgOutput = totals.total_events ? Math.round(Number(totals.output_char_count || 0) / Number(totals.total_events || 1)) : 0;
  const dailyRows = data.daily.map(row => ({ ...row, success_rate: percent(row.successful_translations, row.total_events) }));

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
    <section><h2>匿名使用者列表</h2><p class="note">這裡的 ID 只能幫你知道同一個匿名使用者大概用了幾次，不能知道他的姓名、email、網址、原文或譯文。</p>${table(data.users, [
      { key: 'anonymous_user_id', label: '匿名 user ID', format: value => value || 'unknown' },
      { key: 'translation_events', label: '翻譯次數', format: number },
      { key: 'successful_translations', label: '成功', format: number },
      { key: 'failed_translations', label: '失敗', format: number },
      { key: 'source_char_count', label: '輸入字數', format: number },
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
