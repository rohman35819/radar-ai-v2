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
const run = {
  run_id: '20000000-0000-4000-8000-000000000001', source: 'fixture',
  stream: 'market', status: 'running', started_at: '2026-11-25T00:00:00Z',
};
const checkpoint = {
  source: 'fixture', stream: 'market', cursor: { page: 2 },
  status: 'succeeded', last_attempt_at: '2026-11-25T00:00:00Z',
  last_success_at: '2026-11-25T00:00:00Z',
};

test('TypeScript snapshot contracts validate the existing API shape', async () => {
  const { isRadarSnapshot, isRadarToken } = await import('../src/contracts.mts');
  const token = {
    id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin',
    price: 90000, market_cap: 1e12, volume_24h: 2e10,
    change_24h: 1.5, last_ok: '2026-11-25T12:00:00.000Z',
    fundamental: null, vol10m: null,
  };
  assert.equal(isRadarToken(token), true);
  assert.equal(isRadarSnapshot({
    status: 'success', server_time: '2026-11-25T12:00:00.000Z',
    last_ok: token.last_ok, stale: false, tokens: [token],
  }), true);
});

test('market-data contracts validate canonical asset, OHLCV, provenance and checkpoints', async () => {
  const { isRadarAsset, isRadarCandle, isMarketObservation, isIngestionRun, isIngestionCheckpoint } =
    await import('../src/contracts.mts');
  assert.equal(isRadarAsset(asset), true);
  assert.equal(isRadarCandle(candle), true);
  assert.equal(isMarketObservation(observation), true);
  assert.equal(isIngestionRun(run), true);
  assert.equal(isIngestionCheckpoint(checkpoint), true);
  assert.equal(isRadarCandle({ ...candle, high: 0.5 }), false);
  assert.equal(isRadarCandle({ ...candle, bucket_at: 'not-a-time' }), false);
  assert.equal(isMarketObservation({ ...observation, payload_hash: 'bad' }), false);
  assert.equal(isRadarAsset({ ...asset, chain: null }), false);
  assert.equal(isMarketObservation({ ...observation, source_updated_at: 'not-a-time' }), false);
  assert.equal(isIngestionRun({ ...run, run_id: 'not-a-uuid' }), false);
});

test('TypeScript snapshot contracts reject malformed API data', async () => {
  const { isRadarSnapshot, isRadarToken } = await import('../src/contracts.mts');
  assert.equal(isRadarToken({ id: 'btc', symbol: 'BTC', name: 'Bitcoin', price: '90000' }), false);
  assert.equal(isRadarSnapshot({ status: 'success', tokens: [{ id: '', symbol: 'BTC', name: 'Bitcoin' }] }), false);
  assert.equal(isRadarSnapshot({ status: 'error', tokens: [] }), false);
  assert.equal(isRadarSnapshot(null), false);
});
