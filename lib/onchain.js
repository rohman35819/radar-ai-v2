'use strict';

const BASE = 'https://api.coingecko.com/api/v3/onchain';
const MAX_PAGES = 10;
const PAGE_SIZE = 20;
const numberOrNull = (value, allowNegative = false) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && (allowNegative || number >= 0) ? number : null;
};
const relationId = (resource, name) => resource?.relationships?.[name]?.data?.id || null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizePool(pool, included, now = Date.now()) {
  if (!pool || pool.type !== 'pool' || !pool.attributes || typeof pool.id !== 'string') return null;
  const attrs = pool.attributes;
  const base = included.get(relationId(pool, 'base_token'))?.attributes || {};
  const network = included.get(relationId(pool, 'network'))?.attributes || {};
  const dex = included.get(relationId(pool, 'dex'))?.attributes || {};
  const networkId = relationId(pool, 'network') || pool.id.split('_')[0] || null;
  const address = String(attrs.address || pool.id.slice(networkId ? networkId.length + 1 : 0) || '');
  const createdAtMs = Date.parse(attrs.pool_created_at || '');
  const ageHours = Number.isFinite(createdAtMs) && createdAtMs <= now
    ? Math.max(0, (now - createdAtMs) / 3600000) : null;
  const volume = attrs.volume_usd && typeof attrs.volume_usd === 'object' ? attrs.volume_usd : {};
  const changes = attrs.price_change_percentage && typeof attrs.price_change_percentage === 'object'
    ? attrs.price_change_percentage : {};
  const txns = attrs.transactions && typeof attrs.transactions === 'object' ? attrs.transactions : {};
  const h24 = txns.h24 && typeof txns.h24 === 'object' ? txns.h24 : {};
  const buys24h = numberOrNull(h24.buys), sells24h = numberOrNull(h24.sells);
  const liquidityUsd = numberOrNull(attrs.reserve_in_usd);
  const volume24hUsd = numberOrNull(volume.h24);
  const marketCapUsd = numberOrNull(attrs.market_cap_usd);
  const fdvUsd = numberOrNull(attrs.fdv_usd);
  const tokenAddress = String(base.address || '');
  const flags = [];
  if (liquidityUsd === null) flags.push('liquidity_unknown');
  else if (liquidityUsd < 5000) flags.push('liquidity_low');
  if (volume24hUsd === null) flags.push('volume_unknown');
  else if (volume24hUsd < 1000) flags.push('volume_low');
  if (marketCapUsd === null) flags.push('market_cap_unverified');
  if (buys24h === null || sells24h === null) flags.push('trade_count_unknown');
  const safePath = (value) => /^[a-z0-9_-]{1,80}$/i.test(String(value || ''));
  const safeAddress = (value) => /^[a-z0-9._-]{1,180}$/i.test(String(value || ''));
  const poolUrl = safePath(networkId) && safeAddress(address)
    ? 'https://www.geckoterminal.com/' + networkId + '/pools/' + address : null;
  const tokenUrl = safePath(networkId) && safeAddress(tokenAddress)
    ? 'https://www.geckoterminal.com/' + networkId + '/tokens/' + tokenAddress : null;
  const symbol = String(base.symbol || '').trim().slice(0, 40);
  const name = String(base.name || '').trim().slice(0, 100);
  return {
    id: networkId + ':' + address.toLowerCase(),
    network_id: String(networkId || '').slice(0, 80),
    network: String(network.name || networkId || 'Unknown network').slice(0, 80),
    dex: String(dex.name || 'DEX').slice(0, 80),
    pool_address: address.slice(0, 180),
    pool_name: String(attrs.name || '').slice(0, 140),
    token_name: name || symbol || 'Unknown token',
    symbol: symbol || '—',
    token_address: tokenAddress.slice(0, 180),
    coingecko_id: typeof base.coingecko_coin_id === 'string' ? base.coingecko_coin_id.slice(0, 120) : null,
    price_usd: numberOrNull(attrs.base_token_price_usd),
    liquidity_usd: liquidityUsd,
    volume_24h_usd: volume24hUsd,
    market_cap_usd: marketCapUsd,
    fdv_usd: fdvUsd,
    price_change_24h_pct: numberOrNull(changes.h24, true),
    buys_24h: buys24h,
    sells_24h: sells24h,
    pool_created_at: Number.isFinite(createdAtMs) ? new Date(createdAtMs).toISOString() : null,
    age_hours: ageHours,
    discovery_type: 'new',
    discovery_label: ageHours === null ? 'POOL AGE UNKNOWN' : ageHours <= 24 ? 'NEW POOL' : 'RECENT POOL',
    risk_flags: flags,
    pool_url: poolUrl,
    token_url: tokenUrl,
  };
}

