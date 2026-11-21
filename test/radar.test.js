'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { screen, fdv, categoryMatcher, joinFundamentals } = require('../lib/screener');
const { parseFeed, validUnlocks } = require('../lib/sources');
const { evaluate } = require('../lib/alerts');
const { createApp, resolveClientIp, createRateLimiter } = require('../server');
const ingest = require('../lib/ingest');

const NOW = Date.parse('2026-11-20T12:00:00Z');

test('rate limit: X-Forwarded-For hanya dipercaya sesuai jumlah proxy tepercaya', () => {
  const req = { socket: { remoteAddress: '::ffff:10.0.0.8' }, headers: { 'x-forwarded-for': '198.51.100.77, 203.0.113.9' } };
  assert.strictEqual(resolveClientIp(req), '::ffff:10.0.0.8');
  assert.strictEqual(resolveClientIp(req, 1), '203.0.113.9');
  assert.strictEqual(resolveClientIp(req, 2), '198.51.100.77');
  assert.strictEqual(resolveClientIp({ socket: req.socket, headers: {} }, 1), '::ffff:10.0.0.8');
});

test('rate limit: tabel identitas dibatasi tanpa menghapus bucket aktif', () => {
  let now = 1000;
  const limited = createRateLimiter({ limit: 2, windowMs: 60000, maxKeys: 2, sweepIntervalMs: 1000, now: () => now });
  assert.strictEqual(limited('client-a'), false);
  assert.strictEqual(limited('client-a'), false);
  assert.strictEqual(limited('client-a'), true);
  assert.strictEqual(limited('client-b'), false);
  assert.strictEqual(limited('client-c'), true); // kapasitas penuh: identitas baru ditolak
  assert.strictEqual(limited('client-a'), true); // bucket aktif tidak pernah dihapus
  now += 61000;
  assert.strictEqual(limited('client-c'), false); // bucket kedaluwarsa dibersihkan dan kapasitas pulih
});

test('storage: file state yang belum ada menghasilkan state awal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-state-'));
  assert.deepStrictEqual(ingest.load({ dataDir: dir }), ingest.emptyState());
});

test('storage: state tersimpan dipulihkan dan JSON rusak tidak di-reset diam-diam', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-state-'));
  const stateFile = path.join(dir, 'state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ tokens: [{ id: 'persisted' }] }));
  assert.strictEqual(ingest.load({ dataDir: dir }).tokens[0].id, 'persisted');
  fs.writeFileSync(stateFile, '{broken');
  assert.throws(() => ingest.load({ dataDir: dir }), SyntaxError);
});

test('storage: EROFS saat atomic rename dipropagasi dan state lama tetap utuh', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-state-'));
  const stateFile = path.join(dir, 'state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ marker: 'old' }));
  const originalRename = fs.renameSync;
  fs.renameSync = () => { const error = new Error('read-only filesystem'); error.code = 'EROFS'; throw error; };
  try {
    assert.throws(() => ingest.save({ dataDir: dir }, { marker: 'new' }), (error) => error.code === 'EROFS');
  } finally {
    fs.renameSync = originalRename;
  }
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(stateFile, 'utf8')), { marker: 'old' });
  assert.ok(!fs.existsSync(stateFile + '.tmp'));
});
const coin = (o) => ({ id: 'a', symbol: 'aa', name: 'A', current_price: 1, market_cap: 5e6, total_volume: 1e6, fully_diluted_valuation: 1e7,
  max_supply: null, last_updated: '2026-11-20T11:55:00Z', price_change_percentage_24h: 2, ...o });

