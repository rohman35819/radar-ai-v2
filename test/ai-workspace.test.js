'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProposal, runWorkspaceReview, isSafeProviderBaseUrl, listWorkspaceProviders } = require('../lib/ai/workspace');

const proposal = {
  observation: 'Independent review',
  proposals: [{ title: 'Fitur', problem: 'Masalah', benefit: 'Manfaat', priority: 'high', effort: 'small', risk: 'Risiko', files: ['public/app.js'], acceptance_criteria: ['Tes'] }],
  challenge: 'Cek asumsi',
  self_critique: 'Perlu validasi',
  reply_to_others: 'Saya menanggapi peserta lain.'
};
function compatibleResponse() {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(proposal) } }] }) };
}
function geminiResponse() {
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(proposal) }] } }] }) };
}
function customEnv(extra = {}) {
  return {
    GEMINI_API_KEY: 'gemini-test',
    AI_PROVIDER_DEEPSEEK_API_KEY: 'deepseek-test',
    AI_PROVIDER_DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
    AI_PROVIDER_DEEPSEEK_MODEL: 'deepseek-chat',
    AI_PROVIDER_DEEPSEEK_PROTOCOL: 'openai-compatible',
    AI_PROVIDER_DEEPSEEK_ENABLED: '1',
    AI_PROVIDER_DEEPSEEK_COST_CLASS: 'free',
    AI_PROVIDER_DEEPSEEK_ROLE: 'Analis independen',
    ...extra
  };
}

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

test('built-in free-tier providers remain available; paid OpenAI is not auto-selected under Rp0', async () => {
  const env = {
    GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', OPENROUTER_API_KEY: 'r', OPENAI_API_KEY: 'paid-openai-key'
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return url.includes('generativelanguage') ? geminiResponse() : compatibleResponse();
  };
  const result = await runWorkspaceReview({}, { env, fetchImpl });
  assert.equal(result.status, 'completed');
  assert.equal(result.agent_count, 3);
  assert.deepEqual(result.participants, ['gemini', 'groq', 'openrouter']);
  assert.equal(result.rounds[0].agents.length, 3);
  assert.equal(result.rounds[1].agents.length, 3);
  assert.equal(result.rounds[2].agents.length, 3);
  assert.ok(result.minutes);
  assert.equal(calls.length, 10);
});

test('workspace review reports no configured provider without throwing', async () => {
  const result = await runWorkspaceReview({}, { env: {}, fetchImpl: async () => { throw new Error('should not call'); } });
  assert.equal(result.status, 'insufficient_agents');
  assert.equal(result.agent_count, 0);
  assert.deepEqual(result.participants, []);
});

test('additional OpenAI-compatible provider is discoverable and joins when explicitly selected', async () => {
  const env = customEnv();
  const providers = listWorkspaceProviders(env);
  assert.deepEqual(providers.map((p) => p.id), ['gemini', 'deepseek']);
  assert.ok(providers.every((p) => !Object.hasOwn(p, 'apiKey')));
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return url.includes('generativelanguage') ? geminiResponse() : compatibleResponse();
  };
  const result = await runWorkspaceReview({ participants: ['gemini', 'deepseek'] }, { env, fetchImpl });
  assert.deepEqual(result.participants, ['gemini', 'deepseek']);
  assert.equal(result.agent_count, 2);
  assert.deepEqual(result.agents.map((agent) => agent.provider), ['gemini', 'deepseek']);
  assert.ok(calls.some((call) => call.url === 'https://api.deepseek.com/v1/chat/completions'));
});

test('custom providers never join a default session without explicit participant selection', async () => {
  const env = customEnv();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return url.includes('generativelanguage') ? geminiResponse() : compatibleResponse();
  };
  const result = await runWorkspaceReview({}, { env, fetchImpl });
  assert.deepEqual(result.participants, ['gemini']);
  assert.ok(calls.every((url) => url.includes('generativelanguage')));
});

test('custom providers require explicit enablement and free cost class', () => {
  const paid = customEnv({ AI_PROVIDER_DEEPSEEK_COST_CLASS: 'paid' });
  const disabled = customEnv({ AI_PROVIDER_DEEPSEEK_ENABLED: '0' });
  assert.deepEqual(listWorkspaceProviders(paid).map((p) => p.id), ['gemini']);
  assert.deepEqual(listWorkspaceProviders(disabled).map((p) => p.id), ['gemini']);
});

test('provider metadata never exposes API keys', () => {
  const providers = listWorkspaceProviders(customEnv());
  const serialized = JSON.stringify(providers);
  assert.ok(!serialized.includes('deepseek-test'));
  assert.ok(!serialized.includes('gemini-test'));
});

test('custom provider URL validation rejects redirects, local hosts and unusual URL forms', () => {
  assert.equal(isSafeProviderBaseUrl('https://api.example.com/v1'), true);
  assert.equal(isSafeProviderBaseUrl('http://api.example.com/v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://api.example.com:8443/v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://api.example.com/v1?next=x'), false);
  assert.equal(isSafeProviderBaseUrl('https://api.example.com/v1#fragment'), false);
  assert.equal(isSafeProviderBaseUrl('https://127.0.0.1/v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://192.168.1.10/v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://[::ffff:127.0.0.1]/v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://localhost/v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://api.example.com./v1'), false);
  assert.equal(isSafeProviderBaseUrl('https://user:pass@api.example.com/v1'), false);
});

test('custom provider requests reject redirects and only send allowlisted redacted context', async () => {
  const env = customEnv({ GEMINI_API_KEY: undefined });
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return compatibleResponse();
  };
  await runWorkspaceReview({
    participants: ['deepseek'],
    instruction: 'Review this. Authorization: Bearer secret-token-value',
    market: { token_count: 12, symbols: ['BTC', 'ETH'], stale: false, raw_payload: 'DO_NOT_SEND' },
    sources: { exchange: { ok: false, error: 'secret raw error', error_code: 'EXCHANGE_DOWN' } },
    dashboard_sections: ['Screener'],
    recent_group_summary: 'Header Bearer hidden-secret-value',
    api_key: 'DO_NOT_SEND',
    arbitrary_private_field: 'DO_NOT_SEND'
  }, { env, fetchImpl });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.options.redirect, 'error');
    const body = JSON.parse(request.options.body);
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes('DO_NOT_SEND'));
    assert.ok(!serialized.includes('hidden-secret-value'));
    assert.ok(!serialized.includes('secret-token-value'));
    assert.equal(body.messages[1].content.includes('EXCHANGE_DOWN'), true);
    assert.equal(body.messages[1].content.includes('secret raw error'), false);
  }
});

test('provider error payloads are sanitized before being returned', async () => {
  const env = customEnv({ GEMINI_API_KEY: undefined });
  const fetchImpl = async () => ({
    ok: false, status: 401,
    json: async () => ({ error: { message: 'invalid key deepseek-secret-token' } })
  });
  const result = await runWorkspaceReview({ participants: ['deepseek'] }, { env, fetchImpl });
  assert.equal(result.agents[0].error, 'deepseek: HTTP_401');
  assert.ok(!JSON.stringify(result).includes('deepseek-secret-token'));
});
