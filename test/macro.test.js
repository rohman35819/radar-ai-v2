'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMacroService, parseBls, parseNyFed, parseTreasury, parseWorldBank, BLS_SERIES, NYFED_SERIES, WORLD_BANK_SERIES } = require('../lib/macro');
const { createApp } = require('../server');

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data
});

const blsFixture = {
  status: 'REQUEST_SUCCEEDED',
  Results: { series: BLS_SERIES.map((item) => ({
    seriesID: item.id,
    data: [
      { year: '2026', period: 'M10', periodName: 'October', value: '337.476' },
      { year: '2026', period: 'M09', periodName: 'September', value: '336.298' },
      { year: '2026', period: 'M13', periodName: 'Annual', value: '336.1' }
    ]
  })) }
};

const nyFedFixture = (type, rate) => ({
  refRates: [
    { effectiveDate: '2026-11-20', type, percentRate: rate, volumeInBillions: 3141, revisionIndicator: '' },
    { effectiveDate: '2026-11-19', type, percentRate: rate - 0.01, volumeInBillions: 3161, revisionIndicator: '' }
  ]
});

const treasuryFixture = { data: [
  { record_date: '10/31/2026', security_desc: 'Treasury Bills', avg_interest_rate_amt: '4.014%' },
  { record_date: '10/31/2026', security_desc: 'Treasury Notes', avg_interest_rate_amt: '3.399%' },
  { record_date: '10/31/2026', security_desc: 'Treasury Bonds', avg_interest_rate_amt: '3.483%' },
  { record_date: '10/31/2026', security_desc: 'Treasury Inflation-Protected Securities (TIPS)', avg_interest_rate_amt: '1.227%' }
] };
const worldBankFixture = (indicator) => [{ page: 1, pages: 1, total: 3 }, [
  { countryiso3code: 'USA', country: { value: 'United States' }, date: '2025', value: '2.1', obs_status: '' },
  { countryiso3code: 'CHN', country: { value: 'China' }, date: '2025', value: '4.8', obs_status: '' },
  { countryiso3code: 'IDN', country: { value: 'Indonesia' }, date: '2025', value: '5.0', obs_status: '' }
]];

test('BLS parser keeps monthly observations and skips annual-average records', () => {
  const parsed = parseBls(blsFixture);
  assert.equal(parsed.length, BLS_SERIES.length);
  assert.equal(parsed[0].latest.date, '2026-10');
  assert.equal(parsed[0].latest.value, 337.476);
  assert.equal(parsed[0].observations.length, 2);
});

test('NY Fed parser validates rate observations and keeps missing values null', () => {
  const parsed = parseNyFed(nyFedFixture('SOFR', 3.92), NYFED_SERIES[0]);
  assert.equal(parsed.latest.value, 3.92);
  assert.equal(parsed.latest.volume_in_billions, 3141);
  assert.throws(() => parseNyFed({ refRates: [{ effectiveDate: '2026-11-20', percentRate: null, volumeInBillions: null }] }, NYFED_SERIES[0]), { code: 'NYFED_EMPTY_RESPONSE' });
});

test('Treasury parser keeps monthly security rates and ignores unrelated rows', () => {
  const parsed = parseTreasury(treasuryFixture);
  assert.equal(parsed.length, 4);
  assert.equal(parsed.find((item) => item.id === 'TREASURY_BILLS').latest.value, 4.014);
  assert.equal(parsed.find((item) => item.id === 'TREASURY_BILLS').latest.date, '2026-10-31');
});

test('World Bank parser keeps country/indicator identity and nulls missing observations', () => {
  const parsed = parseWorldBank(worldBankFixture(), WORLD_BANK_SERIES[0]);
  assert.equal(parsed.length, 3);
  assert.equal(parsed.find((item) => item.country_code === 'IDN').latest.value, 5);
  assert.equal(parsed[0].source, 'World Bank');
});

