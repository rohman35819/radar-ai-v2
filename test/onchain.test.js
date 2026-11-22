'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ingest = require('../lib/ingest');
const { createApp } = require('../server');
const { normalizeNewPools, fetchEarlyGems } = require('../lib/onchain');

const now = Date.parse('2026-11-22T12:00:00Z');
function payload(overrides = {}) {
  return {
    data: [{
      id: 'solana_pool123', type: 'pool',
      attributes: {
        address: 'Pool123', name: 'MEME / SOL', pool_created_at: '2026-11-22T10:00:00Z',
        base_token_price_usd: '0.0000123', reserve_in_usd: '25000', volume_usd: { h24: '12000' },
        market_cap_usd: null, fdv_usd: '900000', price_change_percentage: { h24: '12.5' },
        transactions: { h24: { buys: '120', sells: '80' } }
      },
      relationships: {
        base_token: { data: { id: 'solana_token123' } },
        network: { data: { id: 'solana' } },
        dex: { data: { id: 'solana_raydium' } }
      }
    }],
    included: [
      { id: 'solana_token123', type: 'token', attributes: { address: 'Token123', name: 'Meme Coin', symbol: 'MEME', coingecko_coin_id: null } },
      { id: 'solana', type: 'network', attributes: { name: 'Solana' } },
      { id: 'solana_raydium', type: 'dex', attributes: { name: 'Raydium' } }
    ],
    ...overrides
  };
}

test('onchain: normalisasi pool menyertakan chain, alamat, umur, volume dan flag market cap belum terverifikasi', () => {
  const rows = normalizeNewPools(payload(), now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, 'MEME');
  assert.equal(rows[0].network, 'Solana');
  assert.equal(rows[0].liquidity_usd, 25000);
  assert.equal(rows[0].volume_24h_usd, 12000);
  assert.equal(rows[0].age_hours, 2);
  assert.equal(rows[0].price_change_24h_pct, 12.5);
  assert.equal(rows[0].discovery_label, 'NEW POOL');
  assert.ok(rows[0].risk_flags.includes('market_cap_unverified'));
  assert.match(rows[0].pool_url, /^https:\/\/www\.geckoterminal\.com\/solana\/pools\//);
});

test('onchain: data hilang tidak dipalsukan menjadi nol dan duplikat dihapus', () => {
  const p = payload();
  p.data.push({ ...p.data[0] });
  p.data[0].attributes.reserve_in_usd = null;
  p.data[0].attributes.volume_usd = {};
  const rows = normalizeNewPools(p, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].liquidity_usd, null);
  assert.equal(rows[0].volume_24h_usd, null);
  assert.ok(rows[0].risk_flags.includes('liquidity_unknown'));
  assert.ok(rows[0].risk_flags.includes('volume_unknown'));
  assert.equal(rows[0].price_change_24h_pct, 12.5);
  p.data[0].attributes.price_change_percentage.h24 = '-8.25';
  assert.equal(normalizeNewPools(p, now)[0].price_change_24h_pct, -8.25);
});

test('onchain: invalid payload ditolak', () => {
  assert.throws(() => normalizeNewPools({ data: {} }), (error) => error.code === 'ONCHAIN_INVALID_RESPONSE');
});

test('onchain: fetch membatasi halaman dan memakai demo key hanya di server', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return payload();
  };
  const result = await fetchEarlyGems({ cgKey: 'demo-secret-not-logged', onchainPages: 5 }, request);
  assert.equal(result.items.length, 1);
  assert.equal(calls.length, 2); // satu halaman new pools + satu halaman trending
  assert.match(calls[0].url, /include=base_token%2Cquote_token%2Cdex%2Cnetwork/);
  assert.match(calls[1].url, /trending_pools/);
  assert.match(calls[1].url, /duration=24h/);
  assert.equal(result.trending_pool_count, 1);
  assert.equal(result.items[0].is_trending, true);
  assert.equal(result.items[0].discovery_label, 'NEW POOL');
  assert.equal(calls[0].options.headers['x-cg-demo-api-key'], 'demo-secret-not-logged');
  assert.equal(calls[1].options.headers['x-cg-demo-api-key'], 'demo-secret-not-logged');
});

test('onchain ingest: cache pool baru, pertahankan cache lama saat sumber gagal, dan snapshot menyajikan metadata', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-onchain-'));
  const cfg = { ...ingest.loadConfig(), dataDir: dir, feeds: [], tgToken: '', tgChat: '', exchEnabled: false, earlyGemsEnabled: true };
  const state = ingest.emptyState();
  const pool = normalizeNewPools(payload(), now)[0];
  const src = {
    fetchAiCoins: async () => [],
    fetchLlama: async () => ({ protocols: [], fees: [], revenue: [] }),
    fetchNews: async () => [],
    fetchUnlocks: async () => [],
    fetchEarlyGems: async () => ({ items: [pool], fetched_at: new Date(now).toISOString(), source: 'test', pages_requested: 1 })
  };
  await ingest.refresh(state, cfg, src);
  assert.equal(state.earlyGems.length, 1);
  assert.equal(state.health.onchain.ok, true);
  assert.equal(state.earlyGemsMeta.pool_count, 1);
  const app = createApp({ cfg, state });
  await new Promise((resolve) => app.server.listen(0, resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/api/snapshot`);
    const snapshot = await response.json();
    assert.equal(snapshot.early_gems.length, 1);
    assert.equal(snapshot.early_gems_meta.source, 'test');
  } finally { app.stop(); }
  src.fetchEarlyGems = async () => { const error = new Error('rate limited'); error.code = 'ONCHAIN_RATE_LIMITED'; throw error; };
  await ingest.refresh(state, cfg, src);
  assert.equal(state.earlyGems.length, 1);
  assert.equal(state.health.onchain.ok, false);
  assert.equal(state.health.onchain.error, 'ONCHAIN_RATE_LIMITED');
  assert.equal(state.earlyGemsMeta.pool_count, 1);
});

test('onchain: trending failure is partial and does not discard newly discovered pools', async () => {
  const request = async (url) => {
    if (url.includes('/trending_pools')) { const error = new Error('rate limited'); error.code = 'ONCHAIN_RATE_LIMITED'; throw error; }
    return payload();
  };
  const result = await fetchEarlyGems({ cgKey: '', onchainPages: 1 }, request);
  assert.equal(result.items.length, 1);
  assert.equal(result.trending_pool_count, 0);
  assert.equal(result.trending_error, 'ONCHAIN_RATE_LIMITED');
  assert.equal(result.items[0].is_trending, false);
});
