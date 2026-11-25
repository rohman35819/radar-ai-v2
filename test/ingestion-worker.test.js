'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const asset = {
  asset_id: 'ethereum:0x0000000000000000000000000000000000000001',
  asset_kind: 'token', symbol: 'TST', name: 'Test Token',
  chain: 'ethereum', contract_address: '0x0000000000000000000000000000000000000001',
  decimals: 18,
};
const observation = {
  source: 'fixture', entity_type: 'asset', entity_id: asset.asset_id,
  observed_at: '2026-11-25T00:00:00Z', payload: { price: 1.2 },
  payload_hash: 'a'.repeat(64),
};

function makeStore(overrides = {}) {
  const calls = [];
  const ok = async (name, rows = []) => {
    calls.push({ name, rows });
    return { ok: true, code: rows.length ? 'STORED' : 'EMPTY', records: rows.length };
  };
  return {
    calls,
    store: {
      recordRun: row => ok('run', [row]),
      saveCheckpoint: row => ok('checkpoint', [row]),
      upsertAssets: rows => ok('assets', rows),
      appendObservations: rows => ok('observations', rows),
      upsertCandles: rows => ok('candles', rows),
      ...overrides,
    },
  };
}

const task = (source, fetchBatch, cursor = { page: 1 }) => ({
  source, stream: 'market', cursor, fetchBatch,
});

test('worker is disabled by default and does not touch store or providers', async () => {
  const { store, calls } = makeStore();
  let fetched = 0;
  const worker = createWorker({ store });
  const result = await worker.runOnce([task('fixture', async () => { fetched++; return { nextCursor: {} }; })]);
  assert.equal(result.code, 'DISABLED');
  assert.equal(fetched, 0);
  assert.equal(calls.length, 0);
});

test('worker writes validated data and commits the next cursor only after successful writes', async () => {
  const { store, calls } = makeStore();
  const worker = createWorker({ enabled: true, store, createRunId: () => '20000000-0000-4000-8000-000000000001' });
  const result = await worker.runOnce([task('fixture', async cursor => {
    assert.deepEqual(cursor, { page: 1 });
    return { assets: [asset], observations: [observation], nextCursor: { page: 2 } };
  })]);
  assert.equal(result.code, 'COMPLETED');
  assert.deepEqual(calls.map(call => call.name), ['run', 'checkpoint', 'assets', 'observations', 'candles', 'run', 'checkpoint']);
  assert.equal(calls.at(-1).rows[0].cursor.page, 2);
  assert.equal(calls.at(-1).rows[0].status, 'succeeded');
});

test('failed data write leaves the original cursor unadvanced and marks the task failed', async () => {
  const { store, calls } = makeStore({
    appendObservations: async () => ({ ok: false, code: 'HTTP_503', records: 0 }),
  });
  const worker = createWorker({ enabled: true, store, createRunId: () => '20000000-0000-4000-8000-000000000002' });
  const result = await worker.runOnce([task('fixture', async () => ({
    assets: [asset], observations: [observation], nextCursor: { page: 99 },
  }))]);
  assert.equal(result.code, 'PARTIAL');
  assert.equal(result.tasks[0].code, 'STORE_WRITE_FAILED');
  const failedCheckpoint = calls.filter(call => call.name === 'checkpoint').at(-1).rows[0];
  assert.deepEqual(failedCheckpoint.cursor, { page: 1 });
  assert.equal(failedCheckpoint.status, 'failed');
});

test('provider failure does not advance checkpoint and does not stop another source', async () => {
  const { store } = makeStore();
  const worker = createWorker({ enabled: true, concurrency: 2, store });
  const result = await worker.runOnce([
    task('broken', async () => { throw new Error('private provider detail'); }),
    task('healthy', async () => ({ nextCursor: { page: 2 } })),
  ]);
  assert.equal(result.code, 'PARTIAL');
  assert.deepEqual(result.tasks.map(item => item.source), ['broken', 'healthy']);
  assert.equal(result.tasks[0].code, 'PROVIDER_FETCH_FAILED');
  assert.equal(result.tasks[1].ok, true);
  assert.equal(JSON.stringify(result).includes('private provider detail'), false);
});

test('worker bounds parallel tasks and preserves input result order', async () => {
  const { store } = makeStore();
  let active = 0;
  let maximum = 0;
  const worker = createWorker({ enabled: true, concurrency: 99, store });
  const tasks = Array.from({ length: 7 }, (_, index) => task(`source-${index}`, async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, (6 - index) * 2));
    active--;
    return { nextCursor: { page: index + 2 } };
  }));
  const result = await worker.runOnce(tasks);
  assert.equal(maximum, 3);
  assert.deepEqual(result.tasks.map(item => item.source), tasks.map(item => item.source));
});

test('worker rejects duplicate streams, malformed provider payloads and oversized batches', async () => {
  const { store, calls } = makeStore();
  const worker = createWorker({ enabled: true, store });
  const duplicate = await worker.runOnce([
    task('same', async () => ({ nextCursor: {} })),
    task('same', async () => ({ nextCursor: {} })),
  ]);
  assert.equal(duplicate.code, 'INVALID_TASKS');
  const malformed = await worker.runOnce([task('bad', async () => ({
    observations: [{ ...observation, payload: { huge: 'x'.repeat(66000) } }], nextCursor: {},
  }))]);
  assert.equal(malformed.tasks[0].code, 'INVALID_PROVIDER_BATCH');
  const oversized = await worker.runOnce([task('large', async () => ({
    assets: Array.from({ length: 251 }, () => asset), nextCursor: {},
  }))]);
  assert.equal(oversized.tasks[0].code, 'INVALID_PROVIDER_BATCH');
  assert.equal(calls.filter(call => ['assets', 'observations', 'candles'].includes(call.name)).length, 0);
});

async function createWorker(options) {
  const { createIngestionWorker } = await import('../src/ingestion-worker.mts');
  return createIngestionWorker(options);
}
