'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSolscanService, SolscanError, parseCsv, normalizeExportTransfer } = require('../lib/solscan');

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const csvResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => body, headers: { get: () => String(Buffer.byteLength(body)) } });

test('Solscan CSV parser handles quoted commas and quoted newlines', () => {
  const rows = parseCsv('Signature,Value,Note\r\nabc,120000,"large, transfer"\r\ndef,200000,"line one\nline two"\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].value, '120000');
  assert.equal(rows[0].note, 'large, transfer');
  assert.equal(rows[1].note, 'line one\nline two');
});

test('Solscan export normalizer requires USD value and converts raw token amount', () => {
  const item = normalizeExportTransfer({
    signature: '5vwF267YiYngfWBscpx975UM7xsNzEDhqycEsUKmfHtc8CGH5XXqLoYVrGhTyJ4VPCPaQT1XjWghmrH2NAjQ3eTh',
    block_time: '1795435200', human_time: '2026-11-23T12:00:00.000Z',
    from: '11111111111111111111111111111111', to: '22222222222222222222222222222222',
    amount: '1500000000', decimals: '9', value: '125000.50', flow: 'out',
    token_address: 'So11111111111111111111111111111111111111112'
  }, '11111111111111111111111111111111');
  assert.equal(item.value_usd, 125000.5);
  assert.equal(item.amount, 1.5);
  assert.equal(item.direction, 'out');
  assert.equal(normalizeExportTransfer({ signature: 'x', from: 'a', to: 'b', amount: '1', decimals: '0', value: '' }, 'a'), null);
});

test('Solscan whale transfer export filters by USD threshold and caches the raw export', async () => {
  const address = '11111111111111111111111111111111';
  const csv = [
    'Signature,Block Time,Human Time,Action,From,To,Amount,Flow,Value,Decimals,Token Address',
    '5vwF267YiYngfWBscpx975UM7xsNzEDhqycEsUKmfHtc8CGH5XXqLoYVrGhTyJ4VPCPaQT1XjWghmrH2NAjQ3eTh,1795435200,2026-11-23T12:00:00.000Z,TRANSFER,' + address + ',22222222222222222222222222222222,1500000000,out,125000,9,So11111111111111111111111111111111111111112',
    '4vwF267YiYngfWBscpx975UM7xsNzEDhqycEsUKmfHtc8CGH5XXqLoYVrGhTyJ4VPCPaQT1XjWghmrH2NAjQ3eTh,1795435100,2026-11-23T11:58:20.000Z,TRANSFER,33333333333333333333333333333333,' + address + ',25000000,in,25000,6,EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  ].join('\n');
  const calls = [];
  const service = createSolscanService({ apiKey: 'test-key', now: () => Date.parse('2026-11-23T12:00:00Z'), fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return csvResponse(csv);
  }});
  const large = await service.whaleTransfers({ address, minUsd: 100000, hours: 24 });
  assert.equal(large.status, 'success');
  assert.equal(large.transfer_count, 2);
  assert.equal(large.qualifying_count, 1);
  assert.equal(large.transfers[0].value_usd, 125000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.token, 'test-key');
  assert.match(calls[0].url, /account\/transfer\/export/);
  assert.equal(new URL(calls[0].url).searchParams.get('hours'), null);
  const smaller = await service.whaleTransfers({ address, minUsd: 10000, hours: 24 });
  assert.equal(smaller.qualifying_count, 2);
  assert.equal(smaller.cached, true);
  assert.equal(calls.length, 1);
});

test('Solscan whale export validates wallet, threshold and time window before network', async () => {
  let calls = 0;
  const service = createSolscanService({ apiKey: 'test-key', fetchImpl: async () => { calls += 1; return csvResponse('Signature,Value\n'); } });
  await assert.rejects(service.whaleTransfers({ address: 'bad', minUsd: 100000, hours: 24 }), { code: 'INVALID_SOLANA_ADDRESS' });
  await assert.rejects(service.whaleTransfers({ address: '11111111111111111111111111111111', minUsd: 10, hours: 24 }), { code: 'SOLSCAN_INVALID_WHALE_THRESHOLD' });
  await assert.rejects(service.whaleTransfers({ address: '11111111111111111111111111111111', minUsd: 100000, hours: 999 }), { code: 'SOLSCAN_INVALID_WHALE_WINDOW' });
  assert.equal(calls, 0);
});

test('Solscan overview uses server token header and returns partial endpoint health', async () => {
  const calls = [];
  const service = createSolscanService({
    apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), headers: options.headers });
      return response({ success: true, data: [] });
    }
  });
  const result = await service.overview();
  assert.equal(result.configured, true);
  assert.equal(result.ok, true);
  assert.equal(result.endpoint_total, 9);
  assert.equal(result.endpoint_count, 9);
  assert.equal(calls.length, 9);
  assert.ok(calls.every((call) => call.headers.token === 'test-secret'));
  assert.ok(calls.some((call) => call.url.startsWith('https://public-api.solscan.io/')));
  assert.ok(calls.some((call) => call.url.startsWith('https://pro-api.solscan.io/v2.0/')));
});

