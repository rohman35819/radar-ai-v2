'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMacroService, parseBls, parseTreasuryXml, parseNyFed, BLS_SERIES, NYFED_SERIES } = require('../lib/macro');
const { createApp } = require('../server');

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => typeof data === 'string' ? data : JSON.stringify(data)
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

const treasuryFixture = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices">
<entry><content><m:properties xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
<d:NEW_DATE>2026-11-20T00:00:00</d:NEW_DATE><d:BC_3MONTH>3.92</d:BC_3MONTH><d:BC_2YEAR>4.12</d:BC_2YEAR><d:BC_10YEAR>4.34</d:BC_10YEAR><d:BC_30YEAR>4.72</d:BC_30YEAR>
</m:properties></content></entry>
<entry><content><m:properties xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
<d:NEW_DATE>2026-11-19T00:00:00</d:NEW_DATE><d:BC_3MONTH>3.90</d:BC_3MONTH><d:BC_2YEAR>4.10</d:BC_2YEAR><d:BC_10YEAR>4.32</d:BC_10YEAR><d:BC_30YEAR>4.70</d:BC_30YEAR>
</m:properties></content></entry>
</feed>`;

const nyFedFixture = (type, rate) => ({
  refRates: [
    { effectiveDate: '2026-11-20', type, percentRate: rate, volumeInBillions: 3141, revisionIndicator: '' },
    { effectiveDate: '2026-11-19', type, percentRate: rate - 0.01, volumeInBillions: 3161, revisionIndicator: '' }
  ]
});

test('BLS parser keeps monthly observations and skips annual-average records', () => {
  const parsed = parseBls(blsFixture);
  assert.equal(parsed.length, BLS_SERIES.length);
  assert.equal(parsed[0].latest.date, '2026-10');
  assert.equal(parsed[0].latest.value, 337.476);
  assert.equal(parsed[0].observations.length, 2);
});

test('Treasury XML parser normalizes yield curve values and preserves missing data', () => {
  const parsed = parseTreasuryXml(treasuryFixture);
  assert.equal(parsed.length, 4);
  assert.equal(parsed.find((item) => item.id === 'TREASURY_10Y').latest.value, 4.34);
  assert.equal(parsed.find((item) => item.id === 'TREASURY_2Y').latest.date, '2026-11-20');
});

test('NY Fed parser validates rate observations', () => {
  const parsed = parseNyFed(nyFedFixture('SOFR', 3.92), NYFED_SERIES[0]);
  assert.equal(parsed.latest.value, 3.92);
  assert.equal(parsed.latest.volume_in_billions, 3141);
});

test('macro service uses BLS v1, Treasury XML and NY Fed APIs without API keys', async () => {
  const calls = [];
  const service = createMacroService({
    now: () => Date.parse('2026-11-23T00:00:00Z'),
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('api.bls.gov')) return jsonResponse(blsFixture);
      if (String(url).includes('home.treasury.gov')) return jsonResponse(treasuryFixture);
      if (String(url).includes('/secured/sofr/')) return jsonResponse(nyFedFixture('SOFR', 3.92));
      if (String(url).includes('/unsecured/effr/')) return jsonResponse(nyFedFixture('EFFR', 3.88));
      throw new Error('Unexpected upstream');
    }
  });
  const result = await service.snapshot();
  assert.equal(result.status, 'success');
  assert.equal(result.series.length, BLS_SERIES.length + 4 + NYFED_SERIES.length - 2);
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((item) => item.options.method === 'POST').length, 1);
  assert.ok(calls.every((item) => !String(item.url).includes('api_key')));
  assert.equal(result.series.find((item) => item.id === 'SOFR').latest.value, 3.92);
  assert.equal(result.series.find((item) => item.id === 'TREASURY_10Y').latest.value, 4.34);
});

test('macro service caches each source and deduplicates concurrent snapshots', async () => {
  let calls = 0;
  const service = createMacroService({
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).includes('api.bls.gov')) return jsonResponse(blsFixture);
      if (String(url).includes('home.treasury.gov')) return jsonResponse(treasuryFixture);
      if (String(url).includes('/secured/sofr/')) return jsonResponse(nyFedFixture('SOFR', 3.92));
      if (String(url).includes('/unsecured/effr/')) return jsonResponse(nyFedFixture('EFFR', 3.88));
      throw new Error('Unexpected upstream');
    }
  });
  const [first, second] = await Promise.all([service.snapshot(), service.snapshot()]);
  assert.equal(first.status, 'success');
  assert.equal(second.status, 'success');
  assert.equal(calls, 4);
  const cached = await service.snapshot();
  assert.equal(calls, 4);
  assert.equal(cached.cached, true);
});

test('macro service returns partial data without fabricating missing values', async () => {
  const service = createMacroService({
    fetchImpl: async (url) => {
      if (String(url).includes('api.bls.gov')) return jsonResponse(blsFixture);
      if (String(url).includes('home.treasury.gov')) return jsonResponse('<feed></feed>');
      if (String(url).includes('/secured/sofr/')) return jsonResponse(nyFedFixture('SOFR', 3.92));
      if (String(url).includes('/unsecured/effr/')) return jsonResponse(nyFedFixture('EFFR', 3.88));
      throw new Error('Unexpected upstream');
    }
  });
  const result = await service.snapshot();
  assert.equal(result.status, 'success');
  assert.equal(result.partial, true);
  assert.ok(result.series.some((item) => item.id === 'CUSR0000SA0'));
  assert.ok(!result.series.some((item) => item.id.startsWith('TREASURY_')));
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
