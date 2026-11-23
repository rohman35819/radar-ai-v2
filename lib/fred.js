'use strict';

const BASE = 'https://api.stlouisfed.org/fred/series/observations';
const TTL_MS = 30 * 60 * 1000;
const ERROR_COOLDOWN_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 10000;
const MAX_INFLIGHT = 8;

const SERIES = Object.freeze([
  { id: 'FEDFUNDS', title: 'Federal Funds Effective Rate', group: 'Interest rates', units: 'Percent', frequency: 'Monthly' },
  { id: 'SOFR', title: 'Secured Overnight Financing Rate', group: 'Interest rates', units: 'Percent', frequency: 'Daily' },
  { id: 'DGS10', title: '10-Year Treasury Constant Maturity Rate', group: 'Treasury yields', units: 'Percent', frequency: 'Daily' },
  { id: 'DGS2', title: '2-Year Treasury Constant Maturity Rate', group: 'Treasury yields', units: 'Percent', frequency: 'Daily' },
  { id: 'T10Y2Y', title: '10-Year Treasury Minus 2-Year Treasury', group: 'Yield curve', units: 'Percentage points', frequency: 'Daily' },
  { id: 'CPIAUCSL', title: 'Consumer Price Index for All Urban Consumers', group: 'Inflation', units: 'Index 1982-84=100', frequency: 'Monthly' },
  { id: 'UNRATE', title: 'Civilian Unemployment Rate', group: 'Employment', units: 'Percent', frequency: 'Monthly' },
  { id: 'M2SL', title: 'M2 Money Stock', group: 'Money supply', units: 'Billions of US dollars', frequency: 'Monthly' }
]);

function codedError(code, status = 502) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function createFredService({ apiKey = '', fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const key = String(apiKey || '').trim();
  const cache = new Map();
  const cooldowns = new Map();
  const inFlight = new Map();
  let snapshotFlight = null;

  async function requestSeries(definition) {
    const url = new URL(BASE);
    url.searchParams.set('series_id', definition.id);
    url.searchParams.set('api_key', key);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('limit', '12');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(url.toString(), {
        headers: { accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error'
      });
      if (!response.ok) {
        if (response.status === 429) throw codedError('FRED_RATE_LIMITED', 429);
        throw codedError('FRED_UPSTREAM_HTTP_' + response.status, 502);
      }
      const payload = await response.json();
      if (payload && payload.error_code) throw codedError('FRED_API_ERROR', 502);
      if (!payload || !Array.isArray(payload.observations)) throw codedError('FRED_INVALID_RESPONSE', 502);

      const observations = payload.observations.map((item) => {
        const date = String(item?.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
        if (item.value === '.' || item.value === null || item.value === undefined || item.value === '') {
          return { date, value: null };
        }
        const value = Number(item.value);
        return Number.isFinite(value) ? { date, value } : null;
      }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

      return {
        ...definition,
        observations,
        latest: observations.length ? observations[observations.length - 1] : null,
        fetched_at: new Date(now()).toISOString(),
        cached: false,
        stale: false
      };
    } catch (error) {
      if (error.code) throw error;
      throw codedError(error.name === 'AbortError' ? 'FRED_TIMEOUT' : 'FRED_NETWORK_ERROR', 502);
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadSeries(definition) {
    const cached = cache.get(definition.id);
    if (cached && cached.expiresAt > now()) {
      return { ...cached.value, cached: true };
    }
    const cooldownUntil = cooldowns.get(definition.id) || 0;
    if (cooldownUntil > now()) {
      if (cached) return { ...cached.value, cached: true, stale: true, error: 'FRED_UPSTREAM_COOLDOWN' };
      throw codedError('FRED_UPSTREAM_COOLDOWN', 503);
    }
    if (inFlight.has(definition.id)) return inFlight.get(definition.id);
    if (inFlight.size >= MAX_INFLIGHT) throw codedError('FRED_BUSY', 503);

    const promise = requestSeries(definition).then((value) => {
      cache.set(definition.id, { value, expiresAt: now() + TTL_MS });
      cooldowns.delete(definition.id);
      return value;
    }).catch((error) => {
      cooldowns.set(definition.id, now() + ERROR_COOLDOWN_MS);
      if (cached) return { ...cached.value, cached: true, stale: true, error: error.code || 'FRED_UPSTREAM_ERROR' };
      throw error;
    }).finally(() => {
      inFlight.delete(definition.id);
    });
    inFlight.set(definition.id, promise);
    return promise;
  }

  async function snapshot() {
    if (!key) {
      return {
        status: 'unconfigured',
        configured: false,
        provider: 'Federal Reserve Bank of St. Louis FRED API',
        observed_at: new Date(now()).toISOString(),
        series: [],
        sources: Object.fromEntries(SERIES.map((item) => [item.id, { ok: false, error: 'FRED_API_KEY_NOT_CONFIGURED' }]))
      };
    }
    if (snapshotFlight) return snapshotFlight;
    snapshotFlight = Promise.all(SERIES.map(async (definition) => {
      try {
        const data = await loadSeries(definition);
        return { data, source: { ok: !data.error, stale: Boolean(data.stale), error: data.error || null } };
      } catch (error) {
        return {
          data: { ...definition, observations: [], latest: null, fetched_at: null, cached: false, stale: false },
          source: { ok: false, stale: false, error: error.code || 'FRED_UPSTREAM_ERROR' }
        };
      }
    })).then((results) => {
      const series = results.map((item) => item.data);
      const sources = Object.fromEntries(results.map((item) => [item.data.id, item.source]));
      const okCount = Object.values(sources).filter((item) => item.ok).length;
      return {
        status: okCount ? 'success' : 'error',
        configured: true,
        provider: 'Federal Reserve Bank of St. Louis FRED API',
        observed_at: new Date(now()).toISOString(),
        partial: okCount > 0 && okCount < SERIES.length,
        series,
        sources,
        cached: series.every((item) => item.cached)
      };
    }).finally(() => {
      snapshotFlight = null;
    });
    return snapshotFlight;
  }

  return { snapshot, configured: () => Boolean(key), clearCache: () => { cache.clear(); cooldowns.clear(); } };
}

module.exports = { createFredService, SERIES, TTL_MS, ERROR_COOLDOWN_MS, TIMEOUT_MS, MAX_INFLIGHT };
