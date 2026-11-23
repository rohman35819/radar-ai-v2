'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFredService, SERIES } = require('../lib/fred');
const { createApp } = require('../server');

const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data
});

test('FRED service fails closed without an API key and performs no network calls', async () => {
  let calls = 0;
  const service = createFredService({ fetchImpl: async () => { calls += 1; return response({ observations: [] }); } });
  const result = await service.snapshot();
  assert.equal(result.status, 'unconfigured');
  assert.equal(result.configured, false);
  assert.equal(calls, 0);
});

test('FRED service fetches only the curated series and normalizes observations without inventing zero', async () => {
  const calls = [];
  const service = createFredService({
    apiKey: 'test-fred-key',
    now: () => 1700000000000,
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return response({ observations: [
        { date: '2026-01-02', value: '.' },
        { date: '2026-01-01', value: '3.25' }
      ] });
    }
  });
  const result = await service.snapshot();
  assert.equal(result.status, 'success');
  assert.equal(result.series.length, SERIES.length);
  assert.equal(calls.length, SERIES.length);
  assert.ok(calls.every((call) => call.url.origin === 'https://api.stlouisfed.org'));
  assert.ok(calls.every((call) => call.url.pathname === '/fred/series/observations'));
  assert.ok(calls.every((call) => call.url.searchParams.get('file_type') === 'json'));
  assert.ok(calls.every((call) => call.url.searchParams.get('api_key') === 'test-fred-key'));
  assert.ok(calls.every((call) => call.options.redirect === 'error'));
  assert.equal(result.series[0].latest.date, '2026-01-02');
  assert.equal(result.series[0].latest.value, null);
  assert.equal(result.series[0].observations[0].value, 3.25);
  assert.equal(JSON.stringify(result).includes('test-fred-key'), false);
  assert.equal(JSON.stringify(result).includes('api_key'), false);
});

test('FRED service caches successful series and deduplicates concurrent snapshots', async () => {
  let calls = 0;
  const service = createFredService({
    apiKey: 'test-key',
    fetchImpl: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 2));
      return response({ observations: [{ date: '2026-01-01', value: '1.2' }] });
    }
  });
  const [first, second] = await Promise.all([service.snapshot(), service.snapshot()]);
  assert.equal(calls, SERIES.length);
  assert.equal(first.status, 'success');
  assert.equal(second.status, 'success');
  const cached = await service.snapshot();
  assert.equal(calls, SERIES.length);
  assert.equal(cached.cached, true);
});

test('FRED service returns partial status and stale data on upstream failure', async () => {
  let fail = false;
  let clock = 0;
  const service = createFredService({
    apiKey: 'test-key',
    now: () => clock,
    fetchImpl: async (url) => {
      if (!fail) return response({ observations: [{ date: '2026-01-01', value: '2.5' }] });
      return response({}, 429);
    }
  });
  const initial = await service.snapshot();
  assert.equal(initial.status, 'success');
  fail = true;
  clock = 31 * 60 * 1000;
  const stale = await service.snapshot();
  assert.equal(stale.status, 'success');
  assert.equal(stale.partial, true);
  assert.ok(stale.series.every((item) => item.stale));
  assert.ok(Object.values(stale.sources).every((item) => item.error === 'FRED_RATE_LIMITED'));
  const cooldown = await service.snapshot();
  assert.equal(cooldown.partial, true);
  assert.ok(cooldown.series.every((item) => item.stale));
});

test('FRED service maps network and malformed response failures to safe codes', async () => {
  const network = createFredService({ apiKey: 'test', fetchImpl: async () => { throw new Error('secret-bearing-url-should-not-leak'); } });
  const networkResult = await network.snapshot();
  assert.equal(networkResult.status, 'error');
  assert.ok(Object.values(networkResult.sources).every((item) => item.error === 'FRED_NETWORK_ERROR'));

  const malformed = createFredService({ apiKey: 'test', fetchImpl: async () => response({ unexpected: [] }) });
  const malformedResult = await malformed.snapshot();
  assert.ok(Object.values(malformedResult.sources).every((item) => item.error === 'FRED_INVALID_RESPONSE'));
});

test('FRED route returns only normalized provider data and does not require a client-supplied key', async (t) => {
  const service = {
    snapshot: async () => ({
      status: 'success', configured: true, provider: 'FRED API',
      series: [{ id: 'FEDFUNDS', latest: { date: '2026-01-01', value: 3.5 } }],
      sources: { FEDFUNDS: { ok: true, error: null } }
    })
  };
  const app = createApp({
    cfg: { adminToken: '', trustedProxyHops: 0, corsOrigin: '', refreshMs: 60000 },
    state: { tokens: [], goplusUsage: { day: null, month: null, day_count: 0, month_count: 0 } },
    fredService: service
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const address = app.server.address();
  const response = await fetch('http://127.0.0.1:' + address.port + '/api/market-intelligence/macro');
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.series[0].id, 'FEDFUNDS');
  assert.equal(payload.series[0].latest.value, 3.5);
});
