'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_BUDGET_TOKENS, MAX_BUDGET_TOKENS, estimateTokens, clampBudget, budgetFromEnv,
  truncateSafe, compactJson, selectContext, budgetMessages, buildHandoffSummary,
} = require('../lib/ai/context-budget');
const { ERROR_CODES, classifyProviderError, providerFailure } = require('../lib/ai/provider-errors');
const { FREE_CANDIDATES, resolveFallbackChain, assertNoPaidFallback } = require('../lib/ai/provider-fallback');
const { requestStructured } = require('../lib/ai/chat-completions');
const { runWorkspaceReview } = require('../lib/ai/workspace');

test('token budget is capped at 6000 and environment cannot raise it', () => {
  assert.equal(DEFAULT_BUDGET_TOKENS, 6000);
  assert.equal(MAX_BUDGET_TOKENS, 6000);
  assert.equal(clampBudget(999999), 6000);
  assert.equal(clampBudget(12000), 6000);
  assert.equal(clampBudget(-5), 800);
  assert.equal(clampBudget('not-a-number'), 6000);
  assert.equal(budgetFromEnv({ NEXUS_CONTEXT_TOKEN_BUDGET: '20000' }), 6000);
  assert.equal(budgetFromEnv({ NEXUS_CONTEXT_TOKEN_BUDGET: '1000' }), 1000);
});

test('estimateTokens is deterministic and conservative', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.ok(estimateTokens({ a: 'x'.repeat(80) }) >= 20);
  assert.equal(estimateTokens('halo NEXUS'), estimateTokens('halo NEXUS'));
});

test('truncateSafe keeps head and tail, is bounded, and never cuts blindly', () => {
  const short = 'baris pendek';
  assert.equal(truncateSafe(short, 100), short);
  const text = Array.from({ length: 200 }, (_, i) => `baris ${i} isi konteks penting`).join('\n');
  const cut = truncateSafe(text, 400);
  assert.ok(cut.length <= 400);
  assert.match(cut, /\[konteks dipotong aman\]/);
  assert.match(cut, /baris 0 /);
  assert.match(cut, /baris 199/);
  assert.ok(!cut.includes('baris 100'));
});

test('compactJson returns valid JSON, bounds arrays/strings and redacts secrets', () => {
  const input = { issue: 'NEXUS', items: Array.from({ length: 30 }, (_, i) => `item ${i}`), note: `api_key=${'a'.repeat(40)}` };
  const compacted = compactJson(input, { maxArrayItems: 3, maxStringChars: 40 });
  const reparsed = JSON.parse(JSON.stringify(compacted));
  assert.equal(reparsed.items.length, 4); // 3 items + omission marker
  assert.match(reparsed.items[3], /\+27 item dihilangkan/);
  assert.doesNotMatch(JSON.stringify(reparsed), /api_key=[a]{40}/);
});

test('task-based selector admits only relevant items and protects security constraints', () => {
  const catalog = [
    { id: 'sec', kind: 'decision', title: 'Hard constraints', content: 'Rp0. Tanpa paid provider, worker, order, withdrawal.', tags: ['Rp0', 'paid', 'worker'], priority: 'critical' },
    { id: 'api', kind: 'contract', title: 'NEXUS API', content: 'POST /api/ai/command mengembalikan command_id.', tags: ['api', 'nexus'], priority: 'high' },
    { id: 'issue', kind: 'issue', title: 'Issue 162', content: 'Dashboard chat NEXUS memakai satu Core.', tags: ['issue', 'dashboard'], priority: 'high' },
    { id: 'test', kind: 'test', title: 'Tes context budget', content: 'npm test lolos 100/100.', tags: ['test'], priority: 'normal' },
    { id: 'irrelevant', kind: 'file', title: 'Cuaca', content: 'Suhu ruangan 28 derajat.', tags: ['cuaca'], priority: 'normal' },
  ];
  const result = selectContext({ task: 'selaraskan api command issue dashboard NEXUS', catalog, budget: 6000 });
  const ids = result.items.map((item) => item.id);
  assert.ok(ids.includes('sec'));
  assert.ok(ids.includes('api'));
  assert.ok(ids.includes('issue'));
  assert.ok(!ids.includes('irrelevant'));
  assert.ok(result.items.find((item) => item.id === 'sec').protected);
  assert.equal(result.within_budget, true);
  assert.ok(result.omitted.some((item) => item.id === 'irrelevant' && item.reason === 'not_relevant'));

  const tight = selectContext({ task: 'api', catalog, budget: 800 });
  assert.ok(tight.items.find((item) => item.id === 'sec'));
  assert.ok(tight.omitted.length > 0);
});

test('budgetMessages keeps protected system text and compacts oversized JSON payloads', () => {
  const reports = [];
  const huge = { current_context: { discussion_transcript: Array.from({ length: 100 }, (_, i) => `pendapat ${i} ` + 'x'.repeat(120)) } };
  const result = budgetMessages([
    { role: 'system', content: 'Instruksi keamanan: jangan mengarang, jangan buka secret.' },
    { role: 'user', content: JSON.stringify(huge) },
  ], { budget: 1000, onBudget: (r) => reports.push(r) });
  assert.equal(result.messages[0].content, 'Instruksi keamanan: jangan mengarang, jangan buka secret.');
  assert.ok(estimateTokens(result.messages[1].content) < estimateTokens(JSON.stringify(huge)));
  assert.ok(result.report.compacted.includes('user'));
  assert.equal(reports.length, 1);
});

