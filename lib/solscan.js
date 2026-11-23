'use strict';

const BASE_URL = 'https://pro-api.solscan.io/v2.0';
const CACHE_TTL_MS = 300000;
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

class SolscanError extends Error {
  constructor(code, status = 502) { super(code); this.name = 'SolscanError'; this.code = code; this.status = status; }
}


function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((value) => value !== '')) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map((value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, String(values[index] || '').trim()])));
}

function normalizeExportTransfer(row, walletAddress) {
  const number = (value) => {
    const parsed = Number(String(value ?? '').replace(/,/g, '').replace(/[$%]/g, '').trim());
    return value === '' || value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed;
  };
  const signature = String(row.signature || row.transaction_signature || '').trim();
  const from = String(row.from || row.from_address || '').trim();
  const to = String(row.to || row.to_address || '').trim();
  const valueUsd = number(row.value || row.value_usd);
  const rawAmount = number(row.amount);
  const decimals = number(row.decimals || row.token_decimals);
  const blockTime = number(row.block_time);
  const humanTime = String(row.human_time || row.time || '').trim();
  if (!signature || (!from && !to) || valueUsd === null || valueUsd < 0) return null;
  const tokenAddress = String(row.token_address || row.token_addres || '').trim() || null;
  const amount = rawAmount === null ? null : decimals === null ? null : rawAmount / (10 ** Math.min(30, Math.max(0, decimals)));
  return {
    signature,
    block_time: blockTime,
    time: humanTime || (blockTime ? new Date(blockTime * 1000).toISOString() : null),
    action: String(row.action || row.activity_type || 'TRANSFER').slice(0, 60),
    from,
    to,
    direction: String(row.flow || '').toLowerCase() === 'in' ? 'in' : String(row.flow || '').toLowerCase() === 'out' ? 'out' : (to === walletAddress ? 'in' : from === walletAddress ? 'out' : 'unknown'),
    token_address: tokenAddress,
    token_decimals: decimals,
    amount,
    value_usd: valueUsd
  };
}