test('FDV null saat max_supply null (bug V2: jadi 0)', () => {
  assert.strictEqual(fdv({ current_price: 5, max_supply: null, fully_diluted_valuation: null }), null);
  assert.strictEqual(fdv({ current_price: 5, max_supply: 10 }), 50);
});
test('screener: filter mcap, volume minimum, data basi diberi flag', () => {
  const r = screen([coin({ id: 'ok' }), coin({ id: 'big', market_cap: 2e8 }), coin({ id: 'dust', market_cap: 500 }),
    coin({ id: 'lowvol', total_volume: 10 }), coin({ id: 'old', last_updated: '2026-11-19T00:00:00Z' }), null, { id: 5 }], { now: NOW });
  assert.deepStrictEqual(r.map((x) => x.id).sort(), ['ok', 'old']);
  assert.ok(r.find((x) => x.id === 'old').flags.includes('stale'));
});
test('kategori DeFiLlama: "Chain" tidak cocok dengan AI', () => {
  const m = categoryMatcher(['AI', 'DePIN']);
  assert.ok(m('AI') && m('depin') && !m('Chain') && !m('Dexs') && !m(undefined));
});
test('join fundamental via gecko_id, tanpa data = null', () => {
  const t = screen([coin({ id: 'tok', market_cap: 1e7 })], { now: NOW });
  const j = joinFundamentals(t, [{ gecko_id: 'tok', slug: 'p', name: 'P', tvl: 5e6, category: 'AI' }], [{ slug: 'p', total24h: 100, total30d: 3000 }], []);
  assert.strictEqual(j.tok.mcap_tvl, 2); assert.strictEqual(j.tok.fees_24h, 100); assert.strictEqual(j.tok.revenue_24h, null);
});
test('RSS: bersihkan HTML, tolak link non-http', () => {
  const xml = `<rss><item><title><![CDATA[Halo <b>AI</b> &amp; co]]></title><link>https://x.com/a</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate></item>
  <item><title>Jahat</title><link>javascript:alert(1)</link></item></rss>`;
  const r = parseFeed(xml, 'x');
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].title, 'Halo AI & co');
});
test('unlock tervalidasi, entri rusak dibuang', () => {
  assert.strictEqual(validUnlocks([{ id: 'a', date: '2026-12-01' }, { id: 1 }, { id: 'b', date: 'x' }]).length, 1);
  assert.throws(() => validUnlocks({}));
});
test('alert: harga, unlock, cooldown, abaikan data basi', () => {
  const cfg = { cooldownH: 6, priceAlertPct: 15, volumeSpikeX: 3, unlockDays: 7 };
  const t = screen([coin({ id: 'x', price_change_percentage_24h: 20 })], { now: NOW });
  const log = {};
  const unl = [{ id: 'x', symbol: 'X', date: '2026-11-22T00:00:00Z' }];
  assert.strictEqual(evaluate({ next: t, unlocks: unl, now: NOW, cfg, log }).length, 2);
  assert.strictEqual(evaluate({ next: t, unlocks: unl, now: NOW + 3600e3, cfg, log }).length, 0);
  assert.strictEqual(evaluate({ next: t, now: NOW + 7 * 3600e3, cfg, log }).length, 1);
  const stale = screen([coin({ id: 's', price_change_percentage_24h: 50, last_updated: '2026-11-01T00:00:00Z' })], { now: NOW });
  assert.strictEqual(evaluate({ next: stale, now: NOW, cfg, log: {} }).length, 0);
});

test('integrasi server (sumber dimock)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  const cfg = { ...ingest.loadConfig(), dataDir: dir, adminToken: 'sekret', feeds: ['https://f.test/rss'], refreshMs: 6e5, tgToken: '', tgChat: '' };
  const fresh = new Date().toISOString();
  const src = {
    fetchAiCoins: async () => [coin({ id: 'tok', last_updated: fresh })],
    fetchLlama: async () => ({ protocols: [{ gecko_id: 'tok', slug: 'p', name: 'P', tvl: 1e6, category: 'AI' }], fees: [], revenue: [] }),
    fetchNews: async () => [{ title: 'T', link: 'https://a.b', source: 's', published_at: fresh, summary: '' }],
    fetchUnlocks: async () => [],
  };
  const app = createApp({ cfg, src });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    assert.strictEqual((await fetch(base + '/api/refresh', { method: 'POST' })).status, 403);
    assert.strictEqual((await fetch(base + '/api/refresh', { method: 'POST', headers: { 'x-admin-token': 'wrong-length' } })).status, 403);
    assert.strictEqual((await fetch(base + '/api/refresh', { method: 'POST', headers: { 'x-admin-token': 'sekret' } })).status, 202);
    await app.refresh();
    const s = await (await fetch(base + '/api/snapshot')).json();
    assert.strictEqual(s.tokens.length, 1); assert.strictEqual(s.tokens[0].fundamental.tvl, 1e6);
    assert.strictEqual(s.stale, false); assert.strictEqual(s.news.length, 1); assert.ok(s.config_needed.telegram);
    assert.strictEqual((await fetch(base + '/')).status, 200);
    assert.strictEqual((await fetch(base + '/manifest.webmanifest')).status, 200);
    assert.strictEqual((await fetch(base + '/..%2Fserver.js')).status, 404);
    assert.strictEqual((await fetch(base + '/api/nope')).status, 404);
    assert.ok(fs.existsSync(path.join(dir, 'state.json')));
  } finally { app.stop(); }
});
test('sumber gagal: data lama dipertahankan, health dicatat, alert health', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  const cfg = { ...ingest.loadConfig(), dataDir: dir, feeds: [], tgToken: '', tgChat: '' };
  const st = ingest.emptyState(); st.tokens = screen([coin({ id: 'keep' })], { now: NOW });
  const boom = async () => { throw new Error('HTTP 429 dari api.coingecko.com'); };
  await ingest.refresh(st, cfg, { fetchAiCoins: boom, fetchLlama: boom, fetchNews: boom, fetchUnlocks: async () => [] });
  assert.strictEqual(st.tokens[0].id, 'keep'); assert.strictEqual(st.health.coingecko.ok, false);
  assert.strictEqual(st.lastOk, null); assert.strictEqual(st.alerts[0].type, 'health');
});

