'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMarketlightService, SUPPORTED_BASES, MIN_BATCH_INTERVAL_MS } = require('../lib/marketlight');

const payloads = {
  derivatives: { base: 'BTC', updatedMs: 1795450000000, oi: { total: 12500000000, change24h: 0.025, byExchange: [{ exchange: 'Binance', symbol: 'BTCUSDT', usd: 8000000000, change24h: 0.03 }] }, funding: { byExchange: [{ exchange: 'Binance', symbol: 'BTCUSDT', rate: 0.0001, intervalHours: 8 }] } },
  liquidations: { fromMs: 1795440000000, toMs: 1795450000000, total: { long: 1200000, short: 900000 }, byExchange: { Binance: { long: 800000, short: 500000 } }, bySymbol: [] },
  fear: { value: 32, label: 'fear', updatedAt: '2026-11-23T17:26:40.000Z', components: [], history: [] }
};
const response = (data, status = 200) => {
  const bytes = Buffer.from(JSON.stringify(data));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => String(bytes.byteLength) },
    body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
    text: async () => { throw new Error('Unbounded text reader must not be used'); }
  };
};
function fixtureFetch(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (overrides.fail && overrides.fail(url)) return response({ error: true }, 503);
    if (String(url).includes('/api/public/derivatives')) return response(overrides.derivatives || payloads.derivatives);
    if (String(url).includes('/liquidations/summary')) return response(overrides.liquidations || payloads.liquidations);
    if (String(url).includes('/api/public/fear-greed')) return response(overrides.fear || payloads.fear);
    throw new Error('Unexpected Marketlight URL');
  };
  return { fetchImpl, calls };
}

test('Marketlight snapshot reads only one selected coin and returns three attributed feeds', async () => {
  const fixture = fixtureFetch();
  const service = createMarketlightService({ fetchImpl: fixture.fetchImpl, now: () => 1795450000000 });
  const result = await service.snapshot('btc', 24);
  assert.equal(result.status, 'success');
  assert.equal(result.provider, 'Marketlight public derivatives API');
  assert.equal(result.license, 'CC BY 4.0');
  assert.equal(result.data.derivatives.oi.total, 12500000000);
  assert.equal(result.data.liquidations.total.long, 1200000);
  assert.equal(result.data.fear_greed.value, 32);
  assert.equal(fixture.calls.length, 3);
  assert.ok(fixture.calls.every((call) => call.url.startsWith('https://marketlight.ai/')));
  assert.ok(fixture.calls.every((call) => call.options.method === 'GET' && call.options.redirect === 'error'));
  assert.ok(fixture.calls.every((call) => !('authorization' in call.options.headers)));
  assert.equal(result.attribution.url, 'https://marketlight.ai');
});

test('Marketlight cache avoids repeated provider requests', async () => {
  const fixture = fixtureFetch();
  const service = createMarketlightService({ fetchImpl: fixture.fetchImpl, now: () => 1795450000000 });
  await service.snapshot('BTC', 24);
  const cached = await service.snapshot('BTC', 24);
  assert.equal(fixture.calls.length, 3);
  assert.equal(cached.cached, true);
  assert.equal(cached.status, 'success');
});

test('Marketlight rejects unsupported assets and hours before network access', async () => {
  const fixture = fixtureFetch();
  const service = createMarketlightService({ fetchImpl: fixture.fetchImpl });
  await assert.rejects(service.snapshot('UNKNOWN', 24), (error) => error.code === 'MARKETLIGHT_UNSUPPORTED_BASE' && error.status === 400);
  await assert.rejects(service.snapshot('BTC', 2), (error) => error.code === 'MARKETLIGHT_INVALID_HOURS' && error.status === 400);
  assert.equal(fixture.calls.length, 0);
  assert.equal(SUPPORTED_BASES.has('BTC'), true);
});

test('Marketlight keeps valid feeds when one upstream payload is malformed', async () => {
  const fixture = fixtureFetch({ fear: { value: 120, label: 'invalid', updatedAt: '2026-11-23T17:26:40Z' } });
  const service = createMarketlightService({ fetchImpl: fixture.fetchImpl, now: () => 1795450000000 });
  const result = await service.snapshot('BTC', 24);
  assert.equal(result.status, 'success');
  assert.equal(result.partial, true);
  assert.equal(result.sources.derivatives.ok, true);
  assert.equal(result.sources.liquidations.ok, true);
  assert.equal(result.sources.fear_greed.ok, false);
  assert.equal(result.data.fear_greed, null);
});

test('Marketlight global cooldown prevents bursts for different assets', async () => {
  const fixture = fixtureFetch();
  let now = 1795450000000;
  const service = createMarketlightService({ fetchImpl: fixture.fetchImpl, now: () => now });
  await service.snapshot('BTC', 24);
  const cooled = await service.snapshot('ETH', 24);
  assert.equal(cooled.status, 'success');
  assert.equal(cooled.partial, true);
  assert.equal(cooled.sources.liquidations.stale, true);
  assert.equal(fixture.calls.length, 3);
  now += MIN_BATCH_INTERVAL_MS;
  const result = await service.snapshot('ETH', 24);
  assert.equal(result.status, 'success');
  assert.equal(fixture.calls.length, 4);
});

test('Marketlight response body is streamed and cancelled at the 1 MiB cap', async () => {
  let cancelled = false;
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); controller.enqueue(new Uint8Array(1)); },
      cancel() { cancelled = true; }
    }),
    text: async () => { throw new Error('Unbounded text reader must not be used'); }
  });
  const service = createMarketlightService({ fetchImpl, now: () => 1795450000000 });
  const result = await service.snapshot('BTC', 24);
  assert.equal(result.status, 'error');
  assert.equal(result.sources.derivatives.error, 'MARKETLIGHT_RESPONSE_TOO_LARGE');
  assert.equal(cancelled, true);
});

test('Marketlight rejects responses without a streaming body', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(payloads.derivatives) });
  const service = createMarketlightService({ fetchImpl, now: () => 1795450000000 });
  const result = await service.snapshot('BTC', 24);
  assert.equal(result.status, 'error');
  assert.equal(result.sources.derivatives.error, 'MARKETLIGHT_INVALID_RESPONSE_BODY');
});
