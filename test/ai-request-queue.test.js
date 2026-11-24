'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_CONCURRENT_REQUESTS,
  MAX_PENDING_REQUESTS,
  runWithAIRequestSlot,
  getAIRequestQueueSnapshot
} = require('../lib/ai/request-queue');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('AI request queue enforces two active calls and drains pending work FIFO', async () => {
  assert.equal(MAX_CONCURRENT_REQUESTS, 2);
  assert.equal(MAX_PENDING_REQUESTS, 12);
  const gates = [deferred(), deferred()];
  const started = [];
  const active = [];
  const first = runWithAIRequestSlot(async () => { active.push(1); started.push('active-1'); await gates[0].promise; active.pop(); });
  const second = runWithAIRequestSlot(async () => { active.push(2); started.push('active-2'); await gates[1].promise; active.pop(); });
  await Promise.resolve();
  const waiting = Array.from({ length: 5 }, (_, i) => runWithAIRequestSlot(async () => { started.push('queued-' + i); }));
  assert.deepEqual(started, ['active-1', 'active-2']);
  assert.equal(getAIRequestQueueSnapshot().active, 2);
  assert.equal(getAIRequestQueueSnapshot().pending, 5);
  gates[0].resolve();
  gates[1].resolve();
  await Promise.all([first, second, ...waiting]);
  assert.deepEqual(started, ['active-1', 'active-2', 'queued-0', 'queued-1', 'queued-2', 'queued-3', 'queued-4']);
  assert.equal(getAIRequestQueueSnapshot().active, 0);
  assert.equal(getAIRequestQueueSnapshot().pending, 0);
});

test('AI request queue refuses the thirteenth waiting task without exceeding capacity', async () => {
  const gates = [deferred(), deferred()];
  const first = runWithAIRequestSlot(() => gates[0].promise);
  const second = runWithAIRequestSlot(() => gates[1].promise);
  await Promise.resolve();
  const waiting = Array.from({ length: MAX_PENDING_REQUESTS }, () => runWithAIRequestSlot(async () => 'done'));
  const before = getAIRequestQueueSnapshot();
  assert.equal(before.active, 2);
  assert.equal(before.pending, 12);
  assert.equal(before.total_in_system, 14);
  assert.equal(before.status, 'FULL');
  await assert.rejects(
    runWithAIRequestSlot(async () => 'must-not-enter'),
    (error) => error.code === 'AI_QUEUE_FULL' && error.statusCode === 503
  );
  assert.equal(getAIRequestQueueSnapshot().pending, MAX_PENDING_REQUESTS);
  assert.equal(getAIRequestQueueSnapshot().rejected_since_restart, before.rejected_since_restart + 1);
  gates[0].resolve();
  gates[1].resolve();
  await Promise.all([first, second, ...waiting]);
  const after = getAIRequestQueueSnapshot();
  assert.equal(after.active, 0);
  assert.equal(after.pending, 0);
  assert.equal(after.total_in_system, 0);
});

test('queue exposes only operational counters and reports idle after draining', () => {
  const snapshot = getAIRequestQueueSnapshot();
  assert.equal(snapshot.status, 'IDLE');
  assert.equal(snapshot.policy, 'FIFO');
  assert.equal(snapshot.max_total, 14);
  assert.equal(JSON.stringify(snapshot).includes('api_key'), false);
});

test('queue-full rejection does not call provider or count provider usage', async () => {
  const { requestStructured } = require('../lib/ai/chat-completions');
  const gates = [deferred(), deferred()];
  const first = runWithAIRequestSlot(() => gates[0].promise);
  const second = runWithAIRequestSlot(() => gates[1].promise);
  await Promise.resolve();
  const waiting = Array.from({ length: MAX_PENDING_REQUESTS }, () => runWithAIRequestSlot(async () => 'done'));
  const events = [];
  await assert.rejects(requestStructured({
    provider: 'groq', apiKey: 'configured', baseUrl: 'https://example.invalid', model: 'mock',
    messages: [{ role: 'user', content: 'test' }],
    onUsage: (event) => events.push(event),
    fetchImpl: async () => { throw new Error('provider must not be called'); }
  }), (error) => error.code === 'AI_QUEUE_FULL');
  assert.deepEqual(events, []);
  gates[0].resolve();
  gates[1].resolve();
  await Promise.all([first, second, ...waiting]);
});


