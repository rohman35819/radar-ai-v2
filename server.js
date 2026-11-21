'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ingest = require('./lib/ingest');
const sources = require('./lib/sources');
const { analyzeMarket } = require('./lib/ai/gemini');
const { runGroup } = require('./lib/ai/group');
const { runWorkspaceReview } = require('./lib/ai/workspace');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PUB = path.join(__dirname, 'public');

function createApp({ cfg = ingest.loadConfig(), src = sources, state } = {}) {
  const st = state || ingest.load(cfg);
  let busy = null;
  let aiBusy = null;
  let aiTimer = null;
  let workspaceBusy = null;
  let workspaceTimer = null;
  const workspaceHour = Math.max(0, Math.min(23, Number(process.env.AI_WORKSPACE_HOUR || 10)));
  const reportHour = Math.max(0, Math.min(23, Number(process.env.AI_REPORT_HOUR || 9)));
  const hits = new Map();
  const limited = (ip) => { // 60 req/menit/IP
    const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 60000);
    h.push(now); hits.set(ip, h);
    if (hits.size > 5000) hits.clear();
    return h.length > 60;
  };
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
      .then((result) => { st.aiWorkspace = { ...(st.aiWorkspace || {}), last: result }; ingest.save(cfg, st); return result; })
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
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) {
        if (limited(ip)) return send(res, 429, { status: 'error', message: 'Terlalu banyak permintaan' }, 'application/json', { 'retry-after': '60' });
        if (url.pathname === '/api/health') return send(res, 200, { status: 'ok' });
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
          if (!cfg.adminToken || req.headers['x-admin-token'] !== cfg.adminToken) return send(res, 403, { status: 'error', message: 'ADMIN_TOKEN tidak cocok' });
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
            workspaceBusy = runWorkspaceReview({ ...workspaceContext(), instruction, participants })
              .then((result) => { result.instruction = instruction; st.aiWorkspace = { ...(st.aiWorkspace || {}), last: result }; ingest.save(cfg, st); return result; })
              .catch((e) => { console.error('AI command error', String(e.message || e).slice(0, 160)); return null; })
              .finally(() => { workspaceBusy = null; });
            return send(res, 202, { status: 'started' }, 'application/json', { 'cache-control': 'no-store' });
          });
          return;
        }
        if (url.pathname === '/api/ai/workspace/run' && req.method === 'POST') {
          if (!cfg.adminToken || req.headers['x-admin-token'] !== cfg.adminToken) return send(res, 403, { status: 'error', message: 'Dilarang' });
          if (workspaceBusy) return send(res, 202, { status: 'running' });
          runWorkspace();
          return send(res, 202, { status: 'started' }, 'application/json', { 'cache-control': 'no-store' });
        }
        if (url.pathname === '/api/ai/group/run' && req.method === 'POST') {
          if (!cfg.adminToken || req.headers['x-admin-token'] !== cfg.adminToken) return send(res, 403, { status: 'error', message: 'Dilarang' });
          if (aiBusy) return send(res, 202, { status: 'running' });
          aiBusy = runGroup({ tokens: st.tokens, stale: !st.lastOk || Date.now() - Date.parse(st.lastOk) > cfg.refreshMs * 3 })
            .then((result) => { st.aiGroup = { ...(st.aiGroup || {}), last: result }; ingest.save(cfg, st); return result; })
            .catch((e) => { console.error('AI group error', e.message); return null; })
            .finally(() => { aiBusy = null; });
          return send(res, 202, { status: 'started' }, 'application/json', { 'cache-control': 'no-store' });
        }
        if (url.pathname === '/api/ai/gemini-test' && req.method === 'POST') {
          if (!cfg.adminToken || req.headers['x-admin-token'] !== cfg.adminToken) return send(res, 403, { status: 'error', message: 'Dilarang' });
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
          if (!cfg.adminToken || req.headers['x-admin-token'] !== cfg.adminToken) return send(res, 403, { status: 'error', message: 'Dilarang' });
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
        ingest.save(cfg, st);
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
      .then((result) => { st.aiWorkspace = { ...(st.aiWorkspace || {}), last: result, dailyReviewDate: day }; ingest.save(cfg, st); })
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
module.exports = { createApp };
