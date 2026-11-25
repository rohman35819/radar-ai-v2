'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const asset = {
  asset_id: 'ethereum:0x0000000000000000000000000000000000000001',
  asset_kind: 'token', symbol: 'TST', name: 'Test Token',
  chain: 'ethereum', contract_address: '0x0000000000000000000000000000000000000001',
  decimals: 18,
};
const candle = {
  asset_id: asset.asset_id, symbol: 'TSTUSDT', interval_code: '1m',
  bucket_at: '2026-11-25T00:00:00Z', source: 'fixture',
  open: 1, high: 1.5, low: 0.9, close: 1.2, volume: 100,
  observed_at: '2026-11-25T00:01:00Z',
};
const observation = {
  source: 'fixture', entity_type: 'asset', entity_id: asset.asset_id,
  observed_at: '2026-11-25T00:00:00Z', payload: { price: 1.2 },
  payload_hash: 'a'.repeat(64),
};

test('market-data adapter is disabled by default and performs no network request', async () => {
  const { createMarketDataStore } = await import('../src/market-data-store.mts');
  let calls = 0;
  const store = createMarketDataStore({ fetchImpl: async () => { calls++; return new Response(null, { status: 204 }); } });
  const result = await store.upsertAssets([asset]);
  assert.equal(result.code, 'DISABLED');
  assert.equal(calls, 0);
});

test('asset upsert uses HTTPS, service-role auth and radar_market profile headers', async () => {
  const { createMarketDataStore } = await import('../src/market-data-store.mts');
  let request;
  const store = createMarketDataStore({
    enabled: true, supabaseUrl: 'https://db.example.test', serviceRoleKey: 'test-service-role-secret',
    fetchImpl: async (url, init) => { request = { url: String(url), init }; return new Response(null, { status: 204 }); },
  });
  const result = await store.upsertAssets([asset]);
  assert.equal(result.ok, true);
  assert.equal(result.records, 1);
  assert.equal(new URL(request.url).pathname, '/rest/v1/assets');
  assert.equal(new URL(request.url).searchParams.get('on_conflict'), 'asset_id');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers['Accept-Profile'], 'radar_market');
  assert.equal(request.init.headers['Content-Profile'], 'radar_market');
  assert.equal(request.init.headers.Authorization, 'Bearer test-service-role-secret');
  assert.equal(request.init.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
  assert.equal(JSON.parse(request.init.body)[0].asset_id, asset.asset_id);
});

test('observations use ignore-duplicates idempotency and candles use canonical asset key', async () => {
  const { createMarketDataStore } = await import('../src/market-data-store.mts');
  const calls = [];
  const store = createMarketDataStore({
    enabled: true, supabaseUrl: 'https://db.example.test', serviceRoleKey: 'secret',
    fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return new Response(null, { status: 201 }); },
  });
  assert.equal((await store.appendObservations([observation])).ok, true);
  assert.equal((await store.upsertCandles([candle])).ok, true);
  assert.equal(new URL(calls[0].url).searchParams.get('on_conflict'), 'source,entity_type,entity_id,observed_at,payload_hash');
  assert.equal(calls[0].init.headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
  assert.equal(new URL(calls[1].url).searchParams.get('on_conflict'), 'asset_id,interval_code,bucket_at,source');
  assert.equal(calls[1].init.headers.Prefer, 'resolution=merge-duplicates,return=minimal');
});

test('adapter validates payloads and caps batches before making requests', async () => {
  const { createMarketDataStore } = await import('../src/market-data-store.mts');
  let calls = 0;
  const store = createMarketDataStore({
    enabled: true, supabaseUrl: 'https://db.example.test', serviceRoleKey: 'secret',
    fetchImpl: async () => { calls++; return new Response(null, { status: 204 }); },
  });
  assert.equal((await store.upsertCandles([{ ...candle, high: 0.5 }])).code, 'INVALID_PAYLOAD');
  assert.equal((await store.upsertAssets(Array.from({ length: 251 }, () => asset))).code, 'BATCH_TOO_LARGE');
  assert.equal((await store.upsertAssets([asset])).ok, true);
  assert.equal(calls, 1);
});

test('adapter fails closed on missing/insecure config and hides HTTP/network details', async () => {
  const { createMarketDataStore } = await import('../src/market-data-store.mts');
  const missing = createMarketDataStore({ enabled: true, supabaseUrl: 'https://db.example.test' });
  assert.equal((await missing.upsertAssets([asset])).code, 'CONFIG_MISSING');
  const insecure = createMarketDataStore({ enabled: true, supabaseUrl: 'http://db.example.test', serviceRoleKey: 'secret' });
  assert.equal((await insecure.upsertAssets([asset])).code, 'CONFIG_MISSING');
  const denied = createMarketDataStore({
    enabled: true, supabaseUrl: 'https://db.example.test', serviceRoleKey: 'secret',
    fetchImpl: async () => new Response('sensitive body should not leak', { status: 403 }),
  });
  const deniedResult = await denied.upsertAssets([asset]);
  assert.equal(deniedResult.code, 'HTTP_403');
  assert.equal(JSON.stringify(deniedResult).includes('sensitive'), false);
  const offline = createMarketDataStore({
    enabled: true, supabaseUrl: 'https://db.example.test', serviceRoleKey: 'secret',
    fetchImpl: async () => { throw new Error('secret network details'); },
  });
  const offlineResult = await offline.upsertAssets([asset]);
  assert.equal(offlineResult.code, 'NETWORK_ERROR');
  assert.equal(JSON.stringify(offlineResult).includes('secret'), false);
});

test('ingestion run and checkpoint writes use their durable conflict keys', async () => {
  const { createMarketDataStore } = await import('../src/market-data-store.mts');
  const calls = [];
  const store = createMarketDataStore({
    enabled: true, supabaseUrl: 'https://db.example.test', serviceRoleKey: 'secret',
    fetchImpl: async (url, init) => { calls.push(String(url)); return new Response(null, { status: 204 }); },
  });
  const runResult = await store.recordRun({
    run_id: '20000000-0000-4000-8000-000000000001', source: 'fixture',
    stream: 'market', status: 'running', started_at: '2026-11-25T00:00:00Z',
  });
  const checkpointResult = await store.saveCheckpoint({
    source: 'fixture', stream: 'market', cursor: { page: 2 }, status: 'succeeded',
  });
  assert.equal(runResult.ok, true);
  assert.equal(checkpointResult.ok, true);
  assert.equal(new URL(calls[0]).searchParams.get('on_conflict'), 'run_id');
  assert.equal(new URL(calls[1]).searchParams.get('on_conflict'), 'source,stream');
});
