'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProposal, runWorkspaceReview } = require('../lib/ai/workspace');

test('proposal normalization bounds fields and rejects unsafe paths', () => {
  const a = normalizeProposal({
    observation: 'Temuan',
    proposals: [{
      title: 'Panel kesehatan', problem: 'Status tidak jelas', benefit: 'Operator tahu sumber gagal',
      priority: 'high', effort: 'small', files: ['public/app.js', '../server.js', 'server.js', 'lib/ai/status.js'],
      acceptance_criteria: ['Status tampil', 'Tes lolos']
    }]
  }, 'test', 'mock');
  assert.deepEqual(a.proposals[0].files, ['public/app.js', 'lib/ai/status.js']);
  assert.equal(a.proposals[0].priority, 'high');
  assert.equal(a.observation, 'Temuan');
});

test('workspace review asks each configured provider independently', async () => {
  const env = {
    GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', OPENROUTER_API_KEY: 'r', OPENAI_API_KEY: 'o'
  };
  const calls = [];
  const proposal = { observation: 'Temuan', proposals: [{ title: 'Fitur', problem: 'Masalah', benefit: 'Manfaat', files: ['public/app.js'], acceptance_criteria: ['Tes'] }], challenge: 'Cek asumsi', self_critique: 'Perlu validasi' };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(proposal) }] } }] }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(proposal) } }] }) };
  };
  const result = await runWorkspaceReview({}, { env, fetchImpl });
  assert.equal(result.status, 'completed');
  assert.equal(result.agent_count, 4);
  assert.deepEqual(result.agents.map((a) => a.provider), ['gemini', 'groq', 'openrouter', 'openai']);
  assert.equal(result.rounds[0].agents.length, 4);
  assert.equal(result.rounds[1].agents.length, 4);
  assert.equal(result.rounds[2].agents.length, 4);
  assert.ok(result.minutes);
  assert.equal(calls.length, 13);
  const groqRequest = calls.find((call) => call.url.includes('api.groq.com'));
  const openaiRequest = calls.find((call) => call.url.includes('api.openai.com'));
  assert.equal(groqRequest.body.max_completion_tokens, 4096);
  assert.equal(groqRequest.body.max_tokens, undefined);
  assert.equal(groqRequest.body.response_format.type, 'json_schema');
  assert.equal(groqRequest.body.response_format.json_schema.strict, true);
  assert.equal(openaiRequest.body.max_completion_tokens, 4096);
  assert.equal(openaiRequest.body.max_tokens, undefined);
  assert.equal(openaiRequest.body.temperature, undefined);
});

test('workspace review reports missing provider keys without throwing', async () => {
  const result = await runWorkspaceReview({}, { env: {}, fetchImpl: async () => { throw new Error('should not call'); } });
  assert.equal(result.status, 'insufficient_agents');
  assert.equal(result.agent_count, 0);
  assert.ok(result.agents.every((a) => a.error));
});


test('workspace retries transient OpenRouter User not found once', async () => {
  const env = { OPENROUTER_API_KEY: 'test-key' };
  let calls = 0;
  const proposal = { observation: 'Temuan', proposals: [], challenge: '', self_critique: '', reply_to_others: '' };
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 401, json: async () => ({ error: { message: 'User not found' } }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(proposal) } }] }) };
  };
  const result = await runWorkspaceReview({ participants: ['openrouter'] }, { env, fetchImpl, retryDelayMs: 0 });
  assert.equal(result.status, 'completed');
  assert.equal(calls, 3);
});

test('workspace retries Gemini temporary high-demand response once', async () => {
  const env = { GEMINI_API_KEY: 'test-key' };
  let calls = 0;
  const proposal = { observation: 'Temuan', proposals: [], challenge: '', self_critique: '', reply_to_others: '' };
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(proposal) }] } }] }) };
  };
  const result = await runWorkspaceReview({ participants: ['gemini'] }, { env, fetchImpl, retryDelayMs: 0 });
  assert.equal(result.status, 'completed');
  assert.equal(calls, 3);
});
