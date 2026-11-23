'use strict';

const BLS_URL = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
const NYFED_BASE = 'https://markets.newyorkfed.org/api/rates';
const BLS_TTL_MS = 12 * 60 * 60 * 1000;
const NYFED_TTL_MS = 60 * 60 * 1000;
const ERROR_COOLDOWN_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 10000;

const BLS_SERIES = Object.freeze([
  { id: 'CUSR0000SA0', title: 'Consumer Price Index (all items)', group: 'Inflation', units: 'Index 1982-84=100', frequency: 'Monthly', source: 'BLS' },
  { id: 'LNS14000000', title: 'Unemployment Rate', group: 'Employment', units: 'Percent', frequency: 'Monthly', source: 'BLS' },
  { id: 'CES0000000001', title: 'Total Nonfarm Payroll Employment', group: 'Employment', units: 'Thousands of jobs', frequency: 'Monthly', source: 'BLS' },
  { id: 'CES0500000003', title: 'Average Hourly Earnings (private sector)', group: 'Wages', units: 'US dollars per hour', frequency: 'Monthly', source: 'BLS' }
]);

const NYFED_SERIES = Object.freeze([
  { id: 'SOFR', title: 'Secured Overnight Financing Rate', group: 'Funding rates', units: 'Percent', frequency: 'Daily', source: 'New York Fed', endpoint: '/secured/sofr/last/12.json' },
  { id: 'EFFR', title: 'Effective Federal Funds Rate', group: 'Policy rates', units: 'Percent', frequency: 'Daily', source: 'New York Fed', endpoint: '/unsecured/effr/last/12.json' }
]);

function codedError(code, status = 502) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function parseBls(payload) {
  if (!payload || payload.status !== 'REQUEST_SUCCEEDED' || !Array.isArray(payload.Results?.series)) {
    throw codedError('BLS_INVALID_RESPONSE', 502);
  }
  const byId = new Map(payload.Results.series.map((item) => [item.seriesID, item]));
  return BLS_SERIES.map((definition) => {
    const record = byId.get(definition.id);
    if (!record || !Array.isArray(record.data)) throw codedError('BLS_SERIES_MISSING', 502);
    const observations = record.data.map((item) => {
      const year = String(item.year || '');
      const period = String(item.period || '');
      if (!/^\d{4}$/.test(year) || !/^M(?:0[1-9]|1[0-2])$/.test(period)) return null;
      const value = Number(item.value);
      if (!Number.isFinite(value)) return null;
      return { date: year + '-' + period.slice(1), value, period_name: String(item.periodName || '') };
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
    return {
      ...definition,
      observations,
      latest: observations.length ? observations[observations.length - 1] : null
    };
  });
}

function parseNyFed(payload, definition) {
  if (!payload || !Array.isArray(payload.refRates)) throw codedError('NYFED_INVALID_RESPONSE', 502);
  const observations = payload.refRates.map((item) => {
    const date = String(item.effectiveDate || '');
    const value = Number(item.percentRate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) return null;
    return {
      date,
      value,
      volume_in_billions: Number.isFinite(Number(item.volumeInBillions)) ? Number(item.volumeInBillions) : null,
      revision_indicator: String(item.revisionIndicator || '')
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  if (!observations.length) throw codedError('NYFED_EMPTY_RESPONSE', 502);
  return { ...definition, observations, latest: observations[observations.length - 1] };
}

function createMacroService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  const cooldowns = new Map();
  const inFlight = new Map();
  let snapshotFlight = null;

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: 'error' });
      if (!response.ok) {
        if (response.status === 429) throw codedError('MACRO_UPSTREAM_RATE_LIMITED', 429);
        throw codedError('MACRO_UPSTREAM_HTTP_' + response.status, 502);
      }
      return await response.json();
    } catch (error) {
      if (error.code) throw error;
      throw codedError(error.name === 'AbortError' ? 'MACRO_UPSTREAM_TIMEOUT' : 'MACRO_NETWORK_ERROR', 502);
    } finally {
      clearTimeout(timer);
    }
  }

  async function requestBls() {
    const year = new Date(now()).getUTCFullYear();
    const payload = await fetchJson(BLS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        seriesid: BLS_SERIES.map((item) => item.id),
        startyear: String(year - 1),
        endyear: String(year)
      })
    });
    return parseBls(payload);
  }

  async function requestNyFed() {
    return Promise.all(NYFED_SERIES.map(async (definition) => {
      const payload = await fetchJson(NYFED_BASE + definition.endpoint, { headers: { accept: 'application/json' } });
      return parseNyFed(payload, definition);
    }));
  }

  async function load(key, ttl, fetcher) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return { data: cached.data, cached: true, stale: false };
    if ((cooldowns.get(key) || 0) > now()) {
      if (cached) return { data: cached.data, cached: true, stale: true, error: 'MACRO_UPSTREAM_COOLDOWN' };
      throw codedError('MACRO_UPSTREAM_COOLDOWN', 503);
    }
    if (inFlight.has(key)) return inFlight.get(key);
    const promise = fetcher().then((data) => {
      cache.set(key, { data, expiresAt: now() + ttl });
      cooldowns.delete(key);
      return { data, cached: false, stale: false };
    }).catch((error) => {
      cooldowns.set(key, now() + ERROR_COOLDOWN_MS);
      if (cached) return { data: cached.data, cached: true, stale: true, error: error.code || 'MACRO_UPSTREAM_ERROR' };
      throw error;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  async function snapshot() {
    if (snapshotFlight) return snapshotFlight;
    snapshotFlight = Promise.all([
      load('bls', BLS_TTL_MS, requestBls).then((result) => ({ name: 'bls', ...result, ok: !result.error, error: result.error || null }))
        .catch((error) => ({ name: 'bls', data: [], ok: false, stale: false, cached: false, error: error.code || 'BLS_UPSTREAM_ERROR' })),
      load('nyfed', NYFED_TTL_MS, requestNyFed).then((result) => ({ name: 'nyfed', ...result, ok: !result.error, error: result.error || null }))
        .catch((error) => ({ name: 'nyfed', data: [], ok: false, stale: false, cached: false, error: error.code || 'NYFED_UPSTREAM_ERROR' }))
    ]).then((groups) => {
      const series = groups.flatMap((group) => group.data.map((item) => ({
        ...item,
        cached: Boolean(group.cached),
        stale: Boolean(group.stale)
      })));
      const sources = Object.fromEntries(groups.map((group) => [group.name, {
        ok: group.ok,
        stale: Boolean(group.stale),
        cached: Boolean(group.cached),
        error: group.error || null
      }]));
      const okCount = groups.filter((group) => group.ok).length;
      const dataCount = series.filter((item) => item.latest && item.latest.value !== null).length;
      return {
        status: okCount || dataCount ? 'success' : 'error',
        observed_at: new Date(now()).toISOString(),
        partial: okCount < groups.length,
        cached: groups.every((group) => group.cached),
        series,
        sources,
        notices: {
          bls: 'BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov.',
          nyfed: 'The SOFR Data is subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of the SOFR Data by RADAR AI V2, does not sanction or endorse any particular republication, and has no liability for your use.'
        }
      };
    }).finally(() => { snapshotFlight = null; });
    return snapshotFlight;
  }

  return { snapshot, clearCache: () => { cache.clear(); cooldowns.clear(); } };
}

module.exports = {
  createMacroService,
  parseBls,
  parseNyFed,
  BLS_SERIES,
  NYFED_SERIES,
  BLS_TTL_MS,
  NYFED_TTL_MS,
  ERROR_COOLDOWN_MS,
  TIMEOUT_MS
};
