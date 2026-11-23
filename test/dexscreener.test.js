'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDexScreenerService } = require('../lib/dexscreener');

const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

test('DEX Screener scanner combines latest profiles and boosts, enriches pair metrics, and caches', async () => {
  let calls = [];
  const service = createDexScreenerService({
    now: () => 1000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/token-profiles/latest/v1')) return response([{ chainId: 'solana', tokenAddress: 'A'.repeat(32), url: 'https://dexscreener.com/solana/pair', description: 'Test token' }]);
      if (url.endsWith('/token-boosts/latest/v1')) return response([{ chainId: 'solana', tokenAddress: 'A'.repeat(32), amount: 10 }]);
      if (url.endsWith('/token-boosts/top/v1')) return response([]);
      if (url.includes('/tokens/v1/solana/')) return response([{
        chainId: 'solana', dexId: 'raydium', pairAddress: 'P'.repeat(32), url: 'https://dexscreener.com/solana/pair',
        baseToken: { address: 'A'.repeat(32), name: 'Alpha', symbol: 'ALP' }, priceUsd: '1.25',
        volume: { h24: 50000 }, liquidity: { usd: 25000 }, txns: { h24: { buys: 120, sells: 80 } },
        priceChange: { h24: 12 }, pairCreatedAt: 1700000000000, marketCap: 100000, fdv: 120000
      }]);
      throw new Error('unexpected URL ' + url);
    }
  });
  const first = await service.scanner();
  assert.equal(first.status, 'success');
  assert.equal(first.data.length, 1);
  assert.equal(first.data[0].token_symbol, 'ALP');
  assert.equal(first.data[0].volume_24h_usd, 50000);
  assert.equal(first.data[0].buys_24h, 120);
  assert.equal(first.data[0].sells_24h, 80);
  assert.equal(first.data[0].boosted, true);
  assert.equal(first.data[0].radar_activity_score > 0, true);
  assert.ok(calls.every((call) => call.options.redirect === 'error'));
  assert.equal((await service.scanner()).cached, true);
  assert.equal(calls.length, 4);
});

test('DEX Screener scanner keeps partial source failures visible and does not invent missing metrics', async () => {
  const service = createDexScreenerService({
    fetchImpl: async (url) => {
      if (url.endsWith('/token-profiles/latest/v1')) return response([], 429);
      if (url.endsWith('/token-boosts/latest/v1')) return response([{ chainId: 'solana', tokenAddress: 'B'.repeat(32), amount: 3 }]);
      if (url.endsWith('/token-boosts/top/v1')) return response([]);
      if (url.includes('/tokens/v1/')) return response([]);
      throw new Error('unexpected URL');
    }
  });
  const result = await service.scanner();
  assert.equal(result.status, 'success');
  assert.equal(result.partial, true);
  assert.equal(result.sources.profiles.ok, false);
  assert.equal(result.data[0].price_usd, null);
  assert.equal(result.data[0].volume_24h_usd, null);
});

test('DEX Screener rejects malformed token identifiers before building pair URL', async () => {
  let pairCalls = 0;
  const service = createDexScreenerService({
    fetchImpl: async (url) => {
      if (url.endsWith('/token-profiles/latest/v1')) return response([{ chainId: '../evil', tokenAddress: 'C'.repeat(32) }]);
      if (url.endsWith('/token-boosts/latest/v1')) return response([]);
      if (url.endsWith('/token-boosts/top/v1')) return response([]);
      if (url.includes('/tokens/v1/')) pairCalls += 1;
      return response([]);
    }
  });
  const result = await service.scanner();
  assert.equal(result.data.length, 0);
  assert.equal(pairCalls, 0);
});

test('DEX Screener score is null when no measurable market data exists', () => {
  const result = await createDexScreenerService({ fetchImpl: async (url) => {
    if (url.endsWith('/token-profiles/latest/v1')) return response([{ chainId: 'solana', tokenAddress: 'D'.repeat(32) }]);
    if (url.endsWith('/token-boosts/latest/v1') || url.endsWith('/token-boosts/top/v1')) return response([]);
    if (url.includes('/tokens/v1/')) return response([{ baseToken: { address: 'D'.repeat(32) }, volume: { h24: null }, liquidity: { usd: null }, priceChange: { h24: null }, marketCap: null, fdv: null, txns: { h24: { buys: null, sells: null } } }]);
    throw new Error('unexpected URL');
  }}).scanner();
  assert.equal(result.data[0].radar_activity_score, null);
  assert.equal(result.data[0].volume_24h_usd, null);
  assert.equal(result.data[0].liquidity_usd, null);
  assert.equal(result.data[0].market_cap_usd, null);
  assert.equal(result.data[0].fdv_usd, null);
});
