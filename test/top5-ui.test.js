'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../public/style.css'), 'utf8');
const top5 = fs.readFileSync(require.resolve('../public/top5.js'), 'utf8');

test('Dashboard mempertahankan semua menu lama dan menambah dua menu intelijen', () => {
  for (const tab of ['overview', 'screener', 'early-gems', 'watch', 'analytics', 'news', 'unlock', 'alerts', 'ai', 'workspace', 'system']) {
    assert.match(html, new RegExp('data-t="' + tab + '"'));
  }
  assert.match(html, /data-t="action"/);
  assert.match(html, /data-t="intel"/);
  assert.match(html, /href="\/trading\.html"/);
  assert.match(html, /href="\/market\.html"/);
  assert.match(html, /href="\/solscan\.html"/);
  assert.match(html, /href="\/command\.html"/);
  assert.match(html, /src="\/top5\.js\?v=v2\.3\.1"/);
});

test('Top 5 Action Center memakai analitik nyata dan tombol VIEW TRADE ANALYSIS', () => {
  assert.match(app, /RadarTop5\.rankTop5\(getTokens\(\)/);
  assert.match(app, /VIEW TRADE ANALYSIS/);
  assert.match(app, /function openTradeAnalysis\(item\)/);
  assert.match(app, /RadarTop5\.buildTradePlan\(/);
  assert.match(app, /RadarTop5\.indicatorSummary\(/);
  assert.match(app, /\/api\/market-intelligence\/chart\?coin=/);
  assert.match(app, /NOT ENOUGH DATA/);
  assert.match(css, /\.act-grid/);
  assert.match(css, /\.trade-modal/);
});

test('Radar Intelligence hanya menandai fitur yang benar-benar tersedia sebagai AKTIF', () => {
  const start = app.indexOf('const intelCapabilities=[');
  assert.ok(start >= 0, 'matrix exists');
  const source = app.slice(start, start + 1500);
  assert.match(source, /Live Market Scanner','AKTIF'/);
  assert.match(source, /Top 5 Action Center','AKTIF'/);
  assert.match(source, /Trading Analysis','AKTIF'/);
  for (const name of ['Smart Money Tracking', 'Whale Activity', 'Portfolio Intelligence']) {
    assert.match(source, new RegExp(name + "','BELUM TERSEDIA'"));
  }
  assert.match(source, /Token Risk Scanner','TERBATAS'/);
  assert.match(app, /function renderIntel\(\)/);
});

test('Analisis tidak mengklaim profit, order, atau angka acak', () => {
  for (const source of [app, top5]) assert.doesNotMatch(source, /Math\.random/);
  assert.match(app, /Tidak ada order, transfer, withdrawal, atau transaksi nyata yang dikirim/);
  assert.match(app, /Profit tidak dijamin/);
  assert.match(top5, /bukan prediksi/i);
  assert.doesNotMatch(app, /method:'(POST|PUT|DELETE)'[^)]*\/order/);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /<style[\s>]/i);
});
