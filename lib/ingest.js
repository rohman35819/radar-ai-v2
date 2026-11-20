'use strict';
const fs = require('fs');
const path = require('path');
const { screen, categoryMatcher, joinFundamentals } = require('./screener');
const alerts = require('./alerts');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const n = (k, d) => { const v = Number(env(k, d)); return Number.isFinite(v) ? v : d; };
function loadConfig() {
  return {
    port: n('PORT', 3000), cgKey: env('COINGECKO_DEMO_KEY', ''), tgToken: env('TELEGRAM_BOT_TOKEN', ''), tgChat: env('TELEGRAM_CHAT_ID', ''),
    adminToken: env('ADMIN_TOKEN', ''), minMcap: n('MIN_MCAP', 1e6), maxMcap: n('MAX_MCAP', 1e8), minVolume: n('MIN_VOLUME', 5e4),
    maxPages: n('MAX_PAGES', 4), pageDelayMs: 2500, priceAlertPct: n('PRICE_ALERT_PCT', 15), volumeSpikeX: n('VOLUME_SPIKE_X', 3), minVolumeDelta: n('MIN_VOLUME_DELTA_USD', 5000), volumeEstAlerts: env('VOLUME_EST_ALERTS', '1') !== '0',
    exchEnabled: env('EXCHANGE_ENABLED', '1') !== '0', exchangeBase: env('EXCHANGE_BASE', 'https://data-api.binance.vision'), exchQuote: env('EXCH_QUOTE', 'USDT'),
    maxExchTokens: n('MAX_EXCH_TOKENS', 120), exchLimit: n('EXCH_KLINES_LIMIT', 80), exchConcurrency: 4, vol10MinBuckets: n('VOL10_MIN_BUCKETS', 12), vol10MinUsd: n('VOL10_MIN_USD', 2000),
    unlockDays: n('UNLOCK_DAYS', 7), cooldownH: n('ALERT_COOLDOWN_H', 6), refreshMs: n('REFRESH_MIN', 10) * 60000,
    llamaCats: env('LLAMA_CATEGORIES', 'AI,DePIN,Compute').split(','), feeds: env('NEWS_FEEDS', '').split(',').map((s) => s.trim()).filter(Boolean),
    unlocksUrl: env('UNLOCKS_URL', ''), corsOrigin: env('CORS_ORIGIN', ''), dataDir: path.resolve(env('DATA_DIR', './data')),
  };
}
const emptyState = () => ({ lastRefresh: null, lastOk: null, health: {}, tokens: [], fundamentals: {}, news: [], unlocks: [], alerts: [], alertLog: {}, history: {}, vol10m: {}, exchStats: null });
function load(cfg) {
  try { return { ...emptyState(), ...JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'state.json'), 'utf8')) }; } catch { return emptyState(); }
}
function save(cfg, st) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const f = path.join(cfg.dataDir, 'state.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(st)); fs.renameSync(f + '.tmp', f);
}

// Tiap sumber gagal sendiri-sendiri: data lama dipertahankan, kesehatan sumber dicatat.
async function refresh(st, cfg, src) {
  const now = Date.now();
  const run = async (name, fn) => {
    try { const v = await fn(); st.health[name] = { ok: true, at: new Date().toISOString(), error: null }; return v; }
    catch (e) { st.health[name] = { ok: false, at: new Date().toISOString(), error: String(e.message || e).slice(0, 200) }; return null; }
  };
  const coins = await run('coingecko', () => src.fetchAiCoins(cfg));
  if (coins) { st.tokens = screen(coins, { ...cfg, now }); alerts.pushHistory(st.history, st.tokens, now); }
  if (coins && cfg.exchEnabled) {
    const ex = await run('exchange', () => src.fetchExchange(cfg, st.tokens, now));
    st.vol10m = ex ? ex.metrics : {}; st.exchStats = ex ? ex.stats : null; // gagal = hapus (jangan tampilkan data lama sebagai terkini)
  }
  const llama = await run('defillama', () => src.fetchLlama(cfg, categoryMatcher(cfg.llamaCats)));
  if (llama) st.fundamentals = joinFundamentals(st.tokens, llama.protocols, llama.fees, llama.revenue);
  const news = await run('news', () => (cfg.feeds.length ? src.fetchNews(cfg) : Promise.reject(new Error('NEWS_FEEDS kosong'))));
  if (news) st.news = news;
  const unl = await run('unlocks', () => src.fetchUnlocks(cfg));
  if (unl) st.unlocks = unl;
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
  save(cfg, st);
  return st;
}
module.exports = { loadConfig, load, save, refresh, emptyState };
