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
  let dexArgs, securityArgs, decodeArgs;
  await withApp({
    dexScreenerService: { validate: async (args) => { dexArgs = args; return { status: 'success', pair_count: 1, pairs: [] }; } },
    goPlusService: { security: async (args) => { securityArgs = args; return { status: 'success', risk_flags: [] }; }, decode: async (args) => { decodeArgs = args; return { status: 'success', result: { method: 'approve' } }; } }
  }, async (base) => {
    const dex = await fetch(base + '/api/market-intelligence/dexscreener?network=solana&token=TokenABC&pool=PoolABC');
    assert.equal(dex.status, 200);
    assert.equal((await dex.json()).pair_count, 1);
    const gp = await fetch(base + '/api/market-intelligence/goplus?network=base&token=0x1111111111111111111111111111111111111111');
    assert.equal(gp.status, 200);
    assert.equal((await gp.json()).status, 'success');
    const decoded = await fetch(base + '/api/market-intelligence/goplus/decode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ network: 'base', contract_address: '0x1111111111111111111111111111111111111111', signer: '0x2222222222222222222222222222222222222222', data: '0x1234' }) });
    assert.equal(decoded.status, 200);
    assert.equal((await decoded.json()).result.method, 'approve');
  });
  assert.deepEqual(dexArgs, { networkId: 'solana', tokenAddress: 'TokenABC', poolAddress: 'PoolABC' });
  assert.deepEqual(securityArgs, { networkId: 'base', tokenAddress: '0x1111111111111111111111111111111111111111' });
  assert.deepEqual(decodeArgs, { networkId: 'base', contractAddress: '0x1111111111111111111111111111111111111111', data: '0x1234', signer: '0x2222222222222222222222222222222222222222', input: undefined, transactionType: undefined });
});
