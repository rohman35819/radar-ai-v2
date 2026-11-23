'use strict';

const BASE = 'https://fapi.binance.com';
const TTL_MS = 5 * 60 * 1000;
const SYMBOL_RE = /^[A-Z0-9]{2,20}USDT$/;

function createDerivativesService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
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
    const existing = cache.get(symbol);
    if (existing && existing.expiresAt > now()) return { ...existing.payload, cached: true };
    if (existing?.promise) return existing.promise;

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
        if (result.status === 'fulfilled') {
          data[name] = result.value;
          sources[name] = { ok: true, error: null };
        } else {
          data[name] = null;
          sources[name] = { ok: false, error: result.reason?.code || 'UPSTREAM_ERROR' };
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
      cache.set(symbol, { payload, expiresAt: now() + TTL_MS, promise: null });
      return payload;
    }).catch((error) => {
      cache.delete(symbol);
      throw error;
    });
    cache.set(symbol, { promise, expiresAt: now() + TTL_MS });
    return promise;
  }

  return { snapshot, clearCache: () => cache.clear() };
}

module.exports = { createDerivativesService, SYMBOL_RE, TTL_MS };