const { volumeSpike, pushHistory } = require('../lib/alerts');
const VCFG = { refreshMs: 600000, volumeSpikeX: 3, minVolumeDelta: 5000, cooldownH: 6, priceAlertPct: 99, unlockDays: 7 };
const series = (vals, gap = 600000) => vals.map((v, i) => ({ t: NOW + i * gap, v, p: 1 }));
test('volume: lonjakan terdeteksi vs median selisih 10 menit', () => {
  const s = series([1e6, 1.01e6, 1.02e6, 1.03e6, 1.04e6, 1.05e6, 1.06e6, 1.07e6, 1.2e6]);
  const r = volumeSpike(s, VCFG);
  assert.ok(r && r.x > 10 && r.minutes === 10);
});
test('volume: tanpa lonjakan, baseline kurang, atau jeda tidak ~10 menit = tidak ada alert', () => {
  assert.strictEqual(volumeSpike(series([1e6, 1.01e6, 1.02e6, 1.03e6, 1.04e6, 1.05e6, 1.06e6, 1.07e6, 1.08e6]), VCFG), null);
  assert.strictEqual(volumeSpike(series([1e6, 1.01e6, 1.2e6]), VCFG), null);
  assert.strictEqual(volumeSpike(series([1e6, 1.01e6, 1.02e6, 1.03e6, 1.04e6, 1.05e6, 1.06e6, 1.07e6, 1.2e6], 3600000), VCFG), null);
  assert.strictEqual(volumeSpike(series([1e6, 1.01e6, 1.02e6, 1.03e6, 1.04e6, 1.05e6, 1.06e6, 1.07e6, 0.9e6]), VCFG), null);
});
test('riwayat dibatasi dan token hilang dibersihkan', () => {
  const h = { gone: [{ t: 1, v: 1 }] };
  const t = screen([coin({ id: 'z' })], { now: NOW });
  for (let i = 0; i < 100; i++) pushHistory(h, t, NOW + i);
  assert.strictEqual(h.z.length, 72); assert.ok(!h.gone);
});
test('data tidak tersedia = null/N/A, bukan 0', () => {
  const r = screen([coin({ id: 'n', fully_diluted_valuation: null, max_supply: null, price_change_percentage_24h: null, current_price: null }),
    coin({ id: 'novol', total_volume: null })], { now: NOW });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].fdv, null); assert.strictEqual(r[0].change_24h, null); assert.strictEqual(r[0].price, null); assert.strictEqual(r[0].change_7d, null);
  const j = joinFundamentals(r, [{ gecko_id: 'n', slug: 'p', name: 'P', tvl: null }], [], []);
  assert.strictEqual(j.n.tvl, null); assert.strictEqual(j.n.fees_24h, null); assert.strictEqual(j.n.mcap_tvl, null);
});

