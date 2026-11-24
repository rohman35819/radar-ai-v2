'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze10m } = require('../lib/exchange');
const { robustSpike, scenario } = require('../lib/experiments/volume-spike-robust');

test('Eksperimen: lonjakan tunggal tetap terdeteksi kedua metode', () => {
  const { buckets, now } = scenario(() => 1000, 24, 6000);
  const plain = analyze10m(buckets, now);
  const robust = robustSpike(buckets, now);
  assert.equal(plain.spike, true);
  assert.equal(robust.robust_spike, true);
});

test('Eksperimen: baseline dengan lonjakan periodik memicu false positive pada median saja', () => {
  const { buckets, now } = scenario((i) => (i % 4 === 3 ? 4000 : 1000), 24, 4000);
  const plain = analyze10m(buckets, now);
  const robust = robustSpike(buckets, now);
  assert.equal(plain.spike, true, 'median-only menganggap lonjakan berulang sebagai anomali');
  assert.equal(robust.robust_spike, false, 'gate P90 menolak nilai yang sudah umum di baseline');
  assert.equal(robust.baseline_p90, 4000);
});

test('Eksperimen: lonjakan besar di atas baseline bervariasi tetap lolos gate dispersi', () => {
  const { buckets, now } = scenario((i) => (i % 2 === 0 ? 800 : 1400), 24, 5000);
  const robust = robustSpike(buckets, now);
  assert.equal(robust.robust_spike, true);
  assert.ok(robust.robust_z > 3);
});

test('Eksperimen: data kurang menghasilkan null, bukan sinyal', () => {
  const { buckets, now } = scenario(() => 1000, 6, 9000);
  assert.equal(robustSpike(buckets, now), null);
});
