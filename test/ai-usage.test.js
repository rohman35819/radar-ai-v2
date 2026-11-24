'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { emptyUsageState, recordProviderUsage, getProviderUsageSnapshot, readHeaders } = require('../lib/ai/usage');

function headers(values = {}) {
  return { get(name) { return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null; } };
}

test('AI usage records actual request/token counts and sanitized rate-limit headers', () => {
  const state = emptyUsageState();
  recordProviderUsage(state, 'groq', {
    model: 'openai/gpt-oss-20b', ok: true, statusCode: 200,
    usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
    headers: headers({ 'x-ratelimit-remaining-requests': '18', 'authorization': ['Bearer', 'synthetic-placeholder'].join(' ') })
  }, new Date('2026-11-24T13:00:00.000Z'));
  const view = getProviderUsageSnapshot(state, { GROQ_API_KEY: 'configured' }, Date.parse('2026-11-24T13:01:00.000Z'));
  assert.equal(view.providers.groq.status, 'ACTIVE');
  assert.equal(view.providers.groq.requests_today, 1);
  assert.equal(view.providers.groq.input_tokens_today, 120);
  assert.equal(view.providers.groq.output_tokens_today, 40);
  assert.equal(view.providers.groq.total_tokens_today, 160);
  assert.equal(view.providers.groq.rate_limits['x-ratelimit-remaining-requests'], '18');
  assert.equal(Object.keys(view.providers.groq.rate_limits).some((key) => key === 'authorization'), false);
});

test('missing provider quota/token metadata remains UNKNOWN, not zero', () => {
  const state = emptyUsageState();
  const view = getProviderUsageSnapshot(state, { GEMINI_API_KEY: 'configured' }, Date.parse('2026-11-24T13:00:00.000Z'));
  assert.equal(view.providers.gemini.status, 'UNKNOWN');
  assert.equal(view.providers.gemini.total_tokens_today, null);
  assert.equal(view.providers.gemini.quota_remaining, null);
  assert.equal(view.providers.gemini.quota_limit, null);
});

test('provider 429 is LIMITED and missing credentials are NOT_CONFIGURED', () => {
  const state = emptyUsageState();
  recordProviderUsage(state, 'openrouter', { model: 'openrouter/free', ok: false, statusCode: 429 }, new Date('2026-11-24T13:00:00.000Z'));
  const view = getProviderUsageSnapshot(state, { OPENROUTER_API_KEY: 'configured', OPENAI_API_KEY: '' }, Date.parse('2026-11-24T13:01:00.000Z'));
  assert.equal(view.providers.openrouter.status, 'LIMITED');
  assert.equal(view.providers.openai.status, 'NOT_CONFIGURED');
  assert.equal(view.providers.openrouter.last_error_code, 'RATE_LIMITED');
});

test('usage view expires stale status and never exposes secrets or raw errors', () => {
  const state = emptyUsageState();
  recordProviderUsage(state, 'openai', { ok: false, statusCode: 500, error: ['Bearer', 'synthetic-placeholder'].join(' ') }, new Date('2026-11-20T00:00:00.000Z'));
  const view = getProviderUsageSnapshot(state, { OPENAI_API_KEY: ['synthetic', 'credential', 'placeholder'].join('-') }, Date.parse('2026-11-24T00:00:00.000Z'));
  assert.equal(view.providers.openai.status, 'UNKNOWN');
  assert.equal(view.providers.openai.last_error_code, 'PROVIDER_HTTP_ERROR');
  assert.equal(JSON.stringify(view).includes('secret-value'), false);
  assert.equal(JSON.stringify(view).includes(['Bearer', 'synthetic-placeholder'].join(' ')), false);
});

test('rate-limit header allowlist is intentionally narrow', () => {
  const parsed = readHeaders(headers({ 'retry-after': '30', 'set-cookie': 'session=secret', 'x-ratelimit-reset-tokens': '2s' }));
  assert.deepEqual(parsed, { 'x-ratelimit-reset-tokens': '2s', 'retry-after': '30' });
});

