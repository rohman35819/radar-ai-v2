'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ingest = require('./lib/ingest');
const { createExchangeService, ExchangeError } = require('./lib/exchanges');
const sources = require('./lib/sources');
const { analyzeMarket } = require('./lib/ai/gemini');
const { runGroup } = require('./lib/ai/group');
const { runWorkspaceReview } = require('./lib/ai/workspace');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PUB = path.join(__dirname, 'public');

function resolveClientIp(req, trustedProxyHops = 0) {
  const socketIp = String(req.socket?.remoteAddress || 'unknown');
  const hops = Number.isInteger(trustedProxyHops) ? Math.max(0, trustedProxyHops) : 0;
  if (!hops) return socketIp;
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',').map((value) => value.trim()).filter(Boolean);
  const clientIndex = forwarded.length - hops;
  return clientIndex >= 0 ? forwarded[clientIndex] : socketIp;
}

function createRateLimiter({ limit = 60, windowMs = 60000, maxKeys = 5000, sweepIntervalMs = 10000, now = Date.now } = {}) {
  const hits = new Map();
  let lastSweep = 0;
  return (key) => {
    const current = now();
    if (!hits.has(key) && hits.size >= maxKeys && current - lastSweep >= sweepIntervalMs) {
      for (const [candidate, timestamps] of hits) {
        const active = timestamps.filter((timestamp) => current - timestamp < windowMs);
        if (active.length) hits.set(candidate, active);
        else hits.delete(candidate);
      }
      lastSweep = current;
    }
    // Fail closed for new identities when the bounded table is full; never clear active limits.
    if (!hits.has(key) && hits.size >= maxKeys) return true;
    const timestamps = (hits.get(key) || []).filter((timestamp) => current - timestamp < windowMs);
    timestamps.push(current);
    hits.set(key, timestamps);
    return timestamps.length > limit;
  };
}

