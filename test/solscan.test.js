'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSolscanService, SolscanError } = require('../lib/solscan');

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

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
      wallet: async (address) => ({ address, ok: true, endpoint_count: 1, endpoint_total: 1 })
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
