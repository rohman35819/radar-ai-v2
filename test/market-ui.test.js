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
  for (const id of ['global-stats', 'market-summary', 'trending-list', 'market-table', 'gainers', 'losers', 'price-chart', 'sector-list', 'exchange-list', 'exchange-tickers', 'ai-market-summary', 'momentum-list', 'volume-activity', 'risk-list']) {
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

test('Market Intelligence tidak mengarang waktu pembaruan atau status saat data belum ada', () => {
  const js = read('../public/market.js');
  const start = js.indexOf('function updateStatus()');
  const end = js.indexOf('\nfunction drawChart', start);
  assert.ok(start >= 0 && end > start, 'updateStatus exists');
  const source = js.slice(start, end);
  assert.doesNotMatch(source, /Date\.now\(\)/, 'current time is never used as a data timestamp');
  assert.match(source, /market\?\.updated_at/, 'timestamp comes from the server payload');
  assert.match(source, /Number\.isFinite\(parsed\.getTime\(\)\)/, 'invalid timestamp is detected');
  assert.match(source, /!total \? 'Menunggu data'/, 'zero sources do not claim a connection');
  assert.match(source, /WAKTU TIDAK TERSEDIA/, 'missing timestamp is explicit');
  assert.match(source, /Waktu pembaruan tidak tersedia dari server/, 'missing timestamp has a truthful message');
});

test('Exchange ticker mengabaikan respons lama dan menangani waktu yang tidak tersedia', () => {
  const js = read('../public/market.js');
  assert.match(js, /let tickerRequest = 0/);
  assert.match(js, /const requestId = \+\+tickerRequest/);
  assert.ok((js.match(/if \(requestId !== tickerRequest\) return;/g) || []).length >= 2, 'stale responses are ignored before DOM updates');
  assert.doesNotMatch(js, /new Date\(result\.updated_at\)\.toLocaleString/, 'missing timestamp is not rendered as Invalid Date');
  assert.match(js, /waktu pembaruan tidak tersedia/);
});

test('Notifikasi market dan tombol refresh dapat diakses pembaca layar', () => {
  const html = read('../public/market.html');
  assert.match(html, /id="notice"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="refresh"[^>]*aria-label="Muat ulang data market"/);
});