function createSolscanService({ apiKey = process.env.SOLSCAN_API_KEY || '', fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 10000 } = {}) {
  const cache = new Map();
  const exportCache = new Map();
  const exportFlights = new Map();
  const key = String(apiKey || '').trim();

  async function request(path, params = {}, { cacheMs = CACHE_TTL_MS, baseUrl = BASE_URL } = {}) {
    if (!key) throw new SolscanError('SOLSCAN_API_KEY_NOT_CONFIGURED', 503);
    const url = new URL(baseUrl + path);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
    }
    const cacheKey = url.toString();
    const hit = cache.get(cacheKey);
    if (hit && now() - hit.at < cacheMs) return hit.value;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json', token: key },
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timer);
      if (error && error.name === 'AbortError') throw new SolscanError('SOLSCAN_TIMEOUT', 504);
      throw new SolscanError('SOLSCAN_NETWORK_ERROR', 502);
    }
    if (!response || !response.ok) {
      clearTimeout(timer);
      const status = Number(response?.status) || 502;
      const code = status === 401 ? 'SOLSCAN_AUTH_FAILED' :
        status === 403 ? 'SOLSCAN_PLAN_ACCESS_DENIED' :
        status === 429 ? 'SOLSCAN_RATE_LIMITED' :
        status >= 500 ? 'SOLSCAN_UPSTREAM_UNAVAILABLE' : 'SOLSCAN_BAD_REQUEST';
      throw new SolscanError(code, status === 429 ? 429 : status === 401 || status === 403 ? status : 502);
    }
    let body;
    try { body = await response.json(); }
    catch (error) {
      if (error && error.name === 'AbortError') throw new SolscanError('SOLSCAN_TIMEOUT', 504);
      throw new SolscanError('SOLSCAN_INVALID_RESPONSE', 502);
    } finally { clearTimeout(timer); }
    if (body && body.success === false) throw new SolscanError('SOLSCAN_UPSTREAM_REJECTED', 502);
    if (cache.size >= 500) {
      for (const [cachedKey, cached] of cache) {
        if (now() - cached.at >= CACHE_TTL_MS) cache.delete(cachedKey);
        if (cache.size < 500) break;
      }
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
    }
    cache.set(cacheKey, { at: now(), value: body });
    return body;
  }

  async function whaleTransfers({ address, minUsd = 100000, hours = 24 } = {}) {
    const walletAddress = String(address || '').trim();
    const threshold = Number(minUsd), windowHours = Number(hours);
    if (!ADDRESS_RE.test(walletAddress)) throw new SolscanError('INVALID_SOLANA_ADDRESS', 400);
    if (!Number.isFinite(threshold) || threshold < 1000 || threshold > 1000000000) throw new SolscanError('SOLSCAN_INVALID_WHALE_THRESHOLD', 400);
    if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 168) throw new SolscanError('SOLSCAN_INVALID_WHALE_WINDOW', 400);
    if (!key) throw new SolscanError('SOLSCAN_API_KEY_NOT_CONFIGURED', 503);
    const cacheKey = walletAddress + ':' + windowHours;
    const cached = exportCache.get(cacheKey);
    if (cached && now() - cached.at < CACHE_TTL_MS) {
      return { ...cached.payload, threshold_usd: threshold,
        transfers: cached.payload.transfers.filter((item) => item.value_usd >= threshold),
        qualifying_count: cached.payload.transfers.filter((item) => item.value_usd >= threshold).length,
        cached: true };
    }
    if (exportFlights.has(cacheKey)) {
      const payload = await exportFlights.get(cacheKey);
      const transfers = payload.transfers.filter((item) => item.value_usd >= threshold);
      return { ...payload, threshold_usd: threshold, transfers, qualifying_count: transfers.length, cached: true };
    }
    const toTime = Math.floor(now() / 1000), fromTime = toTime - windowHours * 3600;
    const url = new URL(BASE_URL + '/account/transfer/export');
    url.searchParams.set('address', walletAddress);
    url.searchParams.set('from_time', String(fromTime));
    url.searchParams.set('to_time', String(toTime));
    url.searchParams.set('exclude_amount_zero', 'true');
    const work = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(url, { method: 'GET', headers: { accept: 'text/csv', token: key }, signal: controller.signal });
        if (!response || !response.ok) {
          const status = Number(response?.status) || 502;
          const code = status === 401 ? 'SOLSCAN_AUTH_FAILED' : status === 403 ? 'SOLSCAN_PLAN_ACCESS_DENIED' :
            status === 429 ? 'SOLSCAN_RATE_LIMITED' : status >= 500 ? 'SOLSCAN_UPSTREAM_UNAVAILABLE' : 'SOLSCAN_BAD_REQUEST';
          throw new SolscanError(code, status === 429 ? 429 : status === 401 || status === 403 ? status : 502);
        }
        const declaredSize = Number(response.headers?.get?.('content-length') || 0);
        if (declaredSize > 5 * 1024 * 1024) throw new SolscanError('SOLSCAN_EXPORT_TOO_LARGE', 502);
        const csv = await response.text();
        if (Buffer.byteLength(csv, 'utf8') > 5 * 1024 * 1024) throw new SolscanError('SOLSCAN_EXPORT_TOO_LARGE', 502);
        const rows = parseCsv(csv);
        if (!rows.length) throw new SolscanError('SOLSCAN_EXPORT_INVALID_RESPONSE', 502);
        const transfers = rows.map((row) => normalizeExportTransfer(row, walletAddress)).filter(Boolean)
          .sort((a, b) => (b.block_time || 0) - (a.block_time || 0));
        const payload = {
          status: 'success',
          provider: 'Solscan Pro API v2.0 account transfer export',
          network: 'Solana Mainnet',
          address: walletAddress,
          window_hours: windowHours,
          observed_at: new Date(now()).toISOString(),
          transfer_count: rows.length,
          unknown_value_count: rows.filter((row) => row.value === '' && row.value_usd === '').length,
          truncated_possible: rows.length >= 5000,
          transfers,
          cached: false
        };
        exportCache.set(cacheKey, { at: now(), payload });
        while (exportCache.size > 100) exportCache.delete(exportCache.keys().next().value);
        return payload;
      } catch (error) {
        if (error instanceof SolscanError) throw error;
        if (error?.name === 'AbortError') throw new SolscanError('SOLSCAN_TIMEOUT', 504);
        throw new SolscanError('SOLSCAN_EXPORT_FAILED', 502);
      } finally { clearTimeout(timer); }
    })().finally(() => exportFlights.delete(cacheKey));
    exportFlights.set(cacheKey, work);
    const payload = await work;
    const qualifying = payload.transfers.filter((item) => item.value_usd >= threshold);
    return { ...payload, threshold_usd: threshold, transfers: qualifying, qualifying_count: qualifying.length };
  }

  async function partial(name, path, params, baseUrl = BASE_URL) {
    try { return { ok: true, data: await request(path, params, { baseUrl }) }; }
    catch (error) { return { ok: false, code: error.code || 'SOLSCAN_REQUEST_FAILED' }; }
  }

  async function overview() {
    if (!key) return { configured: false, ok: false, code: 'SOLSCAN_API_KEY_NOT_CONFIGURED', source: 'Solscan Pro API', observed_at: new Date(now()).toISOString(), endpoints: {} };
    const publicBase = 'https://public-api.solscan.io';
    const entries = await Promise.all([
      ['chain_info', '/chaininfo', {}, publicBase],
      ['transaction_analytics', '/analytics/transactions', { filter: 'all', range: 30 }, publicBase],
      ['stake_analytics', '/analytics/stake', { range: 30 }, publicBase],
      ['fee_analytics', '/analytics/fees', { range: 30 }, publicBase],
      ['defi_analytics', '/analytics/dex/activity', { range: 30 }, publicBase],
      ['compute_analytics', '/analytics/compute-units', { range: 30 }, publicBase],
      ['trending_tokens', '/token/trending', { timeframe: '24h', page: 1, page_size: 20 }, BASE_URL],
      ['latest_transactions', '/transaction/last', { limit: 20 }, BASE_URL],
      ['latest_blocks', '/block/last', { limit: 10 }, BASE_URL]
    ].map(async ([name, path, params, baseUrl]) => [name, await partial(name, path, params, baseUrl)]));
    const endpoints = Object.fromEntries(entries);
    const successes = Object.values(endpoints).filter((item) => item.ok).length;
    const failures = Object.values(endpoints).filter((item) => !item.ok);
    return {
      configured: true, ok: successes > 0, partial: successes > 0 && failures.length > 0,
      code: successes ? null : (failures[0]?.code || 'SOLSCAN_UNAVAILABLE'),
      source: 'Solscan Pro API v2.0', network: 'Solana Mainnet',
      observed_at: new Date(now()).toISOString(), endpoint_count: successes, endpoint_total: entries.length,
      endpoints
    };
  }

  async function wallet(address) {
    const value = String(address || '').trim();
    if (!ADDRESS_RE.test(value)) throw new SolscanError('INVALID_SOLANA_ADDRESS', 400);
    if (!key) throw new SolscanError('SOLSCAN_API_KEY_NOT_CONFIGURED', 503);
    const specs = [
      ['account', '/account/detail', { address: value }],
      ['portfolio', '/account/portfolio', { address: value }],
      ['token_accounts', '/account/token-accounts', { address: value, page: 1, page_size: 40 }],
      ['transactions', '/account/transactions', { address: value, limit: 20 }],
      ['transfers', '/account/transfer', { address: value, page: 1, page_size: 20, sort_by: 'block_time', sort_order: 'desc' }],
      ['defi_activities', '/account/defi-activities', { address: value, page: 1, page_size: 20, sort_by: 'block_time', sort_order: 'desc' }],
      ['stake', '/account/stake', { address: value }]
    ];
    const entries = await Promise.all(specs.map(async ([name, path, params]) => [name, await partial(name, path, params)]));
    const endpoints = Object.fromEntries(entries);
    const successes = Object.values(endpoints).filter((item) => item.ok).length;
    return {
      address: value, network: 'Solana Mainnet', source: 'Solscan Pro API v2.0',
      observed_at: new Date(now()).toISOString(), ok: successes > 0,
      partial: successes > 0 && successes < specs.length,
      endpoint_count: successes, endpoint_total: specs.length, endpoints
    };
  }

  return { overview, wallet, whaleTransfers, configured: Boolean(key) };
}

module.exports = { createSolscanService, SolscanError, ADDRESS_RE, parseCsv, normalizeExportTransfer };
