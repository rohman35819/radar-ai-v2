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
