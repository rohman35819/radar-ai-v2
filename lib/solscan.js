'use strict';

const BASE_URL = 'https://pro-api.solscan.io/v2.0';
const CACHE_TTL_MS = 300000;
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

class SolscanError extends Error {
  constructor(code, status = 502) { super(code); this.name = 'SolscanError'; this.code = code; this.status = status; }
}

function createSolscanService({ apiKey = process.env.SOLSCAN_API_KEY || '', fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 10000 } = {}) {
  const cache = new Map();
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
      if (error && error.name === 'AbortError') throw new SolscanError('SOLSCAN_TIMEOUT', 504);
      throw new SolscanError('SOLSCAN_NETWORK_ERROR', 502);
    } finally { clearTimeout(timer); }
    if (!response || !response.ok) {
      const status = Number(response?.status) || 502;
      const code = status === 401 ? 'SOLSCAN_AUTH_FAILED' :
        status === 403 ? 'SOLSCAN_PLAN_ACCESS_DENIED' :
        status === 429 ? 'SOLSCAN_RATE_LIMITED' :
        status >= 500 ? 'SOLSCAN_UPSTREAM_UNAVAILABLE' : 'SOLSCAN_BAD_REQUEST';
      throw new SolscanError(code, status === 429 ? 429 : status === 401 || status === 403 ? status : 502);
    }
    let body;
    try { body = await response.json(); } catch { throw new SolscanError('SOLSCAN_INVALID_RESPONSE', 502); }
    if (body && body.success === false) throw new SolscanError('SOLSCAN_UPSTREAM_REJECTED', 502);
    cache.set(cacheKey, { at: now(), value: body });
    return body;
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

  return { overview, wallet, configured: Boolean(key) };
}

module.exports = { createSolscanService, SolscanError, ADDRESS_RE };