function normalizeNewPools(payload, now = Date.now()) {
  if (!payload || !Array.isArray(payload.data) || !Array.isArray(payload.included || [])) {
    const error = new Error('ONCHAIN_INVALID_RESPONSE');
    error.code = 'ONCHAIN_INVALID_RESPONSE';
    throw error;
  }
  const included = new Map((payload.included || []).filter((item) => item && typeof item.id === 'string').map((item) => [item.id, item]));
  const unique = new Map();
  for (const resource of payload.data) {
    const item = normalizePool(resource, included, now);
    if (item && item.id && item.pool_address) unique.set(item.id, item);
  }
  return [...unique.values()].map((item) => ({ ...item, discovery_type: 'new', discovery_label: 'NEW POOL' })).sort((a, b) => (Date.parse(b.pool_created_at || '') || 0) - (Date.parse(a.pool_created_at || '') || 0));
}

function normalizeTrendingPools(payload, now = Date.now()) {
  return normalizeNewPools(payload, now).map((item) => ({ ...item, discovery_type: 'trending', discovery_label: 'TRENDING' }));
}

async function fetchEarlyGems(cfg, request = getJson) {
  const pages = Math.max(1, Math.min(MAX_PAGES, Math.floor(Number(cfg.onchainPages) || 3)));
  const headers = cfg.cgKey ? { 'x-cg-demo-api-key': cfg.cgKey } : {};
  const all = [];
  let pagesFetched = 0;
  for (let page = 1; page <= pages; page++) {
    pagesFetched = page;
    const query = new URLSearchParams({ include: 'base_token,quote_token,dex,network', page: String(page) });
    const payload = await request(BASE + '/networks/new_pools?' + query.toString(), { headers, timeout: 20000 });
    if (!payload || !Array.isArray(payload.data)) {
      const error = new Error('ONCHAIN_INVALID_RESPONSE');
      error.code = 'ONCHAIN_INVALID_RESPONSE';
      throw error;
    }
    all.push(...normalizeNewPools(payload));
    if (payload.data.length < PAGE_SIZE) break;
    if (page < pages) await sleep(500);
  }
  let trendingItems = [], trendingError = null;
  try {
    const query = new URLSearchParams({ include: 'base_token,quote_token,dex,network', page: '1', duration: '24h' });
    const payload = await request(BASE + '/networks/trending_pools?' + query.toString(), { headers, timeout: 20000 });
    trendingItems = normalizeTrendingPools(payload);
  } catch (error) {
    trendingError = error && /^[A-Z0-9_]+$/.test(String(error.code || '')) ? error.code : 'ONCHAIN_TRENDING_UNAVAILABLE';
  }
  const merged = new Map(all.map((item) => [item.id, { ...item, is_trending: false }]));
  for (const item of trendingItems) {
    const existing = merged.get(item.id);
    if (existing) {
      existing.is_trending = true;
      existing.discovery_tags = [...new Set([existing.discovery_label, 'TRENDING'])];
    } else merged.set(item.id, { ...item, is_trending: true, discovery_tags: ['TRENDING'] });
  }
  const items = [...merged.values()].sort((a, b) => (Date.parse(b.pool_created_at || '') || 0) - (Date.parse(a.pool_created_at || '') || 0));
  return { items, fetched_at: new Date().toISOString(), pages_requested: pagesFetched, pool_count: items.length,
    new_pool_count: all.length, trending_pool_count: trendingItems.length, trending_error: trendingError,
    coverage_hours: 48, source: 'CoinGecko Onchain / GeckoTerminal' };
}

async function getJson(url, { headers = {}, timeout = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: controller.signal });
    if (!response.ok) {
      const error = new Error('ONCHAIN_HTTP_' + response.status);
      error.code = response.status === 429 ? 'ONCHAIN_RATE_LIMITED' : 'ONCHAIN_HTTP_' + response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error.code) throw error;
    const wrapped = new Error(error.name === 'AbortError' ? 'ONCHAIN_TIMEOUT' : 'ONCHAIN_NETWORK_ERROR');
    wrapped.code = error.name === 'AbortError' ? 'ONCHAIN_TIMEOUT' : 'ONCHAIN_NETWORK_ERROR';
    throw wrapped;
  } finally { clearTimeout(timer); }
}

module.exports = { normalizePool, normalizeNewPools, normalizeTrendingPools, fetchEarlyGems };
