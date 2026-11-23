'use strict';

const crypto = require('node:crypto');
const BASE = 'https://api.gopluslabs.io';
const TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const MAX_INFLIGHT = 5;
const MAX_CALLS_PER_MINUTE = 5;
const MAX_CALLS_PER_DAY = 1000;
const MAX_CALLS_PER_MONTH = 5000;
const EVM_CHAINS = Object.freeze({
  eth: '1', ethereum: '1', bsc: '56', polygon_pos: '137', polygon: '137',
  arbitrum: '42161', optimism: '10', avalanche: '43114', avax: '43114',
  base: '8453', ftm: '250', fantom: '250', linea: '59144', scroll: '534352',
  mantle: '5000', zksync: '324', blast: '81457', opbnb: '204'
});
const EVM_NETWORKS = new Set(Object.keys(EVM_CHAINS));
function providerError(code, status = 502) { const error = new Error(code); error.code = code; error.status = status; return error; }
function validAddress(network, address) {
  if (network === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  return EVM_NETWORKS.has(network) && /^0x[a-fA-F0-9]{40}$/.test(address);
}
function pickTokenResult(result, address) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const key = Object.keys(result).find((value) => value.toLowerCase() === address.toLowerCase());
  if (key) return result[key];
  return ['token_name', 'token_symbol', 'is_open_source', 'is_honeypot'].some((field) => Object.prototype.hasOwnProperty.call(result, field)) ? result : null;
}
function normalizeSecurity(value) {
  const fields = [
    'token_name','token_symbol','is_open_source','is_proxy','is_honeypot','cannot_buy','cannot_sell_all',
    'buy_tax','sell_tax','transfer_tax','is_mintable','hidden_owner','can_take_back_ownership',
    'owner_change_balance','transfer_pausable','is_blacklisted','is_whitelisted','is_anti_whale',
    'anti_whale_modifiable','holder_count','holders','lp_holder_count','lp_holders','creator_address',
    'creator_percent','dex','is_in_cex','mint_authority','freeze_authority','close_authority',
    'transfer_hook','metadata_mutable','default_account_state'
  ];
  const data = {};
  for (const field of fields) if (value[field] !== undefined && value[field] !== null && value[field] !== '') data[field] = value[field];
  const risk = [
    ['is_honeypot','Honeypot terdeteksi','critical'],['cannot_buy','Pembelian dibatasi','high'],
    ['cannot_sell_all','Penjualan dibatasi','critical'],['is_mintable','Token dapat dicetak','high'],
    ['hidden_owner','Hidden owner terdeteksi','high'],['can_take_back_ownership','Ownership dapat diambil kembali','high'],
    ['owner_change_balance','Owner dapat mengubah saldo','critical'],['transfer_pausable','Transfer dapat dihentikan','high'],
    ['is_blacklisted','Blacklist tersedia','high'],['is_proxy','Proxy contract','info']
  ];
  const risk_flags = risk.filter(([field]) => String(value[field] ?? '') === '1' || value[field] === true)
    .map(([field,label,severity]) => ({ field, label, severity }));
  for (const field of ['buy_tax','sell_tax','transfer_tax']) {
    const n = Number(value[field]);
    if (value[field] !== '' && value[field] !== null && value[field] !== undefined && Number.isFinite(n) && n >= 0.1)
      risk_flags.push({ field, label: field.replaceAll('_',' ') + ' tinggi (' + (n * 100).toFixed(2) + '%)', severity: n >= 0.5 ? 'critical' : 'high' });
  }
  if (value.mint_authority && value.mint_authority !== 'null') risk_flags.push({ field: 'mint_authority', label: 'Mint authority masih aktif', severity: 'high' });
  if (value.freeze_authority && value.freeze_authority !== 'null') risk_flags.push({ field: 'freeze_authority', label: 'Freeze authority masih aktif', severity: 'high' });
  if (value.metadata_mutable === true || value.metadata_mutable === '1') risk_flags.push({ field: 'metadata_mutable', label: 'Metadata dapat diubah', severity: 'medium' });
  return { data, risk_flags };
}
function createGoPlusService({ appKey = '', appSecret = '', accessToken = '', fetchImpl = globalThis.fetch, now = Date.now, usageState = {}, onUsage = null } = {}) {
  let tokenCache = null, tokenFlight = null;
  const cache = new Map(), inFlight = new Map();
  const callTimes = [];
  function reserveQuota() {
    const current = now(), day = new Date(current).toISOString().slice(0, 10), month = day.slice(0, 7);
    if (usageState.day !== day) { usageState.day = day; usageState.day_count = 0; }
    if (usageState.month !== month) { usageState.month = month; usageState.month_count = 0; }
    const recent = callTimes.filter((stamp) => current - stamp < 60000);
    callTimes.splice(0, callTimes.length, ...recent);
    if (usageState.day_count >= MAX_CALLS_PER_DAY) throw providerError('GOPLUS_FREE_QUOTA_DAILY', 429);
    if (usageState.month_count >= MAX_CALLS_PER_MONTH) throw providerError('GOPLUS_FREE_QUOTA_MONTHLY', 429);
    if (callTimes.length >= MAX_CALLS_PER_MINUTE) throw providerError('GOPLUS_LOCAL_RATE_LIMITED', 429);
    callTimes.push(current);
    usageState.day_count = Number(usageState.day_count || 0) + 1;
    usageState.month_count = Number(usageState.month_count || 0) + 1;
    if (typeof onUsage === 'function') onUsage(usageState);
  }
  const staticToken = String(accessToken || '').trim();
  async function fetchJson(url, options = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetchImpl(url, { ...options, headers: { accept: 'application/json', ...(options.headers || {}) }, signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw providerError(response.status === 429 ? 'GOPLUS_RATE_LIMITED' : response.status === 401 ? 'GOPLUS_UNAUTHORIZED' : 'GOPLUS_HTTP_' + response.status, response.status === 429 ? 429 : response.status === 401 ? 503 : 502);
      return await response.json();
    } catch (error) {
      if (error.code) throw error;
      throw providerError(error.name === 'AbortError' ? 'GOPLUS_TIMEOUT' : 'GOPLUS_NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  async function getAccessToken(force = false) {
    if (staticToken) return staticToken;
    if (!appKey || !appSecret) throw providerError('GOPLUS_NOT_CONFIGURED', 503);
    if (!force && tokenCache && tokenCache.expiresAt > now()) return tokenCache.value;
    if (tokenFlight) return tokenFlight;
    const work = (async () => {
      const time = Math.floor(now() / 1000);
      const sign = crypto.createHash('sha1').update(String(appKey) + time + String(appSecret)).digest('hex');
      const body = await fetchJson(BASE + '/api/v1/token', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app_key: appKey, sign, time })
      });
      const result = body?.result;
      const token = typeof result === 'string' ? result : result?.access_token || result?.accessToken || result?.token || body?.access_token;
      if (Number(body?.code) !== 1 || typeof token !== 'string' || !token) throw providerError('GOPLUS_AUTH_RESPONSE_INVALID', 503);
      const seconds = Number(result?.expires_in || result?.expiresIn || body?.expires_in);
      const ttl = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 3600000) : TOKEN_TTL_MS;
      tokenCache = { value: token, expiresAt: now() + ttl };
      return token;
    })().finally(() => { tokenFlight = null; });
    tokenFlight = work;
    return work;
  }
  async function requestSecurity(network, address, retry = true) {
    const token = await getAccessToken();
    const solana = network === 'solana';
    const endpoint = solana ? '/api/v1/solana/token_security' : '/api/v1/token_security/' + EVM_CHAINS[network];
    const url = BASE + endpoint + '?contract_addresses=' + encodeURIComponent(address);
    try {
      const body = await fetchJson(url, { headers: { authorization: 'Bearer ' + token } });
      if (retry && !staticToken && Number(body?.code) === 4023) { tokenCache = null; await getAccessToken(true); return requestSecurity(network, address, false); }
      return body;
    } catch (error) {
      if (retry && !staticToken && error.code === 'GOPLUS_UNAUTHORIZED') { tokenCache = null; await getAccessToken(true); return requestSecurity(network, address, false); }
      throw error;
    }
  }
  function remember(key, payload) {
    cache.delete(key); cache.set(key, { payload, expiresAt: now() + TTL_MS });
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  }
  async function security({ networkId, tokenAddress } = {}) {
    const network = String(networkId || '').trim().toLowerCase(), address = String(tokenAddress || '').trim();
    if (!validAddress(network, address)) throw providerError(EVM_NETWORKS.has(network) || network === 'solana' ? 'GOPLUS_INVALID_TOKEN_ADDRESS' : 'GOPLUS_UNSUPPORTED_NETWORK', 400);
    if (!staticToken && (!appKey || !appSecret)) throw providerError('GOPLUS_NOT_CONFIGURED', 503);
    const key = network + ':' + (network === 'solana' ? address : address.toLowerCase());
    if (inFlight.has(key)) return inFlight.get(key);
    const existing = cache.get(key);
    if (existing && existing.expiresAt > now()) { cache.delete(key); cache.set(key, existing); return { ...existing.payload, cached: true }; }
    if (existing) cache.delete(key);
    if (inFlight.size >= MAX_INFLIGHT) throw providerError('GOPLUS_BUSY', 503);
    reserveQuota();
    const work = requestSecurity(network, address).then((body) => {
      const code = Number(body?.code);
      if (code !== 1 && code !== 2) throw providerError(code === 4029 ? 'GOPLUS_RATE_LIMITED' : 'GOPLUS_API_' + (Number.isFinite(code) ? code : 'ERROR'), code === 4029 ? 429 : 502);
      const found = pickTokenResult(body.result, address);
      if (!found) throw providerError('GOPLUS_NO_DATA', 404);
      const normalized = normalizeSecurity(found);
      const result = {
        status: code === 2 ? 'partial' : 'success', provider: 'GoPlus Token Security API',
        network_id: network, chain_id: network === 'solana' ? null : EVM_CHAINS[network],
        token_address: address, observed_at: new Date(now()).toISOString(),
        message: code === 2 ? 'Data parsial; GoPlus menyarankan permintaan ulang setelah sekitar 15 detik.' : 'Data keamanan tersedia.',
        ...normalized, cached: false
      };
      remember(key, result);
      return result;
    }).finally(() => { if (inFlight.get(key) === tracked) inFlight.delete(key); });
    const tracked = work;
    inFlight.set(key, tracked);
    return tracked;
  }
  async function decode({ networkId, contractAddress = '', data, signer = '', input, transactionType = '' } = {}) {
    const network = String(networkId || '').trim().toLowerCase();
    const supportedChainIds = new Set(['1', '25', '56', '128', '137', '250', '321', '42161', '43114']);
    const chainId = EVM_CHAINS[network] || ({ cronos: '25', heco: '128', kcc: '321' }[network]) || (supportedChainIds.has(network) ? network : '');
    if (!chainId || !supportedChainIds.has(chainId)) throw providerError('GOPLUS_UNSUPPORTED_NETWORK', 400);
    const calldata = String(data || '').trim();
    if (!/^0x(?:[a-fA-F0-9]{2})+$/.test(calldata) || calldata.length > 20002) throw providerError('GOPLUS_INVALID_TRANSACTION_DATA', 400);
    const contract = String(contractAddress || '').trim();
    if (contract && !/^0x[a-fA-F0-9]{40}$/.test(contract)) throw providerError('GOPLUS_INVALID_CONTRACT_ADDRESS', 400);
    const signerAddress = String(signer || '').trim();
    if (signerAddress && !/^0x[a-fA-F0-9]{40}$/.test(signerAddress)) throw providerError('GOPLUS_INVALID_SIGNER', 400);
    const allowedTypes = new Set(['common', 'eth_signTypedData_v4', 'personal_sign', 'eth_sign']);
    if (transactionType && !allowedTypes.has(transactionType)) throw providerError('GOPLUS_INVALID_TRANSACTION_TYPE', 400);
    if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 8192)) {
      throw providerError('GOPLUS_INVALID_INPUT_INFO', 400);
    }
    if (!staticToken && (!appKey || !appSecret)) throw providerError('GOPLUS_NOT_CONFIGURED', 503);
    reserveQuota();
    const token = await getAccessToken();
    const payload = { chain_id: chainId, data: calldata };
    if (contract) payload.contract_address = contract;
    if (signerAddress) payload.signer = signerAddress;
    if (input !== undefined) payload.input = input;
    if (transactionType) payload.transcation_type = transactionType;
    const body = await fetchJson(BASE + '/api/v1/abi/input_decode', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const code = Number(body?.code);
    if (code !== 1) throw providerError(code === 4029 ? 'GOPLUS_RATE_LIMITED' : 'GOPLUS_API_' + (Number.isFinite(code) ? code : 'ERROR'), code === 4029 ? 429 : 502);
    if (!body?.result || typeof body.result !== 'object' || Array.isArray(body.result)) throw providerError('GOPLUS_NO_DATA', 404);
    return {
      status: 'success', provider: 'GoPlus Signature Data Decode API',
      chain_id: chainId, observed_at: new Date(now()).toISOString(), result: body.result
    };
  }
  return { security, decode, clearCache: () => cache.clear() };
}
module.exports = { createGoPlusService, EVM_CHAINS, TTL_MS, TOKEN_TTL_MS, MAX_CALLS_PER_MINUTE, MAX_CALLS_PER_DAY, MAX_CALLS_PER_MONTH, MAX_INFLIGHT, validAddress, normalizeSecurity };
