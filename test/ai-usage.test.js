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
    headers: headers({ 'x-ratelimit-remaining-requests': '18', 'authorization': 'Bearer do-not-copy' })
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
  recordProviderUsage(state, 'openai', { ok: false, statusCode: 500, error: 'Bearer secret' }, new Date('2026-11-20T00:00:00.000Z'));
  const view = getProviderUsageSnapshot(state, { OPENAI_API_KEY: 'secret-value' }, Date.parse('2026-11-24T00:00:00.000Z'));
  assert.equal(view.providers.openai.status, 'UNKNOWN');
  assert.equal(view.providers.openai.last_error_code, 'PROVIDER_HTTP_ERROR');
  assert.equal(JSON.stringify(view).includes('secret-value'), false);
  assert.equal(JSON.stringify(view).includes('Bearer secret'), false);
});

test('rate-limit header allowlist is intentionally narrow', () => {
  const parsed = readHeaders(headers({ 'retry-after': '30', 'set-cookie': 'session=secret', 'x-ratelimit-reset-tokens': '2s' }));
  assert.deepEqual(parsed, { 'x-ratelimit-reset-tokens': '2s', 'retry-after': '30' });
});

test('Groq, OpenRouter and OpenAI adapters forward telemetry callbacks', async () => {
  const envNames = ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY'];
  const previous = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
  for (const key of envNames) process.env[key] = 'test-only-key';
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
    usage: { prompt_tokens: 9, candidatesTokenCount: 4, total_tokens: 13 }
  }, new Date('2026-11-24T20:00:00.000Z'));
  const view = getProviderUsageSnapshot(state, { GEMINI_API_KEY: 'configured' }, Date.parse('2026-11-24T20:05:00.000Z'));
  assert.equal(view.providers.gemini.requests_today, 1);
  assert.equal(view.providers.gemini.total_tokens_today, 13);
});
