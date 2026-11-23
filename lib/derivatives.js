'use strict';

const BASE = 'https://fapi.binance.com';
const TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const MAX_INFLIGHT = 50;
const SYMBOL_RE = /^[A-Z0-9]{2,20}USDT$/;

function createDerivativesService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  const inFlight = new Map();
  const validRecord = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && fields.some((field) => value[field] !== null && value[field] !== undefined && value[field] !== '' && Number.isFinite(Number(value[field])));
  const validPayload = (name, value) => name === 'funding' ? validRecord(value, ['lastFundingRate', 'markPrice'])
    : name === 'open_interest' ? validRecord(value, ['openInterest'])
      : Array.isArray(value);
  function remember(symbol, payload) {
    cache.delete(symbol);
    cache.set(symbol, { payload, expiresAt: now() + TTL_MS });
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  }
  async function request(path, params) {
    const url = BASE + path + '?' + new URLSearchParams(params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal, redirect: 'error' });
      if (!response.ok) {
        const error = new Error(response.status === 429 ? 'BINANCE_FUTURES_RATE_LIMITED' : 'BINANCE_FUTURES_HTTP_' + response.status);
        error.code = error.message;
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (error.code) throw error;
      const wrapped = new Error(error.name === 'AbortError' ? 'BINANCE_FUTURES_TIMEOUT' : 'BINANCE_FUTURES_NETWORK_ERROR');
      wrapped.code = wrapped.message;
      throw wrapped;
    } finally { clearTimeout(timer); }
  }

  async function snapshot(rawSymbol) {
    const symbol = String(rawSymbol || '').trim().toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      const error = new Error('INVALID_FUTURES_SYMBOL');
      error.code = error.message;
      error.status = 400;
      throw error;
    }
    const active = inFlight.get(symbol);
    if (active) return active;
    const existing = cache.get(symbol);
    if (existing?.payload && existing.expiresAt > now()) {
      cache.delete(symbol);
      cache.set(symbol, existing);
      return { ...existing.payload, cached: true };
    }
    if (existing) cache.delete(symbol);
    if (inFlight.size >= MAX_INFLIGHT) { const error = new Error('BINANCE_FUTURES_BUSY'); error.code = error.message; error.status = 503; throw error; }

    const promise = Promise.allSettled([
      request('/fapi/v1/premiumIndex', { symbol }),
      request('/fapi/v1/openInterest', { symbol }),
      request('/futures/data/openInterestHist', { symbol, period: '5m', limit: '12' }),
      request('/futures/data/takerlongshortRatio', { symbol, period: '5m', limit: '12' })
    ]).then((results) => {
      const names = ['funding', 'open_interest', 'open_interest_history', 'taker_flow'];
      const data = {};
      const sources = {};
      results.forEach((result, index) => {
        const name = names[index];
        if (result.status === 'fulfilled' && validPayload(name, result.value)) {
          data[name] = result.value;
          sources[name] = { ok: true, error: null };
        } else {
          data[name] = null;
          sources[name] = { ok: false, error: result.status === 'fulfilled' ? 'BINANCE_FUTURES_INVALID_RESPONSE' : result.reason?.code || 'UPSTREAM_ERROR' };
        }
      });
      const successCount = Object.values(sources).filter((source) => source.ok).length;
      const payload = {
        status: successCount ? 'success' : 'error',
        symbol,
        provider: 'Binance USDⓈ-M Futures public market data',
        observed_at: new Date(now()).toISOString(),
        partial: successCount > 0 && successCount < names.length,
        data,
        sources,
        cached: false
      };
      if (successCount) remember(symbol, payload);
      return payload;
    }).catch((error) => {
      cache.delete(symbol);
      throw error;
    });
    const tracked = promise.finally(() => { if (inFlight.get(symbol) === tracked) inFlight.delete(symbol); });
    inFlight.set(symbol, tracked);
    return tracked;
  }

  return { snapshot, clearCache: () => cache.clear() };
}

module.exports = { createDerivativesService, SYMBOL_RE, TTL_MS, MAX_CACHE_ENTRIES, MAX_INFLIGHT };
