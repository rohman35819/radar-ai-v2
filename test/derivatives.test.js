'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDerivativesService } = require('../lib/derivatives');

const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

test('Binance derivatives returns funding, open interest, OI history and taker flow', async () => {
  const calls = [];
  const service = createDerivativesService({ fetchImpl: async (url) => {
    calls.push(url);
    if (url.includes('premiumIndex')) return response({ symbol: 'BTCUSDT', lastFundingRate: '0.0001', markPrice: '65000' });
    if (url.includes('/openInterest?')) return response({ symbol: 'BTCUSDT', openInterest: '123' });
    if (url.includes('openInterestHist')) return response([{ sumOpenInterestValue: '1000000', timestamp: 1 }]);
    if (url.includes('takerlongshortRatio')) return response([{ buyVol: '10', sellVol: '8', buySellRatio: '1.25', timestamp: 1 }]);
    throw new Error('unexpected endpoint');
  }});
  const result = await service.snapshot('btcusdt');
  assert.equal(result.status, 'success');
  assert.equal(result.symbol, 'BTCUSDT');
  assert.equal(result.data.funding.lastFundingRate, '0.0001');
  assert.equal(result.data.open_interest.openInterest, '123');
  assert.equal(result.data.taker_flow[0].buySellRatio, '1.25');
  assert.equal(calls.length, 4);
  assert.ok(calls.every((url) => url.startsWith('https://fapi.binance.com/')));
});

test('derivatives cache prevents duplicate requests and shares in-flight work', async () => {
  let calls = 0;
  const service = createDerivativesService({ fetchImpl: async (url) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (url.includes('premiumIndex')) return response({ lastFundingRate: '0.0001', markPrice: '65000' });
    if (url.includes('/openInterest?')) return response({ openInterest: '123' });
    return response([{ timestamp: 1 }]);
  }});
  const [a, b] = await Promise.all([service.snapshot('ETHUSDT'), service.snapshot('ETHUSDT')]);
  assert.equal(calls, 4);
  assert.equal(a.status, 'success');
  assert.equal(b.status, 'success');
  const cached = await service.snapshot('ETHUSDT');
  assert.equal(cached.cached, true);
  assert.equal(calls, 4);
});

test('derivatives returns partial source health without fabricating missing values', async () => {
  const service = createDerivativesService({ fetchImpl: async (url) => url.includes('premiumIndex') ? response({ lastFundingRate: '0.01', markPrice: '100' }) : response({}, 429) });
  const result = await service.snapshot('SOLUSDT');
  assert.equal(result.status, 'success');
  assert.equal(result.partial, true);
  assert.equal(result.data.open_interest, null);
  assert.equal(result.sources.open_interest.ok, false);
});

test('derivatives rejects invalid symbols before network access', async () => {
  let calls = 0;
  const service = createDerivativesService({ fetchImpl: async () => { calls += 1; return response({}); } });
  await assert.rejects(service.snapshot('../etc'), (error) => error.code === 'INVALID_FUTURES_SYMBOL' && error.status === 400);
  await assert.rejects(service.snapshot('BTCUSD'), (error) => error.code === 'INVALID_FUTURES_SYMBOL');
  assert.equal(calls, 0);
});


test('derivatives rejects malformed successful upstream payloads as partial unavailable data', async () => {
  const service = createDerivativesService({ fetchImpl: async (url) => {
    if (url.includes('premiumIndex')) return response({ symbol: 'BTCUSDT' });
    if (url.includes('/openInterest?')) return response({ symbol: 'BTCUSDT', openInterest: '12' });
    if (url.includes('openInterestHist')) return response([]);
    return response([]);
  }});
  const result = await service.snapshot('BTCUSDT');
  assert.equal(result.status, 'success');
  assert.equal(result.partial, true);
  assert.equal(result.data.funding, null);
  assert.equal(result.sources.funding.error, 'BINANCE_FUTURES_INVALID_RESPONSE');
  assert.equal(result.data.open_interest.openInterest, '12');
});

test('derivatives does not cache a fully failed snapshot', async () => {
  let calls = 0;
  const service = createDerivativesService({ fetchImpl: async () => { calls++; return response({}, 503); } });
  const first = await service.snapshot('BTCUSDT');
  const second = await service.snapshot('BTCUSDT');
  assert.equal(first.status, 'error');
  assert.equal(second.status, 'error');
  assert.equal(calls, 8);
});

test('derivatives cache is bounded and evicts least-recently-used symbols', async () => {
  const { MAX_CACHE_ENTRIES } = require('../lib/derivatives');
  let calls = 0;
  const service = createDerivativesService({ fetchImpl: async (url) => {
    calls++;
    if (url.includes('premiumIndex')) return response({ lastFundingRate: '0.001', markPrice: '1' });
    if (url.includes('/openInterest?')) return response({ openInterest: '1' });
    return response([]);
  }});
  for (let i = 0; i <= MAX_CACHE_ENTRIES; i++) await service.snapshot('C' + String(i).padStart(3, '0') + 'USDT');
  assert.equal(calls, (MAX_CACHE_ENTRIES + 1) * 4);
  await service.snapshot('C000USDT');
  assert.equal(calls, (MAX_CACHE_ENTRIES + 2) * 4);
  await service.snapshot('C100USDT');
  assert.equal(calls, (MAX_CACHE_ENTRIES + 2) * 4);
});
