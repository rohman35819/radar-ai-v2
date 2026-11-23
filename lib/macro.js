'use strict';

const BLS_URL = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
const NYFED_BASE = 'https://markets.newyorkfed.org/api/rates';
const BLS_TTL_MS = 12 * 60 * 60 * 1000;
const NYFED_TTL_MS = 60 * 60 * 1000;
const TREASURY_TTL_MS = 12 * 60 * 60 * 1000;
const WORLD_BANK_TTL_MS = 24 * 60 * 60 * 1000;
const TREASURY_URL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates';
const WORLD_BANK_BASE = 'https://api.worldbank.org/v2';
const ERROR_COOLDOWN_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 10000;

const BLS_SERIES = Object.freeze([
  { id: 'CUSR0000SA0', title: 'Consumer Price Index (all items)', group: 'Inflation', units: 'Index 1982-84=100', frequency: 'Monthly', source: 'BLS' },
  { id: 'LNS14000000', title: 'Unemployment Rate', group: 'Employment', units: 'Percent', frequency: 'Monthly', source: 'BLS' },
  { id: 'CES0000000001', title: 'Total Nonfarm Payroll Employment', group: 'Employment', units: 'Thousands of jobs', frequency: 'Monthly', source: 'BLS' },
  { id: 'CES0500000003', title: 'Average Hourly Earnings (private sector)', group: 'Wages', units: 'US dollars per hour', frequency: 'Monthly', source: 'BLS' }
]);

const TREASURY_SERIES = Object.freeze([
  { id: 'TREASURY_BILLS', title: 'Average interest rate — Treasury Bills', security: 'Treasury Bills', group: 'Treasury yields', units: 'Percent', frequency: 'Monthly', source: 'U.S. Treasury' },
  { id: 'TREASURY_NOTES', title: 'Average interest rate — Treasury Notes', security: 'Treasury Notes', group: 'Treasury yields', units: 'Percent', frequency: 'Monthly', source: 'U.S. Treasury' },
  { id: 'TREASURY_BONDS', title: 'Average interest rate — Treasury Bonds', security: 'Treasury Bonds', group: 'Treasury yields', units: 'Percent', frequency: 'Monthly', source: 'U.S. Treasury' },
  { id: 'TREASURY_TIPS', title: 'Average interest rate — TIPS', security: 'Treasury Inflation-Protected Securities (TIPS)', group: 'Treasury yields', units: 'Percent', frequency: 'Monthly', source: 'U.S. Treasury' }
]);
const WORLD_BANK_COUNTRIES = Object.freeze([
  { code: 'USA', name: 'United States' }, { code: 'CHN', name: 'China' }, { code: 'IDN', name: 'Indonesia' }
]);
const WORLD_BANK_SERIES = Object.freeze([
  { id: 'NY.GDP.MKTP.KD.ZG', key: 'GDP_GROWTH', title: 'GDP growth (annual %)', group: 'Growth', units: 'Percent', frequency: 'Annual' },
  { id: 'FP.CPI.TOTL.ZG', key: 'CPI_INFLATION', title: 'Consumer price inflation (annual %)', group: 'Inflation', units: 'Percent', frequency: 'Annual' },
  { id: 'SL.UEM.TOTL.ZS', key: 'UNEMPLOYMENT', title: 'Unemployment (ILO modeled, % labor force)', group: 'Employment', units: 'Percent', frequency: 'Annual' }
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
      if (item.value === null || item.value === undefined || item.value === '') return null;
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
    if (item.percentRate === null || item.percentRate === undefined || item.percentRate === '') return null;
    const value = Number(item.percentRate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) return null;
    return {
      date,
      value,
      volume_in_billions: item.volumeInBillions !== null && item.volumeInBillions !== undefined && item.volumeInBillions !== '' && Number.isFinite(Number(item.volumeInBillions)) ? Number(item.volumeInBillions) : null,
      revision_indicator: String(item.revisionIndicator || '')
    };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  if (!observations.length) throw codedError('NYFED_EMPTY_RESPONSE', 502);
  return { ...definition, observations, latest: observations[observations.length - 1] };
}

function parseRecordDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = match[1].padStart(2, '0'), day = match[2].padStart(2, '0');
  const date = match[3] + '-' + month + '-' + day;
  return Number.isFinite(Date.parse(date)) ? date : null;
}