test('Solscan overview is cached and does not repeat upstream calls inside TTL', async () => {
  let calls = 0;
  const service = createSolscanService({ apiKey: 'test-key', fetchImpl: async () => { calls += 1; return response({ success: true, data: [] }); } });
  await service.overview();
  await service.overview();
  assert.equal(calls, 9);
});

test('Solscan wallet validates base58 addresses before making upstream requests', async () => {
  let calls = 0;
  const service = createSolscanService({ apiKey: 'test-key', fetchImpl: async () => { calls += 1; return response({ success: true, data: {} }); } });
  await assert.rejects(service.wallet('not-a-wallet'), (error) => error instanceof SolscanError && error.code === 'INVALID_SOLANA_ADDRESS');
  assert.equal(calls, 0);
});

test('Solscan wallet isolates plan-gated endpoint errors while preserving other wallet data', async () => {
  const address = '11111111111111111111111111111111';
  const service = createSolscanService({
    apiKey: 'test-key',
    fetchImpl: async (url) => String(url).includes('/account/portfolio')
      ? response({ success: false }, 403)
      : response({ success: true, data: {} })
  });
  const result = await service.wallet(address);
  assert.equal(result.ok, true);
  assert.equal(result.partial, true);
  assert.equal(result.endpoint_total, 7);
  assert.equal(result.endpoints.portfolio.ok, false);
  assert.equal(result.endpoints.portfolio.code, 'SOLSCAN_PLAN_ACCESS_DENIED');
});

test('Solscan service reports missing key without exposing credentials', async () => {
  const service = createSolscanService({ apiKey: '' });
  const result = await service.overview();
  assert.equal(result.configured, false);
  assert.equal(result.code, 'SOLSCAN_API_KEY_NOT_CONFIGURED');
  assert.equal(JSON.stringify(result).includes('token'), false);
});

test('Solscan server routes return adapter data without exposing the API key', async () => {
  const { createApp } = require('../server');
  const { mkdtempSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'radar-solscan-route-'));
  const app = createApp({
    cfg: { ...require('../lib/ingest').loadConfig(), dataDir: dir, adminToken: '' },
    solscanService: {
      overview: async () => ({ configured: true, ok: true, endpoint_count: 1, endpoint_total: 1, source: 'Solscan Pro API v2.0' }),
      wallet: async (address) => ({ address, ok: true, endpoint_count: 1, endpoint_total: 1 }),
      whaleTransfers: async ({ address, minUsd, hours }) => ({ status: 'success', address, threshold_usd: Number(minUsd), window_hours: Number(hours), qualifying_count: 0, transfers: [] })
    }
  });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    const overview = await fetch(base + '/api/solscan/overview');
    assert.equal(overview.status, 200);
    assert.equal((await overview.json()).source, 'Solscan Pro API v2.0');
    const wallet = await fetch(base + '/api/solscan/wallet?address=11111111111111111111111111111111');
    assert.equal(wallet.status, 200);
    assert.equal((await wallet.json()).address, '11111111111111111111111111111111');
    const whale = await fetch(base + '/api/solscan/whale-transfers?address=11111111111111111111111111111111&min_usd=100000&hours=24');
    assert.equal(whale.status, 200);
    assert.equal((await whale.json()).threshold_usd, 100000);
  } finally { app.stop(); }
});

test('Solscan request timeout also covers response body parsing', async () => {
  const service = createSolscanService({
    apiKey: 'test-key',
    timeoutMs: 1,
    fetchImpl: async () => ({
      ok: true,
      json: async () => { const error = new Error('aborted while reading body'); error.name = 'AbortError'; throw error; }
    })
  });
  const result = await service.overview();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SOLSCAN_TIMEOUT');
  assert.equal(result.endpoint_count, 0);
});