test('handoff summary is compact, redacted and carries hard constraints', () => {
  const text = buildHandoffSummary({
    session: { id: 'abc', messages: [{ role: 'bos' }] },
    status: { identity: 'RADAR NEXUS', provider_state: 'available', provider_detail: 'aktif' },
    decisions: ['api_key=abcdefghijklmnop → tidak boleh disimpan'],
    evidence: ['npm test 300/300'],
    blockers: ['Hostless belum diverifikasi'],
    next: ['Uji Termux oleh BOS'],
    limit: 1000,
  });
  assert.ok(text.length <= 1000);
  assert.match(text, /RADAR NEXUS/);
  assert.match(text, /Rp0/);
  assert.match(text, /\[redacted\]/);
  assert.match(text, /NEXT TASK/);
  assert.doesNotMatch(text, /abcdefghijklmnop/);
});

test('provider errors are classified without leaking raw provider text', () => {
  const tpm = classifyProviderError({ provider: 'groq', status: 429, message: 'rate_limit_exceeded: 14721 tokens > 8000 TPM api_key=abcdefghijklmnopqrstuv' });
  assert.equal(tpm.code, ERROR_CODES.RATE_LIMIT_TPM);
  assert.equal(tpm.retryable, true);
  assert.equal(tpm.reduceContext, true);
  assert.doesNotMatch(tpm.userMessage, /abcdefghijklmnopqrstuv/);
  assert.doesNotMatch(tpm.safeDetail, /abcdefghijklmnopqrstuv/);
  assert.equal(classifyProviderError({ status: 429, message: 'too many requests' }).code, ERROR_CODES.RATE_LIMIT_429);
  assert.equal(classifyProviderError({ error: { name: 'TimeoutError', message: 'aborted' } }).code, ERROR_CODES.TIMEOUT);
  assert.equal(classifyProviderError({ status: 503, message: 'overloaded' }).code, ERROR_CODES.PROVIDER_UNAVAILABLE);
  assert.equal(classifyProviderError({ status: 401, message: 'invalid api key' }).code, ERROR_CODES.AUTH);
  assert.equal(classifyProviderError({ error: { code: 'AI_QUEUE_FULL' } }).code, ERROR_CODES.QUEUE_FULL);
  const failure = providerFailure('groq', 429, 'rate_limit_exceeded TPM');
  assert.equal(failure.code, ERROR_CODES.RATE_LIMIT_TPM);
  assert.equal(failure.retryable, true);
});

test('fallback is opt-in, free-only and never automatically enabled', () => {
  assert.deepEqual(resolveFallbackChain({}), []);
  const env = { OPENROUTER_API_KEY: 'configured', GROQ_API_KEY: 'configured', OPENAI_API_KEY: 'configured' };
  assert.deepEqual(resolveFallbackChain({ optIn: false, env }), []);
  const chain = assertNoPaidFallback(resolveFallbackChain({ optIn: true, env }));
  assert.deepEqual(chain.map((item) => item.provider), ['openrouter', 'groq']);
  assert.deepEqual(resolveFallbackChain({ optIn: true, env, availableProviders: ['groq'] }).map((item) => item.provider), ['groq']);
  assert.deepEqual(resolveFallbackChain({ optIn: true, env: {} }), []);
  assert.ok(FREE_CANDIDATES.every((item) => item.provider !== 'openai' && !item.model.includes('120b')));
  assert.throws(() => assertNoPaidFallback([{ provider: 'openai', model: 'gpt-6-luna' }]), /Fallback berbayar dilarang/);
});

test('requestStructured reduces context after a TPM 429 and stays within budget', async () => {
  const bodies = [];
  const proposal = { decision: 'WAIT', confidence_score: 0, timeframe: '1d', reasons: [], risks: [], missing_data: [], summary: 'Data kurang.' };
  const fetchImpl = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) return { ok: false, status: 429, json: async () => ({ error: { message: 'rate_limit_exceeded: 14721 tokens melebihi 8000 TPM' } }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(proposal) } }] }) };
  };
  const budgets = [];
  const result = await requestStructured({
    provider: 'groq', apiKey: 'test-key', baseUrl: 'https://example.invalid', model: 'openai/gpt-oss-20b',
    messages: [{ role: 'user', content: JSON.stringify({ market: Array.from({ length: 100 }, (_, i) => `baris ${i} ` + 'y'.repeat(100)) }) }],
    contextBudget: 5000, onBudget: (r) => budgets.push(r), fetchImpl, retryDelayMs: 0,
  });
  assert.equal(result.decision, 'WAIT');
  assert.equal(bodies.length, 2);
  assert.ok(budgets.length >= 2);
  assert.ok(budgets[1].budget_tokens < budgets[0].budget_tokens);
  assert.ok(budgets.every((r) => r.after_tokens <= 6000));
});

test('workspace review stays within the context budget across three rounds', async () => {
  const env = { GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q', OPENROUTER_API_KEY: 'r', OPENAI_API_KEY: 'o' };
  const bodies = [];
  const proposal = { observation: 'Temuan', proposals: [], challenge: '', self_critique: '', reply_to_others: '' };
  const fetchImpl = async (url, options = {}) => {
    if (options.body) bodies.push({ url, tokens: estimateTokens(JSON.parse(options.body)) });
    if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(proposal) }] } }] }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(proposal) } }] }) };
  };
  const context = {
    instruction: 'review NEXUS',
    discussion_transcript: Array.from({ length: 40 }, (_, i) => `argumen ${i} ` + 'z'.repeat(200)),
    huge_notes: 'x'.repeat(60000),
  };
  const result = await runWorkspaceReview(context, { env, fetchImpl, contextBudget: 6000 });
  assert.equal(result.status, 'completed');
  assert.equal(bodies.length, 13);
  for (const item of bodies) assert.ok(item.tokens <= 6000, `request melebihi budget: ${item.url} ${item.tokens}`);
});
