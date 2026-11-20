'use strict';
// Volume transaksi ASLI per 10 menit dari candle 5m Binance Spot (endpoint publik data-only).
// Binance tidak menyediakan interval 10m, jadi 2 candle 5m digabung pada batas 10 menit UTC.
const M = 600000;
const num = (v) => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) ? n : null; };

async function getJ(url, timeout = 12000) {
  const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`HTTP ${r.status} dari ${new URL(url).host}`);
  return r.json();
}

// kline: [openTime, o, h, l, c, baseVol, closeTime, quoteVol, trades, ...]. Hanya candle yang sudah tutup;
// bucket valid hanya jika kedua candle 5m ada (candle hilang tidak dianggap 0).
function toBuckets10m(klines, now = Date.now()) {
  const map = new Map();
  for (const k of Array.isArray(klines) ? klines : []) {
    if (!Array.isArray(k)) continue;
    const open = k[0], close = k[6], q = num(k[7]);
    if (!Number.isFinite(open) || !Number.isFinite(close) || q === null || close >= now) continue;
    const b = open - (open % M);
    const e = map.get(b) || { start: b, quote: 0, n: 0 };
    e.quote += q; e.n++; map.set(b, e);
  }
  return [...map.values()].filter((e) => e.n === 2).sort((a, b) => a.start - b.start);
}

// Kembalikan null jika data belum cukup. Sinyal (spike) hanya jika bucket terakhir tertutup, baseline cukup, median > 0.
function analyze10m(buckets, now, { minBuckets = 12, spikeX = 3, minUsd = 2000, lookback = 36 } = {}) {
  const lastStart = Math.floor(now / M) * M - M;
  const cur = buckets[buckets.length - 1];
  if (!cur || cur.start !== lastStart) return null;
  const base = buckets.slice(0, -1).filter((b) => b.start >= lastStart - lookback * M).map((b) => b.quote).sort((a, b) => a - b);
  if (base.length < minBuckets) return null;
  const med = base[Math.floor(base.length / 2)];
  if (!(med > 0)) return null;
  const x = cur.quote / med;
  return { bucket_start: new Date(cur.start).toISOString(), volume_usdt: cur.quote, median_usdt: med, x, buckets_used: base.length,
    spike: x >= spikeX && cur.quote >= minUsd };
}

// Peta token CoinGecko -> pair bursa. Simbol bisa bentrok antar token, jadi harga bursa harus dalam 10% harga CoinGecko.
function mapPairs(tokens, prices, quote = 'USDT') {
  const best = new Map(); let unmapped = 0, mismatched = 0;
  for (const t of tokens) {
    const pair = t.symbol + quote, ex = prices.get(pair);
    if (ex === undefined) { unmapped++; continue; }
    if (!(t.price > 0) || !(ex > 0) || Math.abs(ex - t.price) / t.price > 0.1) { mismatched++; continue; }
    const diff = Math.abs(ex - t.price) / t.price, cur = best.get(pair);
    if (!cur || diff < cur.diff) best.set(pair, { id: t.id, pair, diff });
  }
  return { pairs: [...best.values()], unmapped, mismatched };
}

async function fetchExchange(cfg, tokens, now = Date.now()) {
  const rows = await getJ(`${cfg.exchangeBase}/api/v3/ticker/price`);
  if (!Array.isArray(rows) || (rows.length && !rows.every((r) => r && typeof r.symbol === 'string' && 'price' in r))) throw new Error('Format ticker/price Binance tidak valid');
  const prices = new Map(rows.map((r) => [r.symbol, num(r.price)]));
  const top = [...tokens].sort((a, b) => b.volume_24h - a.volume_24h).slice(0, cfg.maxExchTokens);
  const { pairs, unmapped, mismatched } = mapPairs(top, prices, cfg.exchQuote);
  const metrics = {}; let failed = 0, insufficient = 0, i = 0, lastErr = '';
  const worker = async () => {
    while (i < pairs.length) {
      const p = pairs[i++];
      try {
        const k = await getJ(`${cfg.exchangeBase}/api/v3/klines?symbol=${encodeURIComponent(p.pair)}&interval=5m&limit=${cfg.exchLimit}`);
        const a = analyze10m(toBuckets10m(k, now), now, { minBuckets: cfg.vol10MinBuckets, spikeX: cfg.volumeSpikeX, minUsd: cfg.vol10MinUsd });
        if (a) metrics[p.id] = { exchange: 'binance', pair: p.pair, quote: cfg.exchQuote, ...a }; else insufficient++;
      } catch (e) { failed++; lastErr = String(e.message || e); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(cfg.exchConcurrency, pairs.length) }, worker));
  if (pairs.length && failed === pairs.length) throw new Error('Semua permintaan klines gagal: ' + lastErr);
  return { metrics, stats: { tokens: tokens.length, mapped: pairs.length, unmapped, price_mismatch: mismatched, insufficient_data: insufficient, failed, at: new Date(now).toISOString() } };
}
module.exports = { toBuckets10m, analyze10m, mapPairs, fetchExchange };
