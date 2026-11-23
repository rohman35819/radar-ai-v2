'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../public/style.css'), 'utf8');
const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const ingest = fs.readFileSync(require.resolve('../lib/ingest.js'), 'utf8');

test('Dashboard exposes Bubble Maps without removing existing navigation', () => {
  assert.match(html, /data-t="bubblemaps"/);
  for (const destination of ['overview','screener','watch','analytics','news','unlock','alerts','ai','workspace','system']) {
    assert.match(html, new RegExp('data-t="' + destination + '"'));
  }
  assert.match(html, /href="\/solscan\.html"/);
  assert.match(html, /href="\/trading\.html"/);
  assert.match(html, /href="\/market\.html"/);
});

test('Bubble Maps embeds only the official provider origin and requires a configured partner ID', () => {
  assert.match(app, /https:\/\/iframe\.bubblemaps\.io\/map/);
  assert.match(app, /bubbleMapsConfig\?\.configured/);
  assert.match(app, /partnerId/);
  assert.match(app, /BUBBLEMAPS_CHAINS/);
  assert.match(server, /frame-src https:\/\/iframe\.bubblemaps\.io/);
  assert.match(ingest, /BUBBLEMAPS_PARTNER_ID/);
  assert.match(css, /\.bubble-map-frame iframe/);
});

test('Bubble Maps labels transfer relationships carefully and never presents them as proof of buying', () => {
  assert.match(app, /tidak membuktikan kepemilikan bersama atau niat membeli/);
  assert.match(app, /jangan gunakan simbol ticker/i);
});

test('Bubble Maps validates contract addresses by chain instead of accepting ticker symbols', () => {
  assert.match(app, /function isValidBubbleTokenAddress/);
  assert.match(app, /\^0x\[a-fA-F0-9\]\{40\}\$/);
  assert.match(app, /1-9A-HJ-NP-Za-km-z\]\{32,44\}/);
  assert.match(app, /isValidBubbleTokenAddress\(chainId,tokenAddress\)/);
});

test('Bubblemaps config endpoint exposes only the public partner ID and CSP allows only its official iframe host', async () => {
  const { createApp } = require('../server');
  const ingestModule = require('../lib/ingest');
  const { mkdtempSync, rmSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'radar-bubblemaps-'));
  const cfg = { ...ingestModule.loadConfig(), dataDir: dir, adminToken: '', bubbleMapsPartnerId: 'partner-test-public' };
  const app = createApp({ cfg, state: ingestModule.emptyState() });
  await new Promise((resolve) => app.server.listen(0, resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + app.server.address().port + '/api/bubblemaps/config');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-src https:\/\/iframe\.bubblemaps\.io/);
    assert.deepEqual(await response.json(), {
      provider: 'Bubblemaps V2',
      configured: true,
      partnerId: 'partner-test-public',
      source: 'official_iframe'
    });
  } finally {
    app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Bubblemaps config endpoint stays disabled when production partner ID is absent', async () => {
  const { createApp } = require('../server');
  const ingestModule = require('../lib/ingest');
  const app = createApp({
    cfg: { ...ingestModule.loadConfig(), bubbleMapsPartnerId: '' },
    state: ingestModule.emptyState()
  });
  await new Promise((resolve) => app.server.listen(0, resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + app.server.address().port + '/api/bubblemaps/config');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      provider: 'Bubblemaps V2',
      configured: false,
      partnerId: null,
      source: 'official_iframe'
    });
  } finally { app.stop(); }
});
