'use strict';

const BASE = 'https://api.coingecko.com/api/v3';
const MARKET_TTL_MS = 60 * 60 * 1000;
const CHART_TTL_MS = 60 * 60 * 1000;
const SAFE_COIN_ID = /^[a-z0-9-]{1,80}$/;

function providerError(status) {
  if (status === 429) return 'COINGECKO_RATE_LIMITED';
  if (status === 401 || status === 403) return 'COINGECKO_AUTH_REJECTED';
  if (status === 404) return 'COINGECKO_NOT_FOUND';
  return 'COINGECKO_UPSTREAM_ERROR';
}

function createMarketIntelligenceService({ apiKey = '', fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();

  async function requestJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json', ...(apiKey ? { 'x-cg-demo-api-key': apiKey } : {}) },
        signal: controller.signal,
        redirect: 'error'
      });
      if (!response.ok) {
        const error = new Error(providerError(response.status));
        error.code = providerError(response.status);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (error.code) throw error;
      const wrapped = new Error(error.name === 'AbortError' ? 'COINGECKO_TIMEOUT' : 'COINGECKO_NETWORK_ERROR');
      wrapped.code = wrapped.message;
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  }

  async function cached(key, url, ttl) {
    const current = cache.get(key);
    const timestamp = now();
    if (current?.data !== undefined && current.expiresAt > timestamp) {
      return { data: current.data, updated_at: current.updatedAt, stale: Boolean(current.stale), cached: true, error: current.error || null };
    }
    if (current?.error && current.expiresAt > timestamp) {
      const error = new Error(current.error);
      error.code = current.error;
      error.status = current.status;
      throw error;
    }
    if (current?.promise) return current.promise;
    const previous = current?.data;
    const promise = requestJson(url).then((data) => {
      const entry = { data, updatedAt: new Date(now()).toISOString(), expiresAt: now() + ttl, promise: null, stale: false, error: null };
      cache.set(key, entry);
      return { data, updated_at: entry.updatedAt, stale: false, cached: false, error: null };
    }).catch((error) => {
      if (previous !== undefined) {
        cache.set(key, { data: previous, updatedAt: current.updatedAt, expiresAt: now() + 60000, promise: null, stale: true, error: error.code || 'COINGECKO_UPSTREAM_ERROR' });
        return { data: previous, updated_at: current.updatedAt, stale: true, cached: true, error: error.code || 'COINGECKO_UPSTREAM_ERROR' };
      }
      cache.set(key, { error: error.code || 'COINGECKO_UPSTREAM_ERROR', status: error.status || null, expiresAt: now() + 5 * 60 * 1000, promise: null });
      throw error;
    });
    cache.set(key, { ...(current || {}), promise });
    return promise;
  }

  const url = (path, params = {}) => {
    const query = new URLSearchParams(params);
    return BASE + path + (query.size ? '?' + query.toString() : '');
  };

  async function dashboard() {
    const requests = {
      global: url('/global'),
      markets: url('/coins/markets', { vs_currency: 'usd', order: 'market_cap_desc', per_page: '100', page: '1', sparkline: 'false', price_change_percentage: '1h,24h,7d,30d' }),
      markets_idr: url('/coins/markets', { vs_currency: 'idr', order: 'market_cap_desc', per_page: '100', page: '1', sparkline: 'false' }),
      trending: url('/search/trending'),
      categories: url('/coins/categories', { order: 'market_cap_desc' }),
      exchanges: url('/exchanges', { per_page: '100', page: '1' })
    };
    const names = Object.keys(requests);
    const results = await Promise.allSettled(names.map((name) => cached(name, requests[name], MARKET_TTL_MS)));
    const payload = { status: 'success', provider: 'CoinGecko', powered_by: 'CoinGecko', api_key_configured: Boolean(apiKey), updated_at: null, data: {}, sources: {} };
    results.forEach((result, index) => {
      const name = names[index];
      if (result.status === 'fulfilled') {
        const item = result.value;
        payload.data[name] = item.data;
        payload.sources[name] = { ok: !item.stale, stale: item.stale, cached: item.cached, updated_at: item.updated_at, error: item.error };
      } else {
        payload.data[name] = null;
        payload.sources[name] = { ok: false, stale: false, cached: false, updated_at: null, error: result.reason?.code || 'COINGECKO_UPSTREAM_ERROR' };
      }
    });
    const timestamps = Object.values(payload.sources).map((source) => source.updated_at).filter(Boolean).sort();
    payload.updated_at = timestamps[0] || null;
    payload.status = Object.values(payload.sources).some((source) => source.ok) ? 'success' : 'error';
    payload.partial = Object.values(payload.sources).some((source) => !source.ok);
    return payload;
  }

  async function exchangeTickers(exchangeId) {
    const id = String(exchangeId || '').toLowerCase();
    if (!SAFE_COIN_ID.test(id)) {
      const error = new Error('INVALID_EXCHANGE_ID');
      error.code = 'INVALID_EXCHANGE_ID';
      error.status = 400;
      throw error;
    }
    const result = await cached('exchange-tickers:' + id,
      url('/exchanges/' + encodeURIComponent(id) + '/tickers', { order: 'volume_desc', page: '1' }), MARKET_TTL_MS);
    return { status: 'success', exchange_id: id, ...result };
  }

  async function chart(coinId, days = '7') {
    const id = String(coinId || '').toLowerCase();
    const period = String(days);
    if (!SAFE_COIN_ID.test(id)) {
      const error = new Error('INVALID_COIN_ID');
      error.code = 'INVALID_COIN_ID';
      error.status = 400;
      throw error;
    }
    if (!['1', '7', '30', '90'].includes(period)) {
      const error = new Error('INVALID_CHART_RANGE');
      error.code = 'INVALID_CHART_RANGE';
      error.status = 400;
      throw error;
    }
    const data = await cached('chart:' + id + ':' + period,
      url('/coins/' + encodeURIComponent(id) + '/market_chart', { vs_currency: 'usd', days: period }), CHART_TTL_MS);
    return { status: 'success', coin_id: id, days: Number(period), ...data };
  }

  return { dashboard, chart, exchangeTickers, clearCache: () => cache.clear() };
}

module.exports = { createMarketIntelligenceService, providerError, SAFE_COIN_ID };
