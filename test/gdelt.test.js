'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGdeltService, normalizeResponse, parseSeenDate, CACHE_TTL_MS } = require('../lib/gdelt');

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
const sample = { articles: [
  { title: 'Bitcoin &amp; markets', url: 'https://news.example/a', domain: 'news.example', seendate: '20261123T120000Z', language: 'English', sourcecountry: 'US' },
  { title: 'Duplicate', url: 'https://news.example/a', seendate: '20261123T110000Z' },
  { title: 'Unsafe', url: 'http://news.example/b', seendate: '20261123T100000Z' },
  { title: 'Credential URL', url: 'https://user:pass@news.example/c' },
  { title: '', url: 'https://news.example/d' }
] };

test('GDELT normalizes publisher metadata, rejects unsafe URLs, and deduplicates articles', () => {
  const result = normalizeResponse(sample, Date.parse('2026-11-23T12:01:00Z'));
  assert.equal(result.article_count, 1);
  assert.equal(result.articles[0].title, 'Bitcoin &amp; markets');
  assert.equal(result.articles[0].published_at, '2026-11-23T12:00:00.000Z');
  assert.equal(result.articles[0].domain, 'news.example');
  assert.match(result.attribution, /original article content remains with its publisher/);
});

test('GDELT date parser rejects malformed timestamps', () => {
  assert.equal(parseSeenDate('20261123T120000Z'), '2026-11-23T12:00:00.000Z');
  assert.equal(parseSeenDate('yesterday'), null);
  assert.equal(parseSeenDate('20261340T990000Z'), null);
});

test('GDELT fetches a bounded 24h article list and caches it for 15 minutes', async () => {
  let calls = 0;
  let clock = Date.parse('2026-11-23T12:00:00Z');
  let requestUrl;
  const service = createGdeltService({ now: () => clock, fetchImpl: async (url, options) => {
    calls += 1; requestUrl = new URL(url);
    assert.equal(options.method, 'GET');
    assert.match(options.headers.accept, /application\/json/);
    return response(sample);
  }});
  const first = await service.snapshot();
  const second = await service.snapshot();
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(first.article_count, 1);
  assert.equal(requestUrl.searchParams.get('mode'), 'ArtList');
  assert.equal(requestUrl.searchParams.get('format'), 'json');
  assert.equal(requestUrl.searchParams.get('maxrecords'), '50');
  assert.equal(requestUrl.searchParams.get('timespan'), '24h');
  clock += CACHE_TTL_MS + 1;
  const third = await service.snapshot();
  assert.equal(calls, 2);
  assert.equal(third.cached, false);
});

test('GDELT shares in-flight work and does not exceed one upstream request per five seconds', async () => {
  let calls = 0;
  let release;
  const service = createGdeltService({ fetchImpl: async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
    return response({ articles: [] });
  }});
  const first = service.snapshot();
  const second = service.snapshot();
  assert.equal(calls, 1);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.status, 'success');
  assert.equal(b.status, 'success');
});

test('GDELT preserves stale cache after 429 and rejects non-JSON error bodies', async () => {
  let calls = 0;
  let clock = Date.parse('2026-11-23T12:00:00Z');
  const service = createGdeltService({ now: () => clock, fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? response({ articles: [] }) : response('Please slow down', 429);
  }});
  await service.snapshot();
  clock += CACHE_TTL_MS + 1;
  const stale = await service.snapshot();
  assert.equal(stale.stale, true);
  assert.equal(stale.error, 'GDELT_RATE_LIMITED');
  assert.equal(calls, 2);
  service.clearCache();
  const broken = createGdeltService({ fetchImpl: async () => response('<html>rate limited</html>') });
  await assert.rejects(broken.snapshot(), (error) => error.code === 'GDELT_INVALID_RESPONSE');
});
