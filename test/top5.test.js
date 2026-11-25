'use strict';
// Data pada test ini adalah fixture deterministik untuk pengujian logika, bukan data pasar nyata.
const test = require('node:test');
const assert = require('node:assert/strict');
const top5 = require('../public/top5.js');

const NOW = Date.parse('2026-11-25T12:00:00.000Z');
const token = (overrides = {}) => ({
  id: 'coin-' + Math.abs(overrides.seed || 1), symbol: 'T' + (overrides.seed || 1), name: 'Token ' + (overrides.seed || 1),
  price: 100, market_cap: 5e7, volume_24h: 2e7, change_24h: 5, liquidity_usd: 250000,
  source_updated_at: new Date(NOW - 60000).toISOString(), ...overrides,
});

test('rankTop5 memberi peringkat transparan dari field nyata dan membatasi maksimal lima', () => {
  const tokens = Array.from({ length: 7 }, (_, index) => token({ seed: index + 1, change_24h: index * 2, volume_24h: 1e7 + index * 3e6 }));
  const ranked = top5.rankTop5(tokens, { now: NOW });
  assert.equal(ranked.length, 5);
  assert.deepEqual(ranked.map((item) => item.rank), [1, 2, 3, 4, 5]);
  assert.ok(ranked[0].score >= ranked[1].score);
  for (const item of ranked) {
    const sum = item.breakdown.momentum + item.breakdown.volume_to_mcap + (item.breakdown.liquidity || 0) + item.breakdown.freshness + item.breakdown.completeness;
    assert.ok(Math.abs(sum - item.score) < 0.05, 'skor = jumlah breakdown');
    assert.ok(item.confidence >= 0 && item.confidence <= 100);
    assert.ok(['BUY SETUP', 'WAIT', 'AVOID'].includes(item.signal));
    assert.ok(item.reasons.length > 0);
  }
});

test('Data stale, tanpa ID, atau tanpa harga tidak boleh mendapat sinyal BUY SETUP', () => {
  const stale = top5.rankTop5([token({ seed: 9, change_24h: 30, source_updated_at: new Date(NOW - 3 * 3600000).toISOString() })], { now: NOW })[0];
  assert.equal(stale.signal, 'WAIT');
  assert.equal(stale.not_enough_data, true);
  assert.ok(stale.score <= 45);
  const noId = top5.rankTop5([token({ seed: 10, id: '../bad', change_24h: 30 })], { now: NOW })[0];
  assert.equal(noId.signal, 'WAIT');
  const noPrice = top5.rankTop5([token({ seed: 11, price: null, change_24h: 30 })], { now: NOW })[0];
  assert.equal(noPrice.signal, 'WAIT');
});

test('Simbol duplikat tidak menggabungkan dua aset berbeda', () => {
  const ranked = top5.rankTop5([
    token({ seed: 1, id: 'bitcoin', symbol: 'DUP', change_24h: 4 }),
    token({ seed: 2, id: 'ethereum', symbol: 'DUP', change_24h: 3 }),
  ], { now: NOW });
  assert.equal(ranked.length, 2);
  assert.notEqual(ranked[0].id, ranked[1].id);
});

test('buildTradePlan memakai volatilitas histori nyata dan menjaga urutan TP/SL', () => {
  const prices = Array.from({ length: 20 }, (_, i) => [NOW - (20 - i) * 60000, 100 + Math.sin(i) * 2]);
  const plan = top5.buildTradePlan({ price: 100, prices });
  assert.equal(plan.status, 'MECHANICAL_PLAN');
  assert.ok(plan.tp1 < plan.tp2 && plan.tp2 < plan.tp3);
  assert.ok(plan.stop_loss < plan.buy_price);
  assert.ok(plan.buy_zone[0] <= plan.buy_zone[1]);
  assert.ok(plan.risk_reward > 0);
  assert.ok(plan.tp1_pct > 0 && plan.stop_loss_pct < 0);
  assert.match(plan.method, /volatilitas/i);
  assert.match(plan.disclaimer, /bukan prediksi/i);
  assert.match(plan.estimation_note, /tidak diperkirakan/i);
});

test('buildTradePlan menolak data kurang tanpa mengarang angka entry', () => {
  const missing = top5.buildTradePlan({ price: null, prices: [] });
  assert.equal(missing.status, 'NOT_ENOUGH_DATA');
  assert.equal(missing.buy_price, undefined);
  assert.equal(missing.stop_loss, undefined);
  const short = top5.buildTradePlan({ price: 100, prices: [[1, 100], [2, 101]] });
  assert.equal(short.status, 'NOT_ENOUGH_DATA');
  assert.match(short.reason, /kurang/i);
});

test('indicatorSummary hanya menghitung indikator yang cukup datanya', () => {
  const prices = Array.from({ length: 30 }, (_, i) => [i, 100 + i]);
  const result = top5.indicatorSummary(prices);
  assert.ok(result.sma20 > 0);
  assert.ok(result.ema12 > 0);
  assert.ok(result.rsi14 > 0 && result.rsi14 <= 100);
  assert.equal(result.vwap, 'NOT ENOUGH DATA');
  const empty = top5.indicatorSummary([]);
  assert.equal(empty.rsi14, 'NOT ENOUGH DATA');
  assert.equal(empty.macd, 'NOT ENOUGH DATA');
});

test('tidak ada angka acak dalam modul analitik', () => {
  const source = require('node:fs').readFileSync(require.resolve('../public/top5.js'), 'utf8');
  assert.doesNotMatch(source, /Math\.random/);
});
