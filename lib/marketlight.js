'use strict';

const BASE_URL = 'https://marketlight.ai';
const SUPPORTED_BASES = new Set(['BTC','ETH','SOL','XRP','DOGE','BNB','ADA','LINK','AVAX','SUI','LTC','TRX','DOT','HYPE','PEPE','WIF','AAVE','NEAR','APT','ZEC','WLD','ENA','ARB','OP']);
const SUPPORTED_HOURS = new Set([1,4,12,24]);
const CACHE_TTLS = { derivatives: 5 * 60 * 1000, liquidations: 60 * 1000, fear_greed: 5 * 60 * 1000 };
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const MIN_BATCH_INTERVAL_MS = 20 * 1000;

const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

function createMarketlightService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  const inFlight = new Map();
  let lastBatchAt = 0;

  function fail(code, status = 502) {
    const error = new Error(code);
    error.code = code;
    error.status = status;
    return error;
  }

  async function requestJson(path, params) {
    const url = BASE_URL + path + '?' + new URLSearchParams(params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error'
      });
      if (!response.ok) throw fail(response.status === 429 ? 'MARKETLIGHT_RATE_LIMITED' : 'MARKETLIGHT_HTTP_' + response.status, response.status);
      const declaredSize = Number(response.headers?.get?.('content-length') || 0);
      if (declaredSize > MAX_RESPONSE_BYTES) throw fail('MARKETLIGHT_RESPONSE_TOO_LARGE', 502);
      const raw = await response.text();
      if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw fail('MARKETLIGHT_RESPONSE_TOO_LARGE', 502);
      try { return JSON.parse(raw); } catch { throw fail('MARKETLIGHT_INVALID_JSON', 502); }
    } catch (error) {
      if (error.code) throw error;
      throw fail(error.name === 'AbortError' ? 'MARKETLIGHT_TIMEOUT' : 'MARKETLIGHT_NETWORK_ERROR', 502);
    } finally {
      clearTimeout(timer);
    }
  }

  function valid(name, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (name === 'derivatives') return value.oi && typeof value.oi === 'object' && value.funding && typeof value.funding === 'object' && finite(value.updatedMs);
    if (name === 'liquidations') return value.total && finite(value.total.long) && finite(value.total.short) && value.byExchange && typeof value.byExchange === 'object';
    return finite(value.value) && Number(value.value) >= 0 && Number(value.value) <= 100 && value.updatedAt != null;
  }

  async function read(name, path, params) {
    const key = name + ':' + (params.base || params.hours || 'global');
    const current = cache.get(key);
    const stamp = now();
    if (current?.data !== undefined && current.expiresAt > stamp) return { data: current.data, updated_at: current.updated_at, stale: false, cached: true, error: null };
    if (current?.error && current.expiresAt > stamp) throw fail(current.error, current.status || 502);
    if (current?.promise) return current.promise;
    const previous = current?.data;
    const promise = requestJson(path, params).then((data) => {
      if (!valid(name, data)) throw fail('MARKETLIGHT_INVALID_RESPONSE', 502);
      const updatedAt = name === 'derivatives' ? Number(data.updatedMs) : name === 'liquidations' ? Number(data.toMs) : Date.parse(data.updatedAt);
      const entry = { data, updated_at: Number.isFinite(updatedAt) ? new Date(updatedAt).toISOString() : new Date(stamp).toISOString(), expiresAt: now() + CACHE_TTLS[name], promise: null };
      cache.set(key, entry);
      return { data, updated_at: entry.updated_at, stale: false, cached: false, error: null };
    }).catch((error) => {
      if (previous !== undefined) {
        cache.set(key, { ...current, expiresAt: now() + 30 * 1000, promise: null });
        return { data: previous, updated_at: current.updated_at, stale: true, cached: true, error: error.code || 'MARKETLIGHT_UPSTREAM_ERROR' };
      }
      cache.set(key, { error: error.code || 'MARKETLIGHT_UPSTREAM_ERROR', status: error.status || 502, expiresAt: now() + 30 * 1000, promise: null });
      throw error;
    });
    cache.set(key, { ...(current || {}), promise });
    return promise;
  }

  async function snapshot(rawBase = 'BTC', rawHours = 24) {
    const base = String(rawBase || 'BTC').trim().toUpperCase();
    const hours = Number(rawHours);
    if (!SUPPORTED_BASES.has(base)) throw fail('MARKETLIGHT_UNSUPPORTED_BASE', 400);
    if (!SUPPORTED_HOURS.has(hours)) throw fail('MARKETLIGHT_INVALID_HOURS', 400);
    const key = base + ':' + hours;
    if (inFlight.has(key)) return inFlight.get(key);

    const batch = async () => {
      const stamp = now();
      const needRequest = ['derivatives:' + base, 'liquidations:' + hours, 'fear_greed:global'].some((cacheKey) => !cache.get(cacheKey)?.data || cache.get(cacheKey).expiresAt <= stamp);
      if (needRequest && lastBatchAt && stamp - lastBatchAt < MIN_BATCH_INTERVAL_MS) {
        const error = fail('MARKETLIGHT_LOCAL_COOLDOWN', 429);
        const stale = {};
        for (const cacheKey of ['derivatives:' + base, 'liquidations:' + hours, 'fear_greed:global']) {
          const entry = cache.get(cacheKey);
          if (entry?.data !== undefined) stale[cacheKey] = { data: entry.data, updated_at: entry.updated_at, stale: true, cached: true, error: error.code };
        }
        if (!Object.keys(stale).length) throw error;
        return stale;
      }
      if (needRequest) lastBatchAt = stamp;
      const specs = [
        ['derivatives', '/api/public/derivatives', { base }],
        ['liquidations', '/bt/api/public/liquidations/summary', { hours: String(hours) }],
        ['fear_greed', '/api/public/fear-greed', {}]
      ];
      const results = await Promise.allSettled(specs.map(([name, path, params]) => read(name, path, params)));
      const out = {};
      results.forEach((result, index) => {
        const [name] = specs[index];
        const cacheKey = name + ':' + (name === 'derivatives' ? base : name === 'liquidations' ? hours : 'global');
        if (result.status === 'fulfilled') out[cacheKey] = result.value;
        else out[cacheKey] = { data: null, updated_at: null, stale: false, cached: false, error: result.reason?.code || 'MARKETLIGHT_UPSTREAM_ERROR' };
      });
      return out;
    };

    const promise = batch().then((items) => {
      const names = ['derivatives:' + base, 'liquidations:' + hours, 'fear_greed:global'];
      const data = {};
      const sources = {};
      names.forEach((name) => {
        const item = items[name] || { data: null, updated_at: null, stale: false, cached: false, error: 'MARKETLIGHT_UNAVAILABLE' };
        data[name.split(':')[0]] = item.data;
        sources[name.split(':')[0]] = { ok: item.data !== null && item.data !== undefined && !item.stale, stale: Boolean(item.stale), cached: Boolean(item.cached), updated_at: item.updated_at, error: item.error || null };
      });
      const ok = Object.values(sources).filter((source) => source.ok).length;
      return {
        status: ok ? 'success' : 'error',
        provider: 'Marketlight public derivatives API',
        license: 'CC BY 4.0',
        attribution: { text: 'Data: Marketlight (marketlight.ai), CC BY 4.0', url: 'https://marketlight.ai' },
        base,
        liquidation_hours: hours,
        observed_at: new Date(now()).toISOString(),
        partial: ok > 0 && ok < names.length,
        data,
        sources,
        cached: Object.values(sources).every((source) => source.cached)
      };
    }).finally(() => { if (inFlight.get(key) === promise) inFlight.delete(key); });
    inFlight.set(key, promise);
    return promise;
  }

  return { snapshot, clearCache: () => { cache.clear(); inFlight.clear(); lastBatchAt = 0; } };
}

module.exports = { createMarketlightService, SUPPORTED_BASES, SUPPORTED_HOURS, CACHE_TTLS, MAX_RESPONSE_BYTES, MIN_BATCH_INTERVAL_MS };
