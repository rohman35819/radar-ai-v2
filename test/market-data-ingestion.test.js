'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const asset = {
  asset_id: 'ethereum:0x0000000000000000000000000000000000000001',
  asset_kind: 'token', symbol: 'TST', name: 'Test Token',
  chain: 'ethereum', contract_address: '0x0000000000000000000000000000000000000001',
  decimals: 18, provider_ids: { dexscreener: 'pair-1' }, metadata: { category: 'fixture' },
};
const observation = {
  asset, observed_at: '2026-11-26T00:00:00Z',
  source_updated_at: '2026-11-25T23:59:00Z',
  payload: { price: 1.25, volume_24h: 1000, nested: { z: 1, a: 2 } },
};
const makeResponse = (body, status = 200) => new Response(
  body === null ? null : JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
);
const options = (fetchImpl, extra = {}) => ({
  enabled: true, baseUrl: 'https://db.example.test', serviceRoleKey: 'server-only-test-key-123456',
  fetchImpl, now: () => new Date('2026-11-26T01:00:00.000Z'), ...extra,
});

test('market ingestion is disabled by default and performs no network calls', async () => {
  let calls = 0;
  const worker = (await import('../src/market-data-ingestion.mts')).createMarketDataIngestionWorker({
    fetchImpl: async () => { calls += 1; throw new Error('must not be called'); },
  });
  const result = await worker.ingest({ source: 'fixture', stream: 'spot', observations: [observation] });
  assert.deepEqual(result, { status: 'disabled', received: 0, inserted: 0 });
  assert.equal(calls, 0);
});

test('market ingestion validates batch bounds and untrusted payloads before network access', async () => {
  const { createMarketDataIngestionWorker } = await import('../src/market-data-ingestion.mts');
  let calls = 0;
  const worker = createMarketDataIngestionWorker(options(async () => { calls += 1; return makeResponse([]); }, { maxBatchSize: 1 }));
  await assert.rejects(worker.ingest({ source: 'fixture', stream: 'spot', observations: [{ ...observation, asset: { ...asset, asset_id: '../bad' } }] }), /asset_id/);
  await assert.rejects(worker.ingest({ source: 'fixture', stream: 'spot', observations: [observation, observation] }), /0\.\.1 records/);
  await assert.rejects(worker.ingest({ source: 'fixture', stream: 'spot', observations: [{ ...observation, observed_at: 'not-a-date' }] }), /valid timestamp/);
  await assert.rejects(worker.ingest({ source: 'fixture', stream: 'spot', observations: [{ ...observation, payload: { price: Number.NaN } }] }), /finite/);
  await assert.rejects(worker.ingest({ source: 'fixture', stream: 'spot', observations: [{ ...observation, asset: { ...asset, metadata: { huge: 'x'.repeat(17000) } } }] }), /byte limit/);
  assert.equal(calls, 0);
});

test('market ingestion writes assets, idempotent observations and durable checkpoint in bounded batches', async () => {
  const { createMarketDataIngestionWorker } = await import('../src/market-data-ingestion.mts');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).includes('/ingestion_runs?select=run_id')) return makeResponse([{ run_id: 'run-123' }], 201);
    if (String(url).includes('/market_observations?')) return makeResponse([{ observation_id: 7 }], 201);
    return makeResponse(null, 204);
  };
  const worker = createMarketDataIngestionWorker(options(fetchImpl));
  const result = await worker.ingest({ source: 'dexscreener', stream: 'spot', observations: [observation], cursor: { page: 4 } });
  assert.deepEqual(result, { status: 'succeeded', received: 1, inserted: 1, run_id: 'run-123' });
  assert.equal(calls.length, 5);
  assert.match(calls[1].url, /\/assets\?on_conflict=asset_id$/);
  assert.match(calls[2].url, /\/market_observations\?on_conflict=/);
  assert.equal(calls[1].headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  assert.equal(calls[1].headers['Content-Profile'], 'radar_market');
  assert.equal(calls[1].headers['Accept-Profile'], 'radar_market');
  assert.equal(calls[2].headers.Prefer, 'resolution=ignore-duplicates,return=representation');
  assert.equal(calls[2].body[0].entity_id, asset.asset_id);
  assert.match(calls[2].body[0].payload_hash, /^[a-f0-9]{64}$/);
  assert.equal(calls[2].body[0].ingestion_run_id, 'run-123');
  assert.equal(calls[3].method, 'PATCH');
  assert.equal(calls[3].body.status, 'succeeded');
  assert.equal(calls[4].body.status, 'succeeded');
  assert.deepEqual(calls[4].body.cursor, { page: 4 });
  assert.equal(calls.every((call) => call.headers.Authorization === 'Bearer server-only-test-key-123456'), true);
});

test('duplicate provider observations are accepted as an idempotent zero-insert result', async () => {
  const { createMarketDataIngestionWorker } = await import('../src/market-data-ingestion.mts');
  const fetchImpl = async (url) => {
    if (String(url).includes('/ingestion_runs?select=run_id')) return makeResponse([{ run_id: 'run-duplicate' }], 201);
    if (String(url).includes('/market_observations?')) return makeResponse([], 201);
    return makeResponse(null, 204);
  };
  const result = await createMarketDataIngestionWorker(options(fetchImpl)).ingest({
    source: 'fixture', stream: 'spot', observations: [observation],
  });
  assert.equal(result.inserted, 0);
  assert.equal(result.status, 'succeeded');
});

test('failed writes mark the run and checkpoint failed without hiding the original error', async () => {
  const { createMarketDataIngestionWorker } = await import('../src/market-data-ingestion.mts');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).includes('/ingestion_runs?select=run_id')) return makeResponse([{ run_id: 'run-failed' }], 201);
    if (String(url).includes('/assets?')) return makeResponse({ message: 'provider details must not leak' }, 429);
    return makeResponse(null, 204);
  };
  const worker = createMarketDataIngestionWorker(options(fetchImpl));
  await assert.rejects(worker.ingest({ source: 'fixture', stream: 'spot', observations: [observation] }), /HTTP 429/);
  const runPatch = calls.find((call) => call.method === 'PATCH');
  const checkpoint = calls.find((call) => call.url.includes('/ingestion_checkpoints?'));
  assert.equal(runPatch.body.status, 'failed');
  assert.equal(runPatch.body.error_code, 'POSTGREST_REQUEST_FAILED');
  assert.equal(runPatch.body.records_rejected, 1);
  assert.equal(checkpoint.body.status, 'failed');
});

test('PostgREST adapter rejects insecure remote URLs and weak credentials', async () => {
  const { createPostgrestMarketDataStore } = await import('../src/market-data-ingestion.mts');
  assert.throws(() => createPostgrestMarketDataStore({ baseUrl: 'http://db.example.test', serviceRoleKey: 'server-only-test-key-123456', fetchImpl: fetch }), /HTTPS/);
  assert.throws(() => createPostgrestMarketDataStore({ baseUrl: 'https://db.example.test', serviceRoleKey: 'short', fetchImpl: fetch }), /key is required/);
});
