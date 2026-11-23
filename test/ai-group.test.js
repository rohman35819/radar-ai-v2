'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAnalysis, requestStructured } = require('../lib/ai/chat-completions');
const { compactMarket } = require('../lib/ai/group');

test('normalisasi analisis membatasi keputusan dan confidence', () => {
  const a = normalizeAnalysis({ decision: 'BUY', confidence_score: 140, reasons: ['bukti'], risks: [], missing_data: [] }, 'test', 'mock');
  assert.equal(a.decision, 'WAIT');
  assert.equal(a.confidence_score, 100);
  assert.deepEqual(a.reasons, ['bukti']);
});

test('snapshot pasar dipadatkan dan jumlah token dibatasi', () => {
  const snapshot = { stale: false, tokens: Array.from({ length: 20 }, (_, i) => ({ symbol: 'T' + i, price: 1, flags: [] })) };
  const compact = compactMarket(snapshot);
  assert.equal(compact.tokens.length, 12);
  assert.equal(compact.tokens[0].symbol, 'T0');
  assert.equal(compact.data_stale, false);
});

test('client chat-completions memakai JSON dan menolak key kosong', async () => {
  await assert.rejects(() => requestStructured({
    provider: 'groq', apiKey: '', baseUrl: 'https://example.invalid', model: 'mock', messages: []
  }), /API_KEY belum dikonfigurasi/);
  let sent;
  const result = await requestStructured({
    provider: 'mock', apiKey: 'dummy-test-key', baseUrl: 'https://example.invalid', model: 'mock-model',
    messages: [{ role: 'user', content: '{}' }],
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        decision: 'LONG', confidence_score: 65, reasons: ['data'], risks: [], missing_data: [], summary: 'uji'
      }) } }] }) };
    }
  });
  assert.equal(sent.response_format.type, 'json_object');
  assert.equal(result.decision, 'LONG');
  assert.equal(result.provider, 'mock');
});


test('group analysis falls back to OpenRouter when the Groq moderator fails', async () => {
  const { runGroup } = require('../lib/ai/group');
  const analyzers = ['gemini', 'groq', 'openrouter', 'openai'].map((provider) => [
    provider, async () => ({ provider, decision: 'WAIT', confidence_score: 40, reasons: [], risks: [], missing_data: [] })
  ]);
  const attempts = [];
  const result = await runGroup({ stale: false, tokens: [{ symbol: 'BTC', price: 100 }] }, {
    analyzers,
    moderators: [
      ['groq', async (_market, analyses) => { attempts.push('groq'); assert.equal(analyses.length, 4); throw new Error('rate limited'); }],
      ['openrouter', async (_market, analyses) => {
        attempts.push('openrouter');
        assert.equal(analyses.length, 4);
        return { decision: 'WAIT', confidence_score: 0, reasons: ['Bukti belum cukup'], risks: [], missing_data: [] };
      }]
    ]
  });

  assert.deepEqual(attempts, ['groq', 'openrouter']);
  assert.equal(result.status, 'completed');
  assert.equal(result.final.provider, 'openrouter-moderator');
  assert.equal(result.final.decision, 'WAIT');
});

test('group analysis stays WAIT and reports unavailable moderator when all reviewers fail', async () => {
  const { runGroup } = require('../lib/ai/group');
  const analyzers = ['gemini', 'groq'].map((provider) => [
    provider, async () => ({ provider, decision: 'LONG', confidence_score: 80, reasons: ['uji'], risks: [], missing_data: [] })
  ]);
  const result = await runGroup({ stale: false, tokens: [{ symbol: 'BTC', price: 100 }] }, {
    analyzers,
    moderators: [['groq', async () => { throw new Error('provider down'); }]]
  });

  assert.equal(result.status, 'moderator_unavailable');
  assert.equal(result.final.decision, 'WAIT');
  assert.equal(result.final.moderator_errors[0], 'groq: unavailable');
});


test('OpenRouter moderator always uses the free router even when a paid model override is configured', async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousModel = process.env.OPENROUTER_MODEL;
  process.env.OPENROUTER_API_KEY = 'test-only-key';
  process.env.OPENROUTER_MODEL = 'paid/model-must-not-be-used';
  let sent;
  try {
    const { reviewGroup } = require('../lib/ai/openrouter');
    const result = await reviewGroup({ tokens: [{ symbol: 'BTC' }] }, [], {
      fetchImpl: async (_url, options) => {
        sent = JSON.parse(options.body);
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
          decision: 'WAIT', confidence_score: 0, reasons: [], risks: [], missing_data: [], summary: 'uji'
        }) } }] }) };
      }
    });
    assert.equal(sent.model, 'openrouter/free');
    assert.equal(result.model, 'openrouter/free');
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENROUTER_MODEL; else process.env.OPENROUTER_MODEL = previousModel;
  }
});


test('structured adapters use completion-token parameter and strict Groq JSON schema', async () => {
  const { requestStructured } = require('../lib/ai/chat-completions');
  let sent;
  await requestStructured({
    provider: 'groq', apiKey: 'test-key', baseUrl: 'https://example.invalid',
    model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: 'JSON' }],
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        decision: 'WAIT', confidence_score: 20, timeframe: '1h', reasons: [], risks: [], missing_data: [], summary: 'uji'
      }) } }] }) };
    }
  });
  assert.equal(sent.max_completion_tokens, 4096);
  assert.equal(sent.max_tokens, undefined);
  assert.equal(sent.response_format.type, 'json_schema');
  assert.equal(sent.response_format.json_schema.strict, true);
});

test('Groq falls back to JSON object mode when strict generation fails', async () => {
  const { requestStructured } = require('../lib/ai/chat-completions');
  const formats = [];
  const result = await requestStructured({
    provider: 'groq', apiKey: 'test-key', baseUrl: 'https://example.invalid',
    model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: 'JSON' }],
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      formats.push(body.response_format.type);
      if (formats.length === 1) return { ok: false, status: 400, json: async () => ({ error: { message: 'failed_generation: invalid schema' } }) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        decision: 'WAIT', confidence_score: 10, timeframe: '15m', reasons: [], risks: [], missing_data: [], summary: 'fallback'
      }) } }] }) };
    }
  });
  assert.deepEqual(formats, ['json_schema', 'json_object']);
  assert.equal(result.summary, 'fallback');
});

test('OpenRouter User not found gets one transient retry', async () => {
  const { requestStructured } = require('../lib/ai/chat-completions');
  let calls = 0;
  const result = await requestStructured({
    provider: 'openrouter', apiKey: 'test-key', baseUrl: 'https://example.invalid',
    model: 'openrouter/free', messages: [{ role: 'user', content: 'JSON' }], retryDelayMs: 0,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 401, json: async () => ({ error: { message: 'User not found' } }) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        decision: 'WAIT', confidence_score: 10, timeframe: '1h', reasons: [], risks: [], missing_data: [], summary: 'recovered'
      }) } }] }) };
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.summary, 'recovered');
});

test('Gemini market analyzer retries a temporary high-demand response', async () => {
  const { analyzeMarket } = require('../lib/ai/gemini');
  let calls = 0;
  const result = await analyzeMarket({ tokens: [{ symbol: 'BTC' }] }, {
    apiKey: 'test-key', retryDelayMs: 0,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        decision: 'WAIT', confidence_score: 25, timeframe: '1h', reasons: [], risks: [], missing_data: [], summary: 'recovered'
      }) }] } }] }) };
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.summary, 'recovered');
});
