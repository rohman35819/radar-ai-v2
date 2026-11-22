'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(require.resolve(file), 'utf8');

test('Market Intelligence tersedia dari navigasi dashboard tanpa menghapus menu lama', () => {
  const html = read('../public/index.html');
  assert.match(html, /href="\/market\.html"/);
  for (const tab of ['overview', 'screener', 'watch', 'analytics', 'news', 'unlock', 'alerts', 'ai', 'workspace', 'system']) {
    assert.match(html, new RegExp('data-t="' + tab + '"'));
  }
});

test('Market Intelligence memakai aset eksternal dan menampilkan semua modul data', () => {
  const html = read('../public/market.html');
  assert.match(html, /href="\/market\.css"/);
  assert.match(html, /src="\/market\.js"/);
  for (const id of ['global-stats', 'market-summary', 'trending-list', 'market-table', 'gainers', 'losers', 'price-chart', 'sector-list', 'exchange-list', 'exchange-tickers', 'ai-market-summary']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Powered by CoinGecko/);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /<style[\s>]/i);
});

test('Market Intelligence merender data provider sebagai teks, bukan HTML mentah', () => {
  const js = read('../public/market.js');
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /innerHTML\s*=/);
  assert.doesNotMatch(js, /eval\s*\(/);
});
