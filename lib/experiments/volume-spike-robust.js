'use strict';
// EKSPERIMEN (bukan kode produksi): deteksi spike volume 10m dengan gate dispersi.
// Hipotesis: median saja menghasilkan false positive ketika baseline memuat lonjakan
// periodik. Menambahkan P90 dan robust z-score (MAD) menekan kasus itu tanpa
// menghilangkan lonjakan tunggal yang nyata.
const { analyze10m } = require('../exchange');

const M = 600000;

function robustStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  return {
    median,
    mad: deviations[Math.floor(deviations.length / 2)],
    p90: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))],
  };
}

function robustSpike(buckets, now, options = {}) {
  const { minBuckets = 12, spikeX = 3, minUsd = 2000, lookback = 36, madZ = 3, p90Factor = 1 } = options;
  const current = analyze10m(buckets, now, { minBuckets, spikeX, minUsd, lookback });
  if (!current) return null;
  const lastStart = current.bucket_start && Date.parse(current.bucket_start);
  const baseline = buckets
    .filter((b) => b.start !== lastStart && b.start >= lastStart - lookback * M)
    .map((b) => b.quote);
  const stats = robustStats(baseline);
  if (!stats || !(stats.median > 0)) return null;
  const robustZ = stats.mad > 0 ? (0.6745 * (current.volume_usdt - stats.median)) / stats.mad : Infinity;
  const aboveP90 = current.volume_usdt > stats.p90 * p90Factor;
  return {
    ...current,
    median_abs_deviation: stats.mad,
    baseline_p90: stats.p90,
    robust_z: Number.isFinite(robustZ) ? Number(robustZ.toFixed(3)) : null,
    robust_spike: current.spike && aboveP90 && (stats.mad === 0 || robustZ >= madZ),
  };
}

// Fixture sintetis untuk perbandingan. Bukan data pasar nyata.
function scenario(pattern, count = 24, currentQuote = 4000) {
  const lastStart = Math.floor(1_700_000_000_000 / M) * M;
  const buckets = [];
  for (let i = 0; i < count; i++) {
    const quote = pattern(i);
    buckets.push({ start: lastStart - (count - i) * M, quote });
  }
  buckets.push({ start: lastStart, quote: currentQuote });
  return { buckets, now: lastStart + M + 1000 };
}

module.exports = { robustStats, robustSpike, scenario };
