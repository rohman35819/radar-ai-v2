'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeElement(tagName) {
  return {
    tagName,
    className: '',
    children: [],
    _text: '',
    style: { setProperty() {} },
    append(...nodes) { this.children.push(...nodes); },
    set textContent(value) { this._text = String(value); },
    get textContent() { return this._text + this.children.map((child) => child?.textContent ?? String(child)).join(''); }
  };
}

function loadPanel() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'intelligence.js'), 'utf8');
  const window = {};
  vm.runInNewContext(source, { window, document: { createElement: makeElement } }, { filename: 'public/intelligence.js' });
  return window.RadarIntelligence.panel;
}

test('Trading Intelligence excludes missing metrics from breadth and volume ranking', () => {
  const panel = loadPanel();
  const view = panel({
    last_ok: '2026-11-23T00:00:00.000Z',
    stale: false,
    health: { coingecko: { ok: true, at: '2026-11-23T00:00:00.000Z' } },
    tokens: [
      { symbol: 'NULL', vol_mcap: null, change_24h: null },
      { symbol: 'EMPTY', vol_mcap: '', change_24h: '' },
      { symbol: 'ZERO', vol_mcap: 0.25, change_24h: 0 },
      { symbol: 'UP', vol_mcap: 0.5, change_24h: 5 },
      { symbol: 'DOWN', vol_mcap: 0.1, change_24h: -2 },
      { symbol: 'NO_TVL', vol_mcap: 0.05, change_24h: null, fundamental: { tvl: null } }
    ],
    news: [],
    unlocks: []
  }, null, null);

  const text = view.textContent;
  assert.match(text, /33%/);
  assert.match(text, /Perubahan belum tersedia3/);
  assert.match(text, /Netral1/);
  assert.match(text, /TVL terbesar—/);
  assert.doesNotMatch(text, /NULL|EMPTY/);
});

test('Trading Intelligence exposes stale source metadata and missing timestamps', () => {
  const panel = loadPanel();
  const view = panel({
    last_ok: null,
    stale: true,
    health: { coingecko: { ok: false, at: null, error: 'UPSTREAM_TIMEOUT' } },
    tokens: [],
    news: [],
    unlocks: []
  }, null, {
    updated_at: null,
    sources: {
      markets: { ok: false, stale: true, updated_at: '2026-11-22T18:00:00.000Z', error: 'COINGECKO_RATE_LIMITED' },
      trending: { ok: false, stale: false, updated_at: null, error: 'COINGECKO_UPSTREAM_ERROR' }
    }
  });

  assert.match(view.textContent, /STALE/);
  assert.match(view.textContent, /COINGECKO_RATE_LIMITED/);
  assert.match(view.textContent, /waktu observasi tidak tersedia/);
  assert.match(view.textContent, /UPSTREAM_TIMEOUT/);
});


test('Live Coin Scanner ranks real momentum and Binance volume spikes without inventing whale confirmation', () => {
  const panel = loadPanel();
  const view = panel({
    tokens: [{ id: 'alpha-coin', symbol: 'ALP', vol10m: { spike: true, x: 4.2, volume_usdt: 84000, bucket_start: '2026-11-23T09:50:00.000Z' } }],
    health: {}, news: [], unlocks: []
  }, null, {
    updated_at: '2026-11-23T10:00:00.000Z',
    sources: { markets: { ok: true, stale: false, updated_at: '2026-11-23T10:00:00.000Z' } },
    data: { markets: [{ id: 'alpha-coin', name: 'Alpha Coin', symbol: 'alp', market_cap_rank: 88, market_cap: 10000000, total_volume: 1500000, price_change_percentage_1h_in_currency: 2, price_change_percentage_24h: 4, price_change_percentage_7d_in_currency: 8, sparkline_in_7d: { price: [1, 2, 1.5, 3] } }] }
  });
  assert.match(view.textContent, /Live Coin Scanner/);
  assert.match(view.textContent, /Alpha Coin/);
  assert.match(view.textContent, /Volume Binance 10m spike/);
  assert.match(view.textContent, /100\/100/);
  assert.match(view.textContent, /Whale: BELUM TERVERIFIKASI/);
  assert.match(view.textContent, /bukan probabilitas harga naik/);
});
