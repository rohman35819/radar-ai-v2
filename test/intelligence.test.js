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