function parseTreasury(payload) {
  if (!payload || !Array.isArray(payload.data)) throw codedError('TREASURY_INVALID_RESPONSE', 502);
  return TREASURY_SERIES.map((definition) => {
    const observations = payload.data.filter((item) => String(item.security_desc || '') === definition.security)
      .map((item) => {
        const date = parseRecordDate(item.record_date);
        const raw = String(item.avg_interest_rate_amt ?? '').replace('%', '').trim();
        const value = raw === '' ? null : Number(raw);
        if (!date || value === null || !Number.isFinite(value)) return null;
        return { date, value };
      }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
    return { ...definition, observations, latest: observations.length ? observations[observations.length - 1] : null };
  });
}

function parseWorldBank(payload, definition) {
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) throw codedError('WORLD_BANK_INVALID_RESPONSE', 502);
  const byCountry = new Map();
  for (const item of payload[1]) {
    const code = String(item.countryiso3code || '').toUpperCase();
    const date = String(item.date || '');
    const value = item.value === null || item.value === undefined || item.value === '' ? null : Number(item.value);
    if (!/^[A-Z]{3}$/.test(code) || !/^\d{4}$/.test(date) || value === null || !Number.isFinite(value)) continue;
    if (!byCountry.has(code)) byCountry.set(code, []);
    byCountry.get(code).push({ date, value, observation_status: String(item.obs_status || '') || null });
  }
  return WORLD_BANK_COUNTRIES.map((country) => {
    const observations = (byCountry.get(country.code) || []).sort((a, b) => a.date.localeCompare(b.date)).slice(-6);
    return {
      id: 'WB_' + country.code + '_' + definition.key,
      indicator_id: definition.id,
      title: country.name + ' — ' + definition.title,
      group: definition.group,
      units: definition.units,
      frequency: definition.frequency,
      source: 'World Bank',
      country_code: country.code,
      observations,
      latest: observations.length ? observations[observations.length - 1] : null
    };
  });
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

  async function requestNyFed(definition) {
    const payload = await fetchJson(NYFED_BASE + definition.endpoint, { headers: { accept: 'application/json' } });
    return parseNyFed(payload, definition);
  }

  async function requestTreasury() {
    const url = new URL(TREASURY_URL);
    url.searchParams.set('fields', 'record_date,security_desc,avg_interest_rate_amt');
    url.searchParams.set('sort', '-record_date');
    url.searchParams.set('page[size]', '100');
    const payload = await fetchJson(url, { headers: { accept: 'application/json' } });
    return parseTreasury(payload);
  }

  async function requestWorldBank(definition) {
    const countries = WORLD_BANK_COUNTRIES.map((item) => item.code).join(';');
    const url = new URL(WORLD_BANK_BASE + '/country/' + countries + '/indicator/' + encodeURIComponent(definition.id));
    url.searchParams.set('date', '2019:2026');
    url.searchParams.set('format', 'json');
    url.searchParams.set('per_page', '500');
    return parseWorldBank(await fetchJson(url, { headers: { accept: 'application/json' } }), definition);
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
    const tasks = [
      load('bls', BLS_TTL_MS, requestBls).then((result) => ({ name: 'bls', ...result, ok: !result.error, error: result.error || null }))
        .catch((error) => ({ name: 'bls', data: [], ok: false, stale: false, cached: false, error: error.code || 'BLS_UPSTREAM_ERROR' })),
      ...NYFED_SERIES.map((definition) => load('nyfed_' + definition.id.toLowerCase(), NYFED_TTL_MS, () => requestNyFed(definition)).then((result) => ({ name: 'nyfed_' + definition.id.toLowerCase(), ...result, data: [result.data], ok: !result.error, error: result.error || null }))
        .catch((error) => ({ name: 'nyfed_' + definition.id.toLowerCase(), data: [], ok: false, stale: false, cached: false, error: error.code || 'NYFED_UPSTREAM_ERROR' }))),
      load('treasury', TREASURY_TTL_MS, requestTreasury).then((result) => ({ name: 'treasury', ...result, ok: !result.error, error: result.error || null }))
        .catch((error) => ({ name: 'treasury', data: [], ok: false, stale: false, cached: false, error: error.code || 'TREASURY_UPSTREAM_ERROR' })),
      ...WORLD_BANK_SERIES.map((definition) => load('worldbank_' + definition.key.toLowerCase(), WORLD_BANK_TTL_MS, () => requestWorldBank(definition)).then((result) => ({ name: 'worldbank_' + definition.key.toLowerCase(), ...result, ok: !result.error, error: result.error || null }))
        .catch((error) => ({ name: 'worldbank_' + definition.key.toLowerCase(), data: [], ok: false, stale: false, cached: false, error: error.code || 'WORLD_BANK_UPSTREAM_ERROR' })))
    ];
    snapshotFlight = Promise.all(tasks).then((groups) => {
      const series = groups.flatMap((group) => (Array.isArray(group.data) ? group.data : [group.data]).filter(Boolean).map((item) => ({
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
          nyfed_sofr: 'The SOFR Data is subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of the SOFR Data by RADAR AI V2, does not sanction or endorse any particular republication, and has no liability for your use.',
          nyfed_effr: 'The EFFR Data is subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of the EFFR Data by RADAR AI V2, does not sanction or endorse any particular republication, and has no liability for your use.',
          treasury: 'U.S. Treasury Fiscal Data is provided as open government data. Attribute U.S. Treasury and do not imply endorsement.',
          worldbank: 'World Bank indicator data is provided with attribution. Observation year is not the same as publication/availability date; do not use this series for look-ahead-sensitive backtests without release-date provenance.'
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
  parseTreasury,
  parseWorldBank,
  BLS_SERIES,
  NYFED_SERIES,
  TREASURY_SERIES,
  WORLD_BANK_SERIES,
  WORLD_BANK_COUNTRIES,
  BLS_TTL_MS,
  NYFED_TTL_MS,
  TREASURY_TTL_MS,
  WORLD_BANK_TTL_MS,
  ERROR_COOLDOWN_MS,
  TIMEOUT_MS
};