function createApp({ cfg = ingest.loadConfig(), src = sources, state, exchangeService, exchangeAccessToken } = {}) {
  const exchangeApi = exchangeService || createExchangeService();
  const matchesToken = (expectedValue, provided) => {
    if (!expectedValue || typeof provided !== 'string') return false;
    const expected = Buffer.from(String(expectedValue));
    const actual = Buffer.from(provided);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  };
  const privateExchangeToken = String(exchangeAccessToken !== undefined ? exchangeAccessToken : (process.env.EXCHANGE_ACCESS_TOKEN || cfg.adminToken || ''));
  const hasValidExchangeToken = (provided) => matchesToken(privateExchangeToken, provided);
  const hasValidAdminToken = (provided) => matchesToken(cfg.adminToken, provided);
  const st = state || ingest.load(cfg);
  let storageChecked = false;
  let storageErrorCode = null;
  const persistState = () => {
    try { ingest.save(cfg, st); storageChecked = true; storageErrorCode = null; }
    catch (error) { storageChecked = true; storageErrorCode = /^[A-Z0-9_]+$/.test(String(error.code || '')) ? error.code : 'STORAGE_WRITE_FAILED'; throw error; }
  };
  let busy = null;
  let aiBusy = null;
  let aiTimer = null;
  let workspaceBusy = null;
  let workspaceTimer = null;
  const workspaceHour = Math.max(0, Math.min(23, Number(process.env.AI_WORKSPACE_HOUR || 10)));
  const reportHour = Math.max(0, Math.min(23, Number(process.env.AI_REPORT_HOUR || 9)));
  const limited = createRateLimiter({ limit: 60, windowMs: 60000, maxKeys: 5000 });
  const doRefresh = () => (busy = busy || ingest.refresh(st, cfg, src).catch((e) => console.error('refresh error', e.message)).finally(() => { busy = null; }));

  const workspaceContext = () => ({
    market: { token_count: st.tokens.length, symbols: st.tokens.slice(0, 12).map((t) => t.symbol), stale: !st.lastOk || Date.now() - Date.parse(st.lastOk) > cfg.refreshMs * 3 },
    sources: Object.fromEntries(Object.entries(st.health || {}).map(([k, v]) => [k, { ok: Boolean(v.ok), error: v.ok ? null : String(v.error || '').slice(0, 100) }])),
    dashboard_sections: ['Screener', 'Watchlist', 'Berita', 'Unlock', 'Alert', 'Grup AI'],
    recent_group_summary: st.aiGroup?.last?.final?.summary || null
  });
  const runWorkspace = () => {
    if (workspaceBusy) return workspaceBusy;
    workspaceBusy = runWorkspaceReview(workspaceContext())
      .then((result) => { st.aiWorkspace = { ...(st.aiWorkspace || {}), last: result }; persistState(); return result; })
      .catch((e) => { console.error('AI workspace error', String(e.message || e).slice(0, 160)); return null; })
      .finally(() => { workspaceBusy = null; });
    return workspaceBusy;
  };

  const send = (res, code, body, type = 'application/json', extra = {}) => {
    res.writeHead(code, { 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
      ...(cfg.corsOrigin ? { 'access-control-allow-origin': cfg.corsOrigin, vary: 'Origin' } : {}), ...extra });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };

  const server = http.createServer((req, res) => {
    try {
      const ip = resolveClientIp(req, cfg.trustedProxyHops);
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) {
        if (limited(ip)) return send(res, 429, { status: 'error', message: 'Terlalu banyak permintaan' }, 'application/json', { 'retry-after': '60' });
        if (url.pathname === '/api/exchanges/status' && req.method === 'GET') {
          return send(res, 200, { status: 'success', exchanges: exchangeApi.status(), access_configured: Boolean(privateExchangeToken) }, 'application/json', { 'cache-control': 'no-store' });
        }
        const exchangeAccount = url.pathname.match(/^\/api\/exchanges\/(binance|bybit)\/account$/);
        if (exchangeAccount && req.method === 'GET') {
          if (!privateExchangeToken) return send(res, 503, { status: 'error', code: 'EXCHANGE_ACCESS_NOT_CONFIGURED', message: 'Akses privat Exchange Hub belum dikonfigurasi di server.' }, 'application/json', { 'cache-control': 'no-store' });
          if (!hasValidExchangeToken(req.headers['x-exchange-access-token'])) return send(res, 401, { status: 'error', code: 'EXCHANGE_ACCESS_DENIED', message: 'Token akses Exchange Hub tidak valid.' }, 'application/json', { 'cache-control': 'no-store' });
          exchangeApi.account(exchangeAccount[1]).then((account) => {
            send(res, 200, { status: 'success', ...account }, 'application/json', { 'cache-control': 'no-store' });
          }).catch((error) => {
            const known = error instanceof ExchangeError;
            const code = known ? error.code : 'EXCHANGE_INTERNAL_ERROR';
            const status = known ? error.status : 502;
            const message = code.endsWith('_CREDENTIALS_NOT_CONFIGURED') ? 'API Key dan API Secret belum lengkap di server.' :
              code === 'EXCHANGE_TIMEOUT' ? 'Exchange tidak merespons tepat waktu.' :
              code === 'EXCHANGE_NETWORK_ERROR' ? 'Tidak dapat menjangkau exchange.' :
              code.startsWith('EXCHANGE_UPSTREAM_HTTP_') ? 'Exchange menolak permintaan. Periksa izin API dan konfigurasi IP.' :
              code.includes('API_ERROR_') ? 'Exchange menolak permintaan. Periksa izin read-only dan jenis akun.' :
              'Koneksi exchange gagal. Periksa konfigurasi server.';
            send(res, status, { status: 'error', exchange: exchangeAccount[1], code, message }, 'application/json', { 'cache-control': 'no-store' });
          });
          return;
        }
        if (url.pathname === '/api/exchanges/market' && req.method === 'GET') {
          exchangeApi.market(url.searchParams.get('exchange'), url.searchParams.get('symbol')).then((market) => {
            send(res, 200, { status: 'success', ...market }, 'application/json', { 'cache-control': 'public, max-age=10' });
          }).catch((error) => {
            const known = error instanceof ExchangeError;
            const code = known ? error.code : 'EXCHANGE_INTERNAL_ERROR';
            const status = known ? error.status : 502;
            const message = code === 'INVALID_MARKET_SYMBOL' ? 'Format pair tidak valid.' :
              code === 'EXCHANGE_TIMEOUT' ? 'Exchange tidak merespons tepat waktu.' :
              code === 'EXCHANGE_NETWORK_ERROR' ? 'Tidak dapat menjangkau exchange.' :
              code.startsWith('EXCHANGE_UPSTREAM_HTTP_') ? 'Data market tidak tersedia dari exchange.' :
              'Gagal mengambil data market.';
            send(res, status, { status: 'error', code, message }, 'application/json', { 'cache-control': 'no-store' });
          });
          return;
        }
        if (url.pathname === '/api/health') {
          const storage = { status: storageErrorCode ? 'error' : storageChecked ? 'ok' : 'unchecked', code: storageErrorCode };
          return send(res, storageErrorCode ? 503 : 200, { status: storageErrorCode ? 'degraded' : 'ok', storage }, 'application/json', { 'cache-control': 'no-store' });
        }
        if (url.pathname === '/api/snapshot' && req.method === 'GET') {
          const age = st.lastOk ? Date.now() - Date.parse(st.lastOk) : null;
          return send(res, 200, { status: 'success', server_time: new Date().toISOString(), last_refresh: st.lastRefresh, last_ok: st.lastOk,
            stale: age === null || age > cfg.refreshMs * 3, health: st.health, filters: { min_mcap: cfg.minMcap, max_mcap: cfg.maxMcap, min_volume: cfg.minVolume },
            tokens: st.tokens.map((t) => ({ ...t, fundamental: st.fundamentals[t.id] || null, vol10m: (st.vol10m || {})[t.id] || null })), exchange: st.exchStats || null, news: st.news, unlocks: st.unlocks, alerts: st.alerts.slice(0, 50),
            config_needed: { telegram: !(cfg.tgToken && cfg.tgChat), coingecko_key: !cfg.cgKey, unlock_source: !cfg.unlocksUrl && !st.unlocks.length } },
          'application/json', { 'cache-control': 'public, max-age=30' });
        }
        if (url.pathname === '/api/ai/group' && req.method === 'GET') {
          return send(res, 200, { status: 'success', group: st.aiGroup || null }, 'application/json', { 'cache-control': 'no-store' });
        }
        if (url.pathname === '/api/ai/workspace' && req.method === 'GET') {
          return send(res, 200, { status: 'success', workspace: st.aiWorkspace || null }, 'application/json', { 'cache-control': 'no-store' });
        }
        if (url.pathname === '/api/ai/command' && req.method === 'POST') {
          if (!hasValidAdminToken(req.headers['x-admin-token'])) return send(res, 403, { status: 'error', message: 'ADMIN_TOKEN tidak cocok' });
          let size = 0; const chunks = [];
          req.on('data', (chunk) => { size += chunk.length; if (size <= 10000) chunks.push(chunk); });
          req.on('end', () => {
            if (size > 10000) return send(res, 413, { status: 'error', message: 'Perintah terlalu panjang' });
            let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return send(res, 400, { status: 'error', message: 'Format perintah tidak valid' }); }
            const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 2000) : '';
            if (!instruction) return send(res, 400, { status: 'error', message: 'Tulis perintah terlebih dahulu' });
            const allowed = ['gemini', 'groq', 'openrouter', 'openai'];
            const participants = Array.isArray(body.participants) ? [...new Set(body.participants.filter((p) => allowed.includes(p)))] : allowed;
            if (!participants.length) return send(res, 400, { status: 'error', message: 'Pilih minimal satu peserta rapat' });
            if (workspaceBusy) return send(res, 409, { status: 'running', message: 'Rapat sebelumnya masih berlangsung' });
            const commandId = 'meeting-' + Date.now();
            workspaceBusy = runWorkspaceReview({ ...workspaceContext(), instruction, participants })
              .then((result) => { result.command_id = commandId; result.instruction = instruction; st.aiWorkspace = { ...(st.aiWorkspace || {}), last: result }; persistState(); return result; })
              .catch((e) => { console.error('AI command error', String(e.message || e).slice(0, 160)); return null; })
              .finally(() => { workspaceBusy = null; });
            return send(res, 202, { status: 'started', command_id: commandId }, 'application/json', { 'cache-control': 'no-store' });
          });
          return;
        }
        if (url.pathname === '/api/ai/workspace/run' && req.method === 'POST') {
          if (!hasValidAdminToken(req.headers['x-admin-token'])) return send(res, 403, { status: 'error', message: 'Dilarang' });
          if (workspaceBusy) return send(res, 202, { status: 'running' });
          runWorkspace();
          return send(res, 202, { status: 'started' }, 'application/json', { 'cache-control': 'no-store' });
        }
        if (url.pathname === '/api/ai/group/run' && req.method === 'POST') {
          if (!hasValidAdminToken(req.headers['x-admin-token'])) return send(res, 403, { status: 'error', message: 'Dilarang' });
          if (aiBusy) return send(res, 202, { status: 'running' });
          aiBusy = runGroup({ tokens: st.tokens, stale: !st.lastOk || Date.now() - Date.parse(st.lastOk) > cfg.refreshMs * 3 })
            .then((result) => { st.aiGroup = { ...(st.aiGroup || {}), last: result }; persistState(); return result; })
            .catch((e) => { console.error('AI group error', e.message); return null; })
            .finally(() => { aiBusy = null; });
          return send(res, 202, { status: 'started' }, 'application/json', { 'cache-control': 'no-store' });
        }
        if (url.pathname === '/api/ai/gemini-test' && req.method === 'POST') {
          if (!hasValidAdminToken(req.headers['x-admin-token'])) return send(res, 403, { status: 'error', message: 'Dilarang' });
          let size = 0;
          const chunks = [];
          req.on('data', (chunk) => { size += chunk.length; if (size <= 50000) chunks.push(chunk); });
          req.on('end', async () => {
            if (size > 50000) return send(res, 413, { status: 'error', message: 'Data terlalu besar' }, 'application/json', { 'cache-control': 'no-store' });
            let marketData;
            try { marketData = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
            catch { return send(res, 400, { status: 'error', message: 'Format JSON tidak valid' }, 'application/json', { 'cache-control': 'no-store' }); }
            try {
              const analysis = await analyzeMarket(marketData);
              return send(res, 200, { status: 'success', analysis }, 'application/json', { 'cache-control': 'no-store' });
            } catch (e) {
              return send(res, 502, { status: 'error', message: String(e.message || e).slice(0, 200) }, 'application/json', { 'cache-control': 'no-store' });
            }
          });
          return;
        }
        if (url.pathname === '/api/refresh' && req.method === 'POST') {
          if (!hasValidAdminToken(req.headers['x-admin-token'])) return send(res, 403, { status: 'error', message: 'Dilarang' });
          doRefresh(); return send(res, 202, { status: 'started' });
        }
        return send(res, 404, { status: 'error', message: 'Tidak ditemukan' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { status: 'error' });
      let rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const file = path.normalize(path.join(PUB, rel));
      if (!file.startsWith(PUB + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Tidak ditemukan', 'text/plain');
      send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream', file.endsWith('sw.js') ? { 'cache-control': 'no-cache' } : {});
    } catch { send(res, 500, { status: 'error', message: 'Kesalahan server' }); }
  });
  let timer;
  const runDailyReport = async () => {
    const now = new Date();
    const jakarta = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const day = [jakarta.getFullYear(), String(jakarta.getMonth() + 1).padStart(2, '0'), String(jakarta.getDate()).padStart(2, '0')].join('-');
    if (jakarta.getHours() < reportHour || st.aiGroup?.dailyReportDate === day || aiBusy || !st.lastOk) return;
    aiBusy = runGroup({ tokens: st.tokens, stale: !st.lastOk || Date.now() - Date.parse(st.lastOk) > cfg.refreshMs * 3 })
      .then((result) => {
        st.aiGroup = { ...(st.aiGroup || {}), last: result, dailyReportDate: day };
        persistState();
      })
      .catch((e) => console.error('AI daily report error', e.message))
      .finally(() => { aiBusy = null; });
    await aiBusy;
  };
  const runDailyWorkspace = async () => {
    if (process.env.AI_WORKSPACE_ENABLED === '0') return;
    const now = new Date();
    const jakarta = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const day = [jakarta.getFullYear(), String(jakarta.getMonth() + 1).padStart(2, '0'), String(jakarta.getDate()).padStart(2, '0')].join('-');
    if (jakarta.getHours() < workspaceHour || st.aiWorkspace?.dailyReviewDate === day || workspaceBusy) return;
    workspaceBusy = runWorkspaceReview(workspaceContext())
      .then((result) => { st.aiWorkspace = { ...(st.aiWorkspace || {}), last: result, dailyReviewDate: day }; persistState(); })
      .catch((e) => console.error('AI daily workspace error', String(e.message || e).slice(0, 160)))
      .finally(() => { workspaceBusy = null; });
    await workspaceBusy;
  };
  const start = () => {
    doRefresh();
    timer = setInterval(doRefresh, cfg.refreshMs);
    aiTimer = setInterval(runDailyReport, 60000);
    workspaceTimer = setInterval(runDailyWorkspace, 60000);
    runDailyReport();
    runDailyWorkspace();
    return server;
  };
  const stop = () => { clearInterval(timer); clearInterval(aiTimer); clearInterval(workspaceTimer); server.close(); };
  return { server, start, stop, state: st, refresh: doRefresh };
}

if (require.main === module) {
  const cfg = ingest.loadConfig();
  const app = createApp({ cfg });
  app.start().listen(cfg.port, () => console.log(`RADAR AI V2 di port ${cfg.port}`));
  process.on('SIGTERM', () => { app.stop(); process.exit(0); });
}
module.exports = { createApp, resolveClientIp, createRateLimiter };
