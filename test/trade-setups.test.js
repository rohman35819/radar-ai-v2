'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTradeSetupService, analyzeCandidate } = require('../lib/trade-setups');

const NOW = 1_800_000_000_000;
function candles({ rising = true, volumeSpike = true } = {}) {
  const rows = [];
  let price = 100;
  for (let i = 0; i < 80; i++) {
    price = rising ? price * (i % 3 === 2 ? 0.9975 : 1.002) : 100;
    const openTime = NOW - (80 - i) * 60 * 60 * 1000;
    const closeTime = openTime + 60 * 60 * 1000 - 1;
    const volume = volumeSpike && i >= 75 ? 300 : 100;
    rows.push([openTime, price * 0.999, price * 1.004, price * 0.996, price, volume, closeTime]);
  }
  return rows;
}
function response(payload) { return { ok: true, status: 200, json: async () => payload }; }

test('trade setup derives entry, stop loss and three risk-multiple targets from closed 1h candles', async () => {
  const calls = [];
  const service = createTradeSetupService({
    now: () => NOW,
    fetchImpl: async (url) => {
      const parsed = new URL(url); calls.push(parsed.pathname);
      if (parsed.pathname.endsWith('/exchangeInfo')) return response({ symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' }] });
      if (parsed.pathname.endsWith('/premiumIndex')) return response([{ symbol: 'BTCUSDT', markPrice: '104.2' }]);
      if (parsed.pathname.endsWith('/klines')) return response(candles());
      throw new Error('unexpected endpoint');
    }
  });
  const result = await service.scan([{ id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', market_cap_rank: 1, price_change_percentage_24h: 2, price_change_percentage_7d_in_currency: 4 }]);
  assert.equal(result.status, 'success');
  assert.equal(result.setup.symbol, 'BTCUSDT');
  assert.equal(result.setup.direction, 'LONG');
  assert.ok(result.setup.stop_loss < result.setup.entry);
  assert.ok(result.setup.tp1 > result.setup.entry);
  assert.ok(result.setup.tp2 > result.setup.tp1);
  assert.ok(result.setup.tp3 > result.setup.tp2);
  assert.ok(result.setup.score <= 100);
  assert.ok(calls.includes('/fapi/v1/klines'));
});

test('trade setup refuses weak or non-trending candidates instead of inventing a signal', async () => {
  const result = analyzeCandidate(
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', price_change_percentage_24h: 0, price_change_percentage_7d_in_currency: 0 },
    'BTCUSDT', 100, candles({ rising: false, volumeSpike: false }), NOW
  );
  assert.equal(result, null);
});

test('trade setup rejects ambiguous ticker mappings and returns no setup', async () => {
  const service = createTradeSetupService({
    now: () => NOW,
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/exchangeInfo')) return response({ symbols: [
        { symbol: 'ABCUSDT', baseAsset: 'ABC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' },
        { symbol: 'ABCUSDT2', baseAsset: 'ABC', quoteAsset: 'USDT', contractType: 'PERPETUAL', status: 'TRADING' }
      ] });
      throw new Error('prices should not be requested for ambiguous ticker');
    }
  });
  const result = await service.scan([{ id: 'abc', name: 'ABC', symbol: 'abc', market_cap_rank: 1 }]);
  assert.equal(result.status, 'no_setup');
  assert.equal(result.candidates_checked, 0);
});