const { toBuckets10m, analyze10m, mapPairs } = require('../lib/exchange');
const MM = 600000, T0 = Math.floor(NOW / MM) * MM; // NOW = batas bucket? pastikan selaras
const kl = (open, q) => [open, '1', '1', '1', '1', '1', open + 299999, String(q), 1];
// buat bucket 10m penuh (2 candle 5m) mulai dari `start`
const mk = (start, q) => [kl(start, q / 2), kl(start + 300000, q / 2)];
const grid = (n, base, lastQ, end) => { const out = []; for (let i = n; i >= 1; i--) out.push(...mk(end - i * MM, i === 1 ? lastQ : base)); return out; };
test('candle: gabung 2x5m ke bucket 10m, buang candle terbuka & bucket tak lengkap', () => {
  const now = T0 + 120000; // 2 menit setelah batas bucket
  const k = [...mk(T0 - MM, 1000), kl(T0 - 2 * MM, 500), ...mk(T0, 900).slice(0, 1)]; // bucket T0-2M cuma 1 candle; candle T0 belum tutup
  const b = toBuckets10m(k, now);
  assert.deepStrictEqual(b.map((x) => [x.start, x.quote]), [[T0 - MM, 1000]]);
});
test('volume 10m asli: lonjakan, tanpa lonjakan, data kurang, bucket terakhir hilang', () => {
  const now = T0 + 90000, o = { minBuckets: 12, spikeX: 3, minUsd: 2000 };
  const spike = analyze10m(toBuckets10m(grid(20, 10000, 90000, T0), now), now, o);
  assert.ok(spike.spike && spike.x === 9 && spike.buckets_used === 19);
  assert.strictEqual(analyze10m(toBuckets10m(grid(20, 10000, 12000, T0), now), now, o).spike, false);
  assert.strictEqual(analyze10m(toBuckets10m(grid(8, 10000, 90000, T0), now), now, o), null); // baseline < 12
  assert.strictEqual(analyze10m(toBuckets10m(grid(20, 10000, 90000, T0 - MM), now), now, o), null); // bucket terakhir tidak ada
  assert.strictEqual(analyze10m(toBuckets10m(grid(20, 0, 5000, T0), now), now, o), null); // median 0 -> tidak cukup
});
test('pair: simbol bentrok ditolak lewat cek harga, duplikat dipilih yang terdekat', () => {
  const toks = [{ id: 'a', symbol: 'AAA', price: 1 }, { id: 'b', symbol: 'AAA', price: 1.05 }, { id: 'c', symbol: 'CCC', price: 5 }, { id: 'd', symbol: 'DDD', price: 1 }];
  const r = mapPairs(toks, new Map([['AAAUSDT', 1.01], ['CCCUSDT', 9]]), 'USDT');
  assert.deepStrictEqual(r.pairs.map((p) => p.id), ['a']); assert.strictEqual(r.mismatched, 1); assert.strictEqual(r.unmapped, 1);
});
test('alert volume_10m: label asli, estimasi ditekan jika ada data candle, estimasi tetap berlabel jika tidak ada', () => {
  const cfg = { cooldownH: 6, priceAlertPct: 99, unlockDays: 7, volumeSpikeX: 3, minVolumeDelta: 5000, refreshMs: 600000 };
  const t = screen([coin({ id: 'x', last_updated: new Date(NOW - 60000).toISOString() })], { now: NOW });
  const hist = { x: series([1e6, 1.01e6, 1.02e6, 1.03e6, 1.04e6, 1.05e6, 1.06e6, 1.07e6, 1.2e6]) };
  const m = { exchange: 'binance', pair: 'XUSDT', bucket_start: '2026-11-20T11:50:00.000Z', volume_usdt: 90000, median_usdt: 10000, x: 9, buckets_used: 19, spike: true };
  const a = evaluate({ next: t, history: hist, vol10m: { x: m }, now: NOW, cfg, log: {} });
  assert.deepStrictEqual(a.map((z) => z.type), ['volume_10m']); assert.match(a[0].msg, /VOLUME ASLI 10 mnt/);
  const b = evaluate({ next: t, history: hist, vol10m: {}, now: NOW + 8 * 600000, cfg, log: {} });
  const hist2 = { x: series([1e6, 1.01e6, 1.02e6, 1.03e6, 1.04e6, 1.05e6, 1.06e6, 1.07e6, 1.2e6]) };
  const c = evaluate({ next: t, history: { x: hist2.x.map((s, i) => ({ ...s, t: NOW - (8 - i) * 600000 })) }, vol10m: {}, now: NOW, cfg, log: {} });
  assert.deepStrictEqual(c.map((z) => z.type), ['volume_est24h']); assert.match(c[0].msg, /ESTIMASI \(bukan volume 10 mnt\)/);
  assert.strictEqual(evaluate({ next: t, vol10m: { x: { ...m, spike: false } }, now: NOW, cfg, log: {} }).length, 0);
});
test('integrasi: snapshot memuat vol10m asli atau null (N/A); kegagalan bursa menghapus data lama', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  const cfg = { ...ingest.loadConfig(), dataDir: dir, feeds: [], tgToken: '', tgChat: '' };
  let fail = false;
  const src = { fetchAiCoins: async () => [coin({ id: 'tok', last_updated: new Date().toISOString() })], fetchLlama: async () => ({ protocols: [], fees: [], revenue: [] }),
    fetchNews: async () => [], fetchUnlocks: async () => [],
    fetchExchange: async () => { if (fail) throw new Error('HTTP 451 dari data-api.binance.vision'); return { metrics: { tok: { exchange: 'binance', pair: 'TOKUSDT', volume_usdt: 5000, x: 1, spike: false } }, stats: { mapped: 1 } }; } };
  const app = createApp({ cfg, src });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    await app.refresh();
    let s = await (await fetch(base + '/api/snapshot')).json();
    assert.strictEqual(s.tokens[0].vol10m.pair, 'TOKUSDT'); assert.strictEqual(s.health.exchange.ok, true);
    fail = true; await app.refresh();
    s = await (await fetch(base + '/api/snapshot')).json();
    assert.strictEqual(s.tokens[0].vol10m, null); assert.strictEqual(s.health.exchange.ok, false);
  } finally { app.stop(); }
});