test('Groq, OpenRouter and OpenAI adapters forward telemetry callbacks', async () => {
  const envNames = ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY'];
  const previous = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
  for (const key of envNames) process.env[key] = ['unit', 'test', 'placeholder'].join('-');
  try {
    const adapters = [
      ['groq', require('../lib/ai/groq').analyzeMarket],
      ['openrouter', require('../lib/ai/openrouter').analyzeMarket],
      ['openai', require('../lib/ai/openai').analyzeMarket]
    ];
    for (const [provider, analyze] of adapters) {
      let event;
      await analyze({ tokens: [{ symbol: 'BTC' }] }, {
        retryDelayMs: 0,
        onUsage: (value) => { event = value; },
        fetchImpl: async () => ({
          ok: true, status: 200,
          headers: headers({ 'x-ratelimit-remaining-requests': '7' }),
          json: async () => ({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, choices: [{ message: { content: JSON.stringify({
            decision: 'WAIT', confidence_score: 10, timeframe: '1h', reasons: [], risks: [], missing_data: [], summary: 'test'
          }) } }] })
        })
      });
      assert.equal(event.provider, provider);
      assert.equal(event.ok, true);
      assert.equal(event.usage.total_tokens, 15);
    }
  } finally {
    for (const key of envNames) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('daily provider counters follow Asia/Jakarta day boundary, not UTC midnight', () => {
  const state = emptyUsageState();
  recordProviderUsage(state, 'gemini', {
    ok: true, statusCode: 200,
    usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 }
  }, new Date('2026-11-24T20:00:00.000Z'));
  const view = getProviderUsageSnapshot(state, { GEMINI_API_KEY: 'configured' }, Date.parse('2026-11-24T20:05:00.000Z'));
  assert.equal(view.providers.gemini.requests_today, 1);
  assert.equal(view.providers.gemini.total_tokens_today, 13);
});

test('network retry failures and later success are both observable', async () => {
  const { requestStructured } = require('../lib/ai/chat-completions');
  const events = [];
  let calls = 0;
  await requestStructured({
    provider: 'groq', apiKey: 'configured', baseUrl: 'https://example.invalid', model: 'mock',
    messages: [{ role: 'user', content: 'test' }], retryDelayMs: 0,
    onUsage: (event) => events.push(event),
    fetchImpl: async () => {
      calls++;
      if (calls === 1) throw new TypeError('temporary network issue');
      return {
        ok: true, status: 200, headers: headers(),
        json: async () => ({ usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }, choices: [{ message: { content: JSON.stringify({
          decision: 'WAIT', confidence_score: 1, timeframe: '1h', reasons: [], risks: [], missing_data: [], summary: 'ok'
        }) } }] })
      };
    }
  });
  assert.equal(calls, 2);
  assert.equal(events.length, 2);
  assert.equal(events[0].ok, false);
  assert.equal(events[0].statusCode, null);
  assert.equal(events[1].ok, true);
});


test('provider rate-limit header values reject arbitrary reflected text and model labels are constrained', () => {
  const parsed = readHeaders(headers({
    'x-ratelimit-remaining-requests': '18',
    'x-ratelimit-reset-tokens': '2s',
    'retry-after': '30',
    'x-ratelimit-limit': 'Bearer synthetic-secret'
  }));
  assert.deepEqual(parsed, {
    'x-ratelimit-remaining-requests': '18',
    'x-ratelimit-reset-tokens': '2s',
    'retry-after': '30'
  });
  const state = emptyUsageState();
  recordProviderUsage(state, 'openai', { ok: true, statusCode: 200, model: 'gpt-6-luna\\nBearer-secret' }, new Date('2026-11-24T13:00:00.000Z'));
  const view = getProviderUsageSnapshot(state, { OPENAI_API_KEY: 'configured' }, Date.parse('2026-11-24T13:01:00.000Z'));
  assert.equal(view.providers.openai.model, null);
  assert.equal(JSON.stringify(view).includes('Bearer-secret'), false);
});


test('malformed response with HTTP 200 is classified as request failure, not provider HTTP error', () => {
  const state = emptyUsageState();
  recordProviderUsage(state, 'groq', { ok: false, statusCode: 200 }, new Date('2026-11-24T13:00:00.000Z'));
  const view = getProviderUsageSnapshot(state, { GROQ_API_KEY: 'configured' }, Date.parse('2026-11-24T13:01:00.000Z'));
  assert.equal(view.providers.groq.last_error_code, 'REQUEST_FAILED');
  assert.equal(view.providers.groq.status, 'ERROR');
});
