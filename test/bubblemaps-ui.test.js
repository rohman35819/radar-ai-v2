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