test('macro service calls BLS v1 once and NY Fed endpoints without API keys', async () => {
  const calls = [];
  const service = createMacroService({
    now: () => Date.parse('2026-11-23T00:00:00Z'),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('api.bls.gov')) return jsonResponse(blsFixture);
      if (String(url).includes('/secured/sofr/')) return jsonResponse(nyFedFixture('SOFR', 3.92));
      if (String(url).includes('/unsecured/effr/')) return jsonResponse(nyFedFixture('EFFR', 3.88));
      if (String(url).includes('fiscaldata.treasury.gov')) return jsonResponse(treasuryFixture);
      if (String(url).includes('api.worldbank.org')) return jsonResponse(worldBankFixture());
      throw new Error('Unexpected upstream');
    }
  });
  const result = await service.snapshot();
  assert.equal(result.status, 'success');
  assert.equal(result.series.length, BLS_SERIES.length + NYFED_SERIES.length + 4 + WORLD_BANK_SERIES.length * 3);
  assert.equal(calls.length, 6 + WORLD_BANK_SERIES.length);
  assert.equal(calls.filter((item) => item.options.method === 'POST').length, 1);
  assert.ok(calls.every((item) => !String(item.url).includes('api_key')));
  assert.equal(result.series.find((item) => item.id === 'SOFR').latest.value, 3.92);
});

test('macro service caches each source and deduplicates concurrent snapshots', async () => {
  let calls = 0;
  const service = createMacroService({
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).includes('api.bls.gov')) return jsonResponse(blsFixture);
      if (String(url).includes('/secured/sofr/')) return jsonResponse(nyFedFixture('SOFR', 3.92));
      if (String(url).includes('/unsecured/effr/')) return jsonResponse(nyFedFixture('EFFR', 3.88));
      throw new Error('Unexpected upstream');
    }
  });
  const [first, second] = await Promise.all([service.snapshot(), service.snapshot()]);
  assert.equal(first.status, 'success');
  assert.equal(second.status, 'success');
  assert.equal(calls, 6 + WORLD_BANK_SERIES.length);
  const cached = await service.snapshot();
  assert.equal(calls, 3);
  assert.equal(cached.cached, true);
});

test('macro service returns partial data without fabricating missing values', async () => {
  const service = createMacroService({
    fetchImpl: async (url) => {
      if (String(url).includes('api.bls.gov')) return jsonResponse(blsFixture);
      if (String(url).includes('/secured/sofr/')) return jsonResponse(nyFedFixture('SOFR', 3.92));
      if (String(url).includes('/unsecured/effr/')) return jsonResponse({}, 503);
      if (String(url).includes('fiscaldata.treasury.gov')) return jsonResponse(treasuryFixture);
      if (String(url).includes('api.worldbank.org')) return jsonResponse(worldBankFixture());
      throw new Error('Unexpected upstream');
    }
  });
  const result = await service.snapshot();
  assert.equal(result.status, 'success');
  assert.equal(result.partial, true);
  assert.ok(result.series.some((item) => item.id === 'CUSR0000SA0'));
  assert.ok(result.series.some((item) => item.id === 'SOFR'));
  assert.ok(!result.series.some((item) => item.id === 'EFFR'));
  assert.equal(result.sources.nyfed_effr.ok, false);
});

test('macro route returns normalized data without requiring secrets', async (t) => {
  const service = {
    snapshot: async () => ({
      status: 'success', observed_at: '2026-11-23T00:00:00.000Z',
      series: [{ id: 'SOFR', title: 'Secured Overnight Financing Rate', latest: { date: '2026-11-20', value: 3.92 } }],
      sources: { nyfed: { ok: true, stale: false } }
    })
  };
  const app = createApp({
    cfg: { adminToken: '', trustedProxyHops: 0, corsOrigin: '', refreshMs: 60000 },
    state: { tokens: [], goplusUsage: { day: null, month: null, day_count: 0, month_count: 0 } },
    macroService: service
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const response = await fetch('http://127.0.0.1:' + app.server.address().port + '/api/market-intelligence/macro');
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.series[0].id, 'SOFR');
});
