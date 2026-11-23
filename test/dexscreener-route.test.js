'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('../server');
const ingest = require('../lib/ingest');

test('DEX Screener route returns scanner payload through injected read-only service', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-dex-route-'));
  const payload = { status: 'success', provider: 'DEX Screener', updated_at: '2026-11-23T00:00:00.000Z', cached: false, partial: false, sources: { profiles: { ok: true, count: 1 } }, data: [{ chain_id: 'solana', token_symbol: 'TEST', price_usd: 1 }] };
  const app = createApp({
    cfg: { ...ingest.loadConfig(), dataDir: dir, feeds: [], adminToken: '', tgToken: '', tgChat: '' },
    state: ingest.emptyState(),
    dexScreenerService: { scanner: async () => payload }
  });
  await new Promise((resolve) => app.server.listen(0, resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + app.server.address().port + '/api/dexscreener/scanner');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), payload);
  } finally { app.stop(); }
});
