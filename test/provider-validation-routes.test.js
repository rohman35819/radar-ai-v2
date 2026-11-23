'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ingest = require('../lib/ingest');
const { createApp } = require('../server');

async function withApp(services, run) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-provider-routes-'));
  const cfg = { ...ingest.loadConfig(), dataDir, feeds: [], tgToken: '', tgChat: '', exchEnabled: false, refreshMs: 3600000 };
  const app = createApp({ cfg, state: ingest.emptyState(), ...services });
  await new Promise((resolve) => app.server.listen(0, resolve));
  try { await run('http://127.0.0.1:' + app.server.address().port); }
  finally { app.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); }
}

test('provider routes expose on-demand DEX and GoPlus results without credentials in responses', async () => {
  let dexArgs, securityArgs;
  await withApp({
    dexScreenerService: { validate: async (args) => { dexArgs = args; return { status: 'success', pair_count: 1, pairs: [] }; } },
    goPlusService: { security: async (args) => { securityArgs = args; return { status: 'success', risk_flags: [] }; } }
  }, async (base) => {
    const dex = await fetch(base + '/api/market-intelligence/dexscreener?network=solana&token=TokenABC&pool=PoolABC');
    assert.equal(dex.status, 200);
    assert.equal((await dex.json()).pair_count, 1);
    const gp = await fetch(base + '/api/market-intelligence/goplus?network=base&token=0x1111111111111111111111111111111111111111');
    assert.equal(gp.status, 200);
    assert.equal((await gp.json()).status, 'success');
  });
  assert.deepEqual(dexArgs, { networkId: 'solana', tokenAddress: 'TokenABC', poolAddress: 'PoolABC' });
  assert.deepEqual(securityArgs, { networkId: 'base', tokenAddress: '0x1111111111111111111111111111111111111111' });
});


test('Marketlight route serves bounded read-only data and applies a per-IP limit', async () => {
  const calls = [];
  await withApp({
    marketlightService: {
      snapshot: async (base, hours) => {
        calls.push({ base, hours });
        return { status: 'success', provider: 'Marketlight public derivatives API', license: 'CC BY 4.0', attribution: { url: 'https://marketlight.ai' }, base, liquidation_hours: hours, data: {}, sources: {} };
      }
    }
  }, async (base) => {
    for (let i = 0; i < 6; i++) {
      const response = await fetch(base + '/api/market-intelligence/marketlight?base=ETH&hours=12');
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.provider, 'Marketlight public derivatives API');
      assert.equal(payload.attribution.url, 'https://marketlight.ai');
    }
    const limited = await fetch(base + '/api/market-intelligence/marketlight?base=ETH&hours=12');
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, 'MARKETLIGHT_LOCAL_RATE_LIMITED');
  });
  assert.equal(calls.length, 6);
  assert.ok(calls.every((call) => call.base === 'ETH' && call.hours === '12'));
});

test('Marketlight route rejects invalid assets without exposing upstream details', async () => {
  await withApp({
    marketlightService: {
      snapshot: async () => { const error = new Error('MARKETLIGHT_UNSUPPORTED_BASE'); error.code = 'MARKETLIGHT_UNSUPPORTED_BASE'; error.status = 400; throw error; }
    }
  }, async (base) => {
    const response = await fetch(base + '/api/market-intelligence/marketlight?base=INVALID&hours=24');
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'MARKETLIGHT_UNSUPPORTED_BASE');
    assert.equal(payload.message, 'Aset belum didukung Marketlight.');
    assert.equal(JSON.stringify(payload).includes('https://marketlight.ai'), false);
  });
});
