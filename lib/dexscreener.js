'use strict';

const BASE = 'https://api.dexscreener.com';
const CACHE_TTL_MS = 2 * 60 * 1000;
const SAFE_CHAIN = /^[a-z0-9-]{1,40}$/;
const SAFE_ADDRESS = /^[a-zA-Z0-9]{20,128}$/;

function upstreamError(status) {
  const error = new Error(status === 429 ? 'DEXSCREENER_RATE_LIMITED' : 'DEXSCREENER_UPSTREAM_ERROR');
  error.code = error.message;
  error.status = status === 429 ? 429 : 502;
  return error;
}

function createDexScreenerService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let cache = null;
  let inFlight = null;

  async function requestJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': 'RADAR-AI/2.4 (+https://github.com/rohman35819/radar-ai-v2)' },
        signal: controller.signal,
        redirect: 'error'
      });
      if (!response.ok) throw upstreamError(response.status);
      return await response.json();
    } catch (error) {
      if (error.code) throw error;
      const wrapped = new Error(error.name === 'AbortError' ? 'DEXSCREENER_TIMEOUT' : 'DEXSCREENER_NETWORK_ERROR');
      wrapped.code = wrapped.message;
      wrapped.status = 502;
      throw wrapped;
    } finally { clearTimeout(timer); }
  }

  function normalizeProfile(row, kind) {
    if (!row || typeof row.chainId !== 'string' || !SAFE_CHAIN.test(row.chainId)
      || typeof row.tokenAddress !== 'string' || !SAFE_ADDRESS.test(row.tokenAddress)) return null;
    return {
      chain_id: row.chainId,
      token_address: row.tokenAddress,
      dex_url: typeof row.url === 'string' && /^https:\/\/(www\.)?dexscreener\.com\//i.test(row.url) ? row.url : null,
      icon_url: typeof row.icon === 'string' && /^https:\/\//i.test(row.icon) ? row.icon : null,
      description: typeof row.description === 'string' ? row.description.slice(0, 240) : '',
      profile: kind === 'profile',
      boosted: kind === 'boost' || kind === 'top_boost',
      boost_amount: Number.isFinite(Number(row.amount)) ? Number(row.amount) : null
    };
  }

  function scorePair(pair) {
    const tx = pair?.txns?.h24 || {};
    const buys = Number(tx.buys), sells = Number(tx.sells);
    const volume = Number(pair?.volume?.h24);
    const liquidity = Number(pair?.liquidity?.usd);
    const change = Number(pair?.priceChange?.h24);
    const hasTx = Number.isFinite(buys) && Number.isFinite(sells) && buys + sells > 0;
    const hasVolume = Number.isFinite(volume) && volume >= 0;
    const hasLiquidity = Number.isFinite(liquidity) && liquidity > 0;
    const hasChange = Number.isFinite(change);
    const buyShare = hasTx ? buys / (buys + sells) : null;
    const turnover = hasVolume && hasLiquidity ? volume / liquidity : null;
    const parts = [];
    let score = 0;
    if (buyShare !== null) { score += Math.max(0, Math.min(1, buyShare)) * 35; parts.push('buy/sell activity'); }
    if (turnover !== null) { score += Math.max(0, Math.min(1, turnover)) * 25; parts.push('volume/liquidity'); }
    if (hasLiquidity) { score += Math.max(0, Math.min(1, liquidity / 100000)) * 20; parts.push('pool liquidity'); }
    if (hasChange) { score += Math.max(0, Math.min(1, (change + 20) / 40)) * 20; parts.push('24h price change'); }
    const signals = [];
    if (buyShare !== null && buyShare >= 0.55) signals.push('BUY_PRESSURE');
    if (turnover !== null && turnover >= 0.5) signals.push('HIGH_TURNOVER');
    if (hasChange && change > 0) signals.push('POSITIVE_24H');
    if (liquidity > 0 && liquidity < 10000) signals.push('LOW_LIQUIDITY');
    return {
      pair_address: typeof pair?.pairAddress === 'string' ? pair.pairAddress : null,
      dex_id: typeof pair?.dexId === 'string' ? pair.dexId : null,
      dex_url: typeof pair?.url === 'string' && /^https:\/\/(www\.)?dexscreener\.com\//i.test(pair.url) ? pair.url : null,
      token_name: pair?.baseToken?.name || null,
      token_symbol: pair?.baseToken?.symbol || null,
      price_usd: pair?.priceUsd == null || !Number.isFinite(Number(pair.priceUsd)) ? null : Number(pair.priceUsd),
      volume_24h_usd: hasVolume ? volume : null,
      liquidity_usd: hasLiquidity ? liquidity : null,
      buys_24h: Number.isFinite(buys) ? buys : null,
      sells_24h: Number.isFinite(sells) ? sells : null,
      buy_share_24h: buyShare,
      turnover_24h: turnover,
      price_change_24h_pct: hasChange ? change : null,
      market_cap_usd: Number.isFinite(Number(pair?.marketCap)) ? Number(pair.marketCap) : null,
      fdv_usd: Number.isFinite(Number(pair?.fdv)) ? Number(pair.fdv) : null,
      pair_created_at: Number.isFinite(Number(pair?.pairCreatedAt)) ? new Date(Number(pair.pairCreatedAt)).toISOString() : null,
      radar_activity_score: parts.length ? Math.round(score) : null,
      score_basis: parts,
      signals
    };
  }

  async function load() {
    if (cache && cache.expiresAt > now()) return { ...cache.payload, cached: true };
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const feeds = await Promise.allSettled([
        requestJson(BASE + '/token-profiles/latest/v1'),
        requestJson(BASE + '/token-boosts/latest/v1'),
        requestJson(BASE + '/token-boosts/top/v1')
      ]);
      const feedNames = ['profiles', 'boosts', 'top_boosts'];
      const sourceStatus = {};
      const byKey = new Map();
      feeds.forEach((result, index) => {
        const name = feedNames[index];
        if (result.status !== 'fulfilled' || !Array.isArray(result.value)) {
          sourceStatus[name] = { ok: false, error: result.status === 'rejected' ? (result.reason?.code || 'DEXSCREENER_UPSTREAM_ERROR') : 'DEXSCREENER_INVALID_RESPONSE' };
          return;
        }
        sourceStatus[name] = { ok: true, count: result.value.length };
        result.value.slice(0, 60).forEach((row) => {
          const kind = index === 0 ? 'profile' : index === 1 ? 'boost' : 'top_boost';
          const normalized = normalizeProfile(row, kind);
          if (!normalized) return;
          const key = normalized.chain_id + ':' + normalized.token_address.toLowerCase();
          const current = byKey.get(key) || { ...normalized, profile: false, boosted: false, boost_amount: null };
          current.profile ||= normalized.profile;
          current.boosted ||= normalized.boosted;
          if (normalized.boost_amount !== null) current.boost_amount = Math.max(current.boost_amount || 0, normalized.boost_amount);
          if (!current.dex_url && normalized.dex_url) current.dex_url = normalized.dex_url;
          byKey.set(key, current);
        });
      });

      const candidates = [...byKey.values()].slice(0, 120);
      const chainGroups = new Map();
      candidates.forEach((item) => {
        if (!chainGroups.has(item.chain_id)) chainGroups.set(item.chain_id, []);
        const group = chainGroups.get(item.chain_id);
        if (group.length < 30) group.push(item);
      });
      const selectedGroups = [...chainGroups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4);
      const pairResults = await Promise.allSettled(selectedGroups.map(([chain, rows]) => {
        const addresses = rows.map((row) => row.token_address).join(',');
        return requestJson(BASE + '/tokens/v1/' + encodeURIComponent(chain) + '/' + addresses);
      }));
      const pairsByToken = new Map();
      pairResults.forEach((result, index) => {
        const chain = selectedGroups[index][0];
        sourceStatus['pairs_' + chain] = result.status === 'fulfilled' && Array.isArray(result.value)
          ? { ok: true, count: result.value.length }
          : { ok: false, error: result.status === 'rejected' ? (result.reason?.code || 'DEXSCREENER_UPSTREAM_ERROR') : 'DEXSCREENER_INVALID_RESPONSE' };
        if (result.status !== 'fulfilled' || !Array.isArray(result.value)) return;
        result.value.forEach((pair) => {
          const address = pair?.baseToken?.address;
          if (typeof address !== 'string') return;
          const key = chain + ':' + address.toLowerCase();
          const current = pairsByToken.get(key);
          const liquidity = Number(pair?.liquidity?.usd) || 0;
          if (!current || liquidity > (Number(current?.liquidity?.usd) || 0)) pairsByToken.set(key, pair);
        });
      });

      const tokens = candidates.map((item) => {
        const pair = pairsByToken.get(item.chain_id + ':' + item.token_address.toLowerCase());
        return { ...item, ...(pair ? scorePair(pair) : { pair_address: null, dex_id: null, token_name: null, token_symbol: null,
          price_usd: null, volume_24h_usd: null, liquidity_usd: null, buys_24h: null, sells_24h: null, buy_share_24h: null,
          turnover_24h: null, price_change_24h_pct: null, market_cap_usd: null, fdv_usd: null, pair_created_at: null,
          radar_activity_score: null, score_basis: [], signals: [] }) };
      });
      tokens.sort((a, b) => (b.radar_activity_score ?? -1) - (a.radar_activity_score ?? -1));
      const ok = Object.values(sourceStatus).some((source) => source.ok);
      const payload = {
        status: ok ? 'success' : 'error',
        provider: 'DEX Screener',
        attribution: 'Powered by DEX Screener',
        updated_at: new Date(now()).toISOString(),
        cached: false,
        partial: Object.values(sourceStatus).some((source) => !source.ok),
        sources: sourceStatus,
        data: tokens.slice(0, 60)
      };
      cache = { payload, expiresAt: now() + CACHE_TTL_MS };
      return payload;
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  return { scanner: load, clearCache: () => { cache = null; } };
}

module.exports = { createDexScreenerService, scorePair, SAFE_CHAIN, SAFE_ADDRESS };
