'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProposal, runWorkspaceReview, isSafeProviderBaseUrl } = require('../lib/ai/workspace');

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
  const fetchImpl = async (url) => {
    calls.push(url);
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
});

test('workspace review reports missing provider keys without throwing', async () => {
  const result = await runWorkspaceReview({}, { env: {}, fetchImpl: async () => { throw new Error('should not call'); } });
  assert.equal(result.status, 'insufficient_agents');
  assert.equal(result.agent_count, 0);
  assert.ok(result.agents.every((a) => a.error));
});

test('additional OpenAI-compatible providers join through environment configuration', async () => {
  const env = {
    GEMINI_API_KEY: 'gemini-test',
    AI_PROVIDER_DEEPSEEK_API_KEY: 'deepseek-test',
    AI_PROVIDER_DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
    AI_PROVIDER_DEEPSEEK_MODEL: 'deepseek-chat',
    AI_PROVIDER_DEEPSEEK_ROLE: 'Kamu analis strategi dan engineering.'
  };
  const calls = [];
  const proposal = { observation: 'Independent review', proposals: [], challenge: 'Check assumptions' };
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('generativelanguage')) {
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(proposal) }] } }] }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(proposal) } }] }) };
  };
  const result = await runWorkspaceReview({ participants: ['gemini', 'deepseek'] }, { env, fetchImpl });
  assert.deepEqual(result.participants, ['gemini', 'deepseek']);
  assert.equal(result.agent_count, 2);
  assert.deepEqual(result.agents.map((agent) => agent.provider), ['gemini', 'deepseek']);
  assert.ok(calls.some((url) => url === 'https://api.deepseek.com/v1/chat/completions'));
});

test('custom provider endpoints must use public HTTPS hosts', () => {
  assert.equal(isSafeProviderBaseUrl('https://api.example.com/v1'), true);
  assert.equal(isSafeProviderBaseUrl('http://api.example.com/v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://127.0.0.1/v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://192.168.1.10/v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://localhost/v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://user:pass@api.example.com/v1'), false);
});
