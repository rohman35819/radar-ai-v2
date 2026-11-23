'use strict';

const BASE = 'https://api.dexscreener.com';
const TTL_MS = 2 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const MAX_INFLIGHT = 50;
const NETWORKS = Object.freeze({
  solana: 'solana', eth: 'ethereum', ethereum: 'ethereum', bsc: 'bsc',
  polygon_pos: 'polygon', polygon: 'polygon', base: 'base', arbitrum: 'arbitrum',
  optimism: 'optimism', avax: 'avalanche', avalanche: 'avalanche', ftm: 'fantom',
  fantom: 'fantom'
});
const EVM_CHAINS = new Set(['ethereum', 'bsc', 'polygon', 'base', 'arbitrum', 'optimism', 'avalanche', 'fantom']);
const numberOrNull = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
function providerError(code, status = 502) { const error = new Error(code); error.code = code; error.status = status; return error; }
function validAddress(chainId, address) {
  if (EVM_CHAINS.has(chainId)) return /^0x[a-fA-F0-9]{40}$/.test(address);
  if (chainId === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  return false;
}
function sameAddress(chainId, a, b) { return EVM_CHAINS.has(chainId) ? String(a).toLowerCase() === String(b).toLowerCase() : String(a) === String(b); }
function safePairUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && ['dexscreener.com', 'www.dexscreener.com'].includes(u.hostname) ? u.toString() : null; }
  catch { return null; }
}
function normalizePair(pair, chainId, tokenAddress, poolAddress) {
  const base = pair.baseToken || {}, quote = pair.quoteToken || {};
  const tokenSide = sameAddress(chainId, base.address || '', tokenAddress) ? 'base'
    : sameAddress(chainId, quote.address || '', tokenAddress) ? 'quote' : null;
  if (!tokenSide) return null;
  const tx = pair.txns?.h24 || {};
  return {
    chain_id: chainId,
    dex_id: String(pair.dexId || '').slice(0, 80) || null,
    pair_address: String(pair.pairAddress || '').slice(0, 180) || null,
    pair_url: safePairUrl(pair.url),
    token_side: tokenSide,
    base_token: { address: String(base.address || '').slice(0, 180), name: String(base.name || '').slice(0, 100), symbol: String(base.symbol || '').slice(0, 40) },
    quote_token: { address: String(quote.address || '').slice(0, 180), name: String(quote.name || '').slice(0, 100), symbol: String(quote.symbol || '').slice(0, 40) },
    price_usd: tokenSide === 'base' ? numberOrNull(pair.priceUsd) : null,
    liquidity_usd: numberOrNull(pair.liquidity?.usd),
    volume_24h_usd: numberOrNull(pair.volume?.h24),
    price_change_24h_pct: tokenSide === 'base' ? numberOrNull(pair.priceChange?.h24) : null,
    buys_24h: numberOrNull(tx.buys),
    sells_24h: numberOrNull(tx.sells),
    fdv_usd: tokenSide === 'base' ? numberOrNull(pair.fdv) : null,
    market_cap_usd: tokenSide === 'base' ? numberOrNull(pair.marketCap) : null,
    pair_created_at: numberOrNull(pair.pairCreatedAt),
    same_pool: Boolean(poolAddress && pair.pairAddress && sameAddress(chainId, pair.pairAddress, poolAddress))
  };
}
function createDexScreenerService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map(), inFlight = new Map();
  async function request(url) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw providerError(response.status === 429 ? 'DEXSCREENER_RATE_LIMITED' : 'DEXSCREENER_HTTP_' + response.status, response.status === 429 ? 429 : 502);
      return await response.json();
    } catch (error) {
      if (error.code) throw error;
      throw providerError(error.name === 'AbortError' ? 'DEXSCREENER_TIMEOUT' : 'DEXSCREENER_NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  function remember(key, payload) {
    cache.delete(key); cache.set(key, { payload, expiresAt: now() + TTL_MS });
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  }
  async function validate({ networkId, tokenAddress, poolAddress = null } = {}) {
    const network = String(networkId || '').trim().toLowerCase(), chainId = NETWORKS[network];
    if (!chainId) throw providerError('DEXSCREENER_UNSUPPORTED_NETWORK', 400);
    const address = String(tokenAddress || '').trim();
    if (!validAddress(chainId, address)) throw providerError('DEXSCREENER_INVALID_TOKEN_ADDRESS', 400);
    const key = chainId + ':' + (EVM_CHAINS.has(chainId) ? address.toLowerCase() : address);
    if (inFlight.has(key)) return inFlight.get(key);
    const existing = cache.get(key);
    if (existing && existing.expiresAt > now()) {
      cache.delete(key); cache.set(key, existing);
      return { ...existing.payload, cached: true };
    }
    if (existing) cache.delete(key);
    if (inFlight.size >= MAX_INFLIGHT) throw providerError('DEXSCREENER_BUSY', 503);
    const url = BASE + '/token-pairs/v1/' + encodeURIComponent(chainId) + '/' + encodeURIComponent(address);
    const work = request(url).then((payload) => {
      if (!Array.isArray(payload)) throw providerError('DEXSCREENER_INVALID_RESPONSE');
      const pairs = payload.map((pair) => pair && pair.chainId === chainId ? normalizePair(pair, chainId, address, poolAddress) : null)
        .filter(Boolean).sort((a, b) => (b.liquidity_usd ?? -1) - (a.liquidity_usd ?? -1));
      const result = {
        status: 'success', provider: 'DEX Screener API', network_id: network, chain_id: chainId,
        token_address: address, observed_at: new Date(now()).toISOString(), pair_count: pairs.length,
        same_pool_found: pairs.some((pair) => pair.same_pool), pairs: pairs.slice(0, 5), cached: false
      };
      remember(key, result);
      return result;
    }).finally(() => { if (inFlight.get(key) === tracked) inFlight.delete(key); });
    const tracked = work;
    inFlight.set(key, tracked);
    return tracked;
  }
  return { validate, clearCache: () => cache.clear() };
}
module.exports = { createDexScreenerService, NETWORKS, TTL_MS, MAX_CACHE_ENTRIES, MAX_INFLIGHT, validAddress, normalizePair };
