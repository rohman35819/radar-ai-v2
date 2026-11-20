'use strict';
// Tes API NYATA (butuh internet). Jalankan: npm run live-check
const src = require('../lib/sources');
const ingest = require('../lib/ingest');
const { screen } = require('../lib/screener');
const cfg = { ...ingest.loadConfig(), maxPages: 1 };
const results = [];
const check = async (name, fn) => { try { results.push([name, true, await fn()]); } catch (e) { results.push([name, false, String(e.message || e)]); } };
(async () => {
  await check('CoinGecko coins/markets (kategori AI)', async () => {
    const rows = await src.fetchAiCoins(cfg);
    if (!rows.length) throw new Error('0 baris');
    const f = rows.filter((r) => r.market_cap != null && r.total_volume != null).length;
    return `${rows.length} baris, ${f} punya mcap+volume, lolos screener: ${screen(rows, cfg).length}`;
  });
  await check('DeFiLlama protocols + fees + revenue', async () => {
    const l = await src.fetchLlama(cfg, () => false);
    if (!l.protocols.length) throw new Error('0 protokol');
    return `${l.protocols.length} protokol ber-gecko_id, ${l.fees.length} fees, ${l.revenue.length} revenue`;
  });
  await check('Binance ticker/price + klines 5m -> bucket 10 menit', async () => {
    const ex = require('../lib/exchange');
    const r = await fetch(cfg.exchangeBase + '/api/v3/ticker/price', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('ticker/price HTTP ' + r.status);
    const rows = await r.json(); if (!Array.isArray(rows) || !rows.length) throw new Error('ticker/price kosong');
    const k = await (await fetch(cfg.exchangeBase + '/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=20', { signal: AbortSignal.timeout(15000) })).json();
    const b = ex.toBuckets10m(k, Date.now()); if (!b.length) throw new Error('0 bucket dari klines');
    return `${rows.length} simbol, ${k.length} candle -> ${b.length} bucket 10m, terakhir $${Math.round(b[b.length - 1].quote)}`;
  });
  for (const u of cfg.feeds) await check('RSS ' + u, async () => { const i = src.parseFeed(await (await fetch(u, { signal: AbortSignal.timeout(15000) })).text(), 'x'); if (!i.length) throw new Error('0 item'); return `${i.length} item`; });
  if (!cfg.feeds.length) results.push(['RSS', false, 'NEWS_FEEDS kosong']);
  for (const [n, ok, m] of results) console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${n}: ${m}`);
  process.exit(results.every((r) => r[1]) ? 0 : 1);
})();
