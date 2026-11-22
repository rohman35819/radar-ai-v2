'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketIntelligenceService } = require('../lib/market-intelligence');

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test('market intelligence fetches six CoinGecko datasets with server-side demo header', async () => {
  const calls = [];
  const service = createMarketIntelligenceService({
    apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/global')) return response({ data: { total_market_cap: { usd: 1000 }, market_cap_change_percentage_24h_usd: 2 } });
      if (url.includes('/coins/markets?vs_currency=usd')) return response([{ id: 'bitcoin', symbol: 'btc', current_price: 50000 }]);
      if (url.includes('/coins/markets?vs_currency=idr')) return response([{ id: 'bitcoin', symbol: 'btc', current_price: 800000000 }]);
      if (url.includes('/search/trending')) return response({ coins: [{ item: { id: 'bitcoin' } }] });
      if (url.includes('/coins/categories?')) return response([{ id: 'layer-1', name: 'Layer 1' }]);
      if (url.includes('/exchanges?')) return response([{ id: 'binance', name: 'Binance' }]);
      throw new Error('unexpected url');
    }
  });
  const result = await service.dashboard();
  assert.equal(result.status, 'success');
  assert.equal(result.partial, false);
  assert.equal(result.data.markets[0].id, 'bitcoin');
  assert.equal(calls.length, 6);
  assert.ok(calls.every((call) => call.options.headers['x-cg-demo-api-key'] === 'test-secret'));
  assert.ok(calls.every((call) => !call.url.includes('test-secret')));
});

test('market intelligence caches datasets and avoids duplicate upstream requests', async () => {
  let calls = 0;
  const service = createMarketIntelligenceService({
    fetchImpl: async (url) => {
      calls += 1;
      if (url.includes('/global?')) return response({ data: {} });
      if (url.includes('/coins/markets?vs_currency=usd')) return response([]);
      if (url.includes('/coins/markets?vs_currency=idr')) return response([]);
      if (url.includes('/search/trending')) return response({ coins: [] });
      if (url.includes('/coins/categories?')) return response([]);
      return response([]);
    }
  });
  await service.dashboard();
  const firstCount = calls;
  await service.dashboard();
  assert.equal(firstCount, 6);
  assert.equal(calls, firstCount);
});

test('market intelligence preserves stale cache and reports partial upstream failure', async () => {
  let fail = false;
  let clock = 0;
  const service = createMarketIntelligenceService({
    now: () => clock,
    fetchImpl: async (url) => {
      if (url.includes('/global?')) {
        if (fail) return response({}, 429);
        return response({ data: { market_cap_change_percentage_24h_usd: 1 } });
      }
      if (url.includes('/coins/markets?vs_currency=usd')) return response([]);
      if (url.includes('/coins/markets?vs_currency=idr')) return response([]);
      if (url.includes('/search/trending')) return response({ coins: [] });
      if (url.includes('/coins/categories?')) return response([]);
      return response([]);
    }
  });
  await service.dashboard();
  fail = true;
  clock = 2 * 60 * 60 * 1000;
  const result = await service.dashboard();
  assert.equal(result.sources.global.ok, false);
  assert.equal(result.sources.global.stale, true);
  assert.equal(result.data.global.data.market_cap_change_percentage_24h_usd, 1);
});

test('chart endpoint validates coin IDs and periods and uses chart cache', async () => {
  let calls = 0;
  const service = createMarketIntelligenceService({
    fetchImpl: async (url) => {
      calls += 1;
      assert.match(url, /coins\/bitcoin\/market_chart\?/);
      return response({ prices: [[1, 2]], market_caps: [[1, 3]], total_volumes: [[1, 4]] });
    }
  });
  const chart = await service.chart('bitcoin', '7');
  assert.equal(chart.data.prices[0][1], 2);
  await service.chart('bitcoin', '7');
  assert.equal(calls, 1);
  await assert.rejects(service.chart('../secret', '7'), (error) => error.code === 'INVALID_COIN_ID');
  await assert.rejects(service.chart('bitcoin', '365'), (error) => error.code === 'INVALID_CHART_RANGE');
});
