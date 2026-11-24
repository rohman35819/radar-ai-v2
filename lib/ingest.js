'use strict';
const fs = require('fs');
const path = require('path');
const { screen, categoryMatcher, joinFundamentals } = require('./screener');
const alerts = require('./alerts');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const n = (k, d) => { const v = Number(env(k, d)); return Number.isFinite(v) ? v : d; };
function parseNewsFeeds(raw, defaults) {
  const value = String(raw ?? '').trim();
  const selected = value ? value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean) : [];
  const fallback = String(defaults || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  return (selected.length ? selected : fallback).slice(0, 8);
}
function loadConfig() {
  const defaultNewsFeeds = 'https://techcrunch.com/category/artificial-intelligence/feed/,https://cointelegraph.com/rss';
  return {
    port: n('PORT', 3000), cgKey: env('COINGECKO_DEMO_KEY', ''), tgToken: env('TELEGRAM_BOT_TOKEN', ''), tgChat: env('TELEGRAM_CHAT_ID', ''),
    adminToken: env('ADMIN_TOKEN', ''), trustedProxyHops: Math.max(0, Math.floor(n('TRUSTED_PROXY_HOPS', 0))), minMcap: n('MIN_MCAP', 1e6), maxMcap: n('MAX_MCAP', 1e8), minVolume: n('MIN_VOLUME', 5e4),
    maxPages: n('MAX_PAGES', 4), pageDelayMs: 2500,
    earlyGemsEnabled: env('EARLY_GEMS_ENABLED', '1') !== '0', onchainPages: Math.max(1, Math.min(10, Math.floor(n('ONCHAIN_PAGES', 3)))),
    onchainRefreshMin: Math.max(10, Math.min(1440, Math.floor(n('ONCHAIN_REFRESH_MIN', 60)))), onchainRefreshMs: Math.max(10, Math.min(1440, Math.floor(n('ONCHAIN_REFRESH_MIN', 60)))) * 60000, priceAlertPct: n('PRICE_ALERT_PCT', 15), volumeSpikeX: n('VOLUME_SPIKE_X', 3), minVolumeDelta: n('MIN_VOLUME_DELTA_USD', 5000), volumeEstAlerts: env('VOLUME_EST_ALERTS', '1') !== '0',
    exchEnabled: env('EXCHANGE_ENABLED', '1') !== '0', exchangeBase: env('EXCHANGE_BASE', 'https://data-api.binance.vision'), exchQuote: env('EXCH_QUOTE', 'USDT'),
    maxExchTokens: n('MAX_EXCH_TOKENS', 120), exchLimit: n('EXCH_KLINES_LIMIT', 80), exchConcurrency: 4, vol10MinBuckets: n('VOL10_MIN_BUCKETS', 12), vol10MinUsd: n('VOL10_MIN_USD', 2000),
    unlockDays: n('UNLOCK_DAYS', 7), cooldownH: n('ALERT_COOLDOWN_H', 6), refreshMs: n('REFRESH_MIN', 10) * 60000,
    llamaCats: env('LLAMA_CATEGORIES', 'AI,DePIN,Compute').split(','), feeds: parseNewsFeeds(process.env.NEWS_FEEDS, defaultNewsFeeds),
    unlocksUrl: env('UNLOCKS_URL', ''), corsOrigin: env('CORS_ORIGIN', ''), dataDir: path.resolve(env('DATA_DIR', './data')),
  };
}
const emptyState = () => ({ lastRefresh: null, lastOk: null, health: {}, tokens: [], fundamentals: {}, news: [], unlocks: [], alerts: [], alertLog: {}, history: {}, vol10m: {}, exchStats: null, earlyGems: [], earlyGemsMeta: null, goplusUsage: { day: null, month: null, day_count: 0, month_count: 0 } });

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return url && key ? { url, key } : null;
}
async function supabaseRequest(method, body) {
  const config = supabaseConfig();
  if (!config) { const error = new Error('SUPABASE_NOT_CONFIGURED'); error.code = 'SUPABASE_NOT_CONFIGURED'; throw error; }
  const response = await fetch(config.url + '/rest/v1/radar_state?id=eq.main', {
    method, headers: { apikey: config.key, Authorization: 'Bearer ' + config.key,
      'Content-Type': 'application/json', Accept: 'application/json',
      ...(method === 'POST' ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) {
    const error = new Error('SUPABASE_HTTP_' + response.status);
    error.code = response.status === 404 || response.status === 406 ? 'SUPABASE_TABLE_NOT_READY' : 'SUPABASE_HTTP_' + response.status;
    throw error;
  }
  return method === 'GET' ? response.json() : null;
}
async function loadAsync(cfg) {
  if (!supabaseConfig()) return load(cfg);
  const rows = await supabaseRequest('GET');
  if (!Array.isArray(rows) || !rows.length) return emptyState();
  const payload = rows[0].payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('SUPABASE_INVALID_STATE'); error.code = 'SUPABASE_INVALID_STATE'; throw error;
  }
  return { ...emptyState(), ...payload };
}
async function saveAsync(cfg, st) {
  if (!supabaseConfig()) return save(cfg, st);
  await supabaseRequest('POST', { id: 'main', payload: st, updated_at: new Date().toISOString() });
}

function load(cfg) {
  const file = path.join(cfg.dataDir, 'state.json');
  try {
    return { ...emptyState(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    // Hanya file yang memang belum pernah dibuat dianggap sebagai instalasi baru.
    // EACCES, EIO, EROFS, dan JSON rusak harus terlihat; jangan diam-diam reset state.
    if (error.code === 'ENOENT') return emptyState();
    throw error;
  }
}
function save(cfg, st) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const file = path.join(cfg.dataDir, 'state.json');
  const temporary = file + '.tmp';
  let renamed = false;
  try {
    fs.writeFileSync(temporary, JSON.stringify(st));
    fs.renameSync(temporary, file);
    renamed = true;
  } finally {
    // Bersihkan file sementara jika tulis/rename gagal; jangan menutupi error utama.
    if (!renamed) { try { fs.unlinkSync(temporary); } catch {} }
  }
}

// Tiap sumber gagal sendiri-sendiri: data lama dipertahankan, kesehatan sumber dicatat.
async function refresh(st, cfg, src) {
  const now = Date.now();
  const run = async (name, fn) => {
    try { const v = await fn(); st.health[name] = { ok: true, at: new Date().toISOString(), error: null }; return v; }
    catch (e) { const failed = { ok: false, at: new Date().toISOString(), error: String(e.code || e.message || e).slice(0, 200) }; if (Array.isArray(e.sources)) { failed.sources = e.sources; st.health[`${name}_sources`] = e.sources; } else if (name === 'news') st.health.news_sources = []; st.health[name] = failed; return null; }
  };
  const coins = await run('coingecko', () => src.fetchAiCoins(cfg));
  if (coins) { st.tokens = screen(coins, { ...cfg, now }); alerts.pushHistory(st.history, st.tokens, now); }
  if (coins && cfg.exchEnabled) {
    const ex = await run('exchange', () => src.fetchExchange(cfg, st.tokens, now));
    st.vol10m = ex ? ex.metrics : {}; st.exchStats = ex ? ex.stats : null; // gagal = hapus (jangan tampilkan data lama sebagai terkini)
  }
  const llama = await run('defillama', () => src.fetchLlama(cfg, categoryMatcher(cfg.llamaCats)));
  if (llama) st.fundamentals = joinFundamentals(st.tokens, llama.protocols, llama.fees, llama.revenue);
  const news = await run('news', async () => {
    if (!cfg.feeds.length) { st.health.news_sources = []; const e = new Error('NEWS_FEEDS_EMPTY'); e.code = 'NEWS_FEEDS_EMPTY'; throw e; }
    if (typeof src.fetchNewsDetailed === 'function') {
      const result = await src.fetchNewsDetailed(cfg);
      st.health.news_sources = Array.isArray(result.sources) ? result.sources : [];
      return result.items;
    }
    st.health.news_sources = [];
    return src.fetchNews(cfg);
  });
  if (news) st.news = news;
  const unl = await run('unlocks', () => src.fetchUnlocks(cfg));
  if (unl) st.unlocks = unl;
  const onchainRefreshMs = Number.isFinite(cfg.onchainRefreshMs) ? Math.max(0, cfg.onchainRefreshMs) : 60 * 60000;
  const lastOnchainAttempt = Date.parse(st.health.onchain?.at || '');
  const onchainDue = !Number.isFinite(lastOnchainAttempt) || now - lastOnchainAttempt >= onchainRefreshMs;
  if (cfg.earlyGemsEnabled && onchainDue && typeof src.fetchEarlyGems === 'function') {
    const gems = await run('onchain', () => src.fetchEarlyGems(cfg));
    if (gems && Array.isArray(gems.items)) {
      st.earlyGems = gems.items;
      st.earlyGemsMeta = { fetched_at: gems.fetched_at || new Date().toISOString(), source: gems.source || 'CoinGecko Onchain / GeckoTerminal', pool_count: gems.items.length, new_pool_count: gems.new_pool_count ?? gems.items.length, trending_pool_count: gems.trending_pool_count || 0, trending_error: gems.trending_error || null, coverage_hours: 48, pages_requested: gems.pages_requested || null };
      st.health.onchain_trending = { ok: !gems.trending_error, at: new Date().toISOString(), error: gems.trending_error || null };
    } else if (gems) {
      st.health.onchain = { ok: false, at: new Date().toISOString(), error: 'ONCHAIN_INVALID_RESPONSE' };
      st.health.onchain_trending = { ok: false, at: new Date().toISOString(), error: 'ONCHAIN_FEED_UNAVAILABLE' };
    } else {
      st.health.onchain_trending = { ok: false, at: new Date().toISOString(), error: st.health.onchain?.error || 'ONCHAIN_FEED_UNAVAILABLE' };
    }
  }
  if (coins) {
    const found = alerts.evaluate({ vol10m: st.vol10m, history: st.history, next: st.tokens, unlocks: st.unlocks, now, cfg, log: st.alertLog });
    const sent = await alerts.notify(found, cfg);
    st.alerts = [...sent, ...st.alerts].slice(0, 100);
    for (const k of Object.keys(st.alertLog)) if (now - st.alertLog[k] > 7 * 86400000) delete st.alertLog[k];
  } else {
    const k = 'health:coingecko';
    if (!st.alertLog[k] || now - st.alertLog[k] > cfg.cooldownH * 3600000) {
      st.alertLog[k] = now;
      const [a] = await alerts.notify([{ key: k, type: 'health', id: 'coingecko', msg: 'Feed CoinGecko gagal; data screener basi', at: new Date(now).toISOString() }], cfg);
      st.alerts.unshift(a);
    }
  }
  st.lastRefresh = new Date().toISOString();
  if (coins) st.lastOk = st.lastRefresh;
  await saveAsync(cfg, st);
  return st;
}
module.exports = { loadConfig, load, save, loadAsync, saveAsync, refresh, emptyState };