test('provider queue holds its slot until the complete response body is consumed', async () => {
  const { requestStructured } = require('../lib/ai/chat-completions');
  const gates = [deferred(), deferred(), deferred()];
  let fetchCalls = 0;
  const responsePayload = {
    usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
    choices: [{ message: { content: JSON.stringify({
      decision: 'WAIT', confidence_score: 5, timeframe: '1h',
      reasons: [], risks: [], missing_data: [], summary: 'queue test'
    }) } }]
  };
  const fetchImpl = async () => {
    const index = fetchCalls++;
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      json: () => gates[index].promise
    };
  };
  const options = {
    provider: 'groq', apiKey: 'configured', baseUrl: 'https://example.invalid', model: 'mock',
    messages: [{ role: 'user', content: 'test' }], retryDelayMs: 0, fetchImpl
  };
  const first = requestStructured(options);
  const second = requestStructured(options);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls, 2);
  assert.equal(getAIRequestQueueSnapshot().active, 2);

  const third = requestStructured(options);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls, 2, 'third upstream request must wait while both response bodies are pending');
  assert.equal(getAIRequestQueueSnapshot().pending, 1);

  gates[0].resolve(responsePayload);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls, 3, 'next request starts only after a prior body has been consumed');

  gates[1].resolve(responsePayload);
  gates[2].resolve(responsePayload);
  await Promise.all([first, second, third]);
  assert.equal(getAIRequestQueueSnapshot().active, 0);
  assert.equal(getAIRequestQueueSnapshot().pending, 0);
});

test('AI Workspace holds provider queue slot until response body is consumed', async () => {
  const { requestCompatible } = require('../lib/ai/workspace');
  const gates = [deferred(), deferred(), deferred()];
  let fetchCalls = 0;
  const payload = {
    choices: [{ message: { content: JSON.stringify({ observation: 'test', proposals: [], challenge: '', self_critique: '', reply_to_others: '' }) } }]
  };
  const fetchImpl = async () => {
    const index = fetchCalls++;
    return { ok: true, status: 200, headers: { get: () => null }, json: () => gates[index].promise };
  };
  const options = {
    provider: 'groq', apiKey: 'test-key', baseUrl: 'https://example.invalid',
    model: 'mock-model', context: {}, fetchImpl, retryDelayMs: 0
  };
  const first = requestCompatible(options);
  const second = requestCompatible(options);
  await Promise.resolve();
  await Promise.resolve();
  const third = requestCompatible(options);
  await Promise.resolve();
  assert.equal(fetchCalls, 2);
  assert.equal(getAIRequestQueueSnapshot().active, 2);
  assert.equal(getAIRequestQueueSnapshot().pending, 1);
  gates[0].resolve(payload);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls, 3);
  gates[1].resolve(payload);
  gates[2].resolve(payload);
  await Promise.all([first, second, third]);
  assert.equal(getAIRequestQueueSnapshot().active, 0);
  assert.equal(getAIRequestQueueSnapshot().pending, 0);
});


test('AI Workspace preserves response status when provider JSON parsing fails', async () => {
  const { requestCompatible } = require('../lib/ai/workspace');
  const events = [];
  await assert.rejects(requestCompatible({
    provider: 'groq', apiKey: 'test-key', baseUrl: 'https://example.invalid',
    model: 'mock-model', context: {}, retryDelayMs: 0,
    onUsage: (event) => events.push(event),
    fetchImpl: async () => ({
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => { throw new Error('synthetic malformed response'); }
    })
  }), /respons bukan JSON/);
  assert.equal(events.length, 1);
  assert.equal(events[0].statusCode, 200);
  assert.equal(events[0].ok, false);
});
