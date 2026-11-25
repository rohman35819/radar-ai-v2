'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

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

test('TypeScript snapshot contracts reject malformed API data', async () => {
  const { isRadarSnapshot, isRadarToken } = await import('../src/contracts.mts');
  assert.equal(isRadarToken({ id: 'btc', symbol: 'BTC', name: 'Bitcoin', price: '90000' }), false);
  assert.equal(isRadarSnapshot({ status: 'success', tokens: [{ id: '', symbol: 'BTC', name: 'Bitcoin' }] }), false);
  assert.equal(isRadarSnapshot({ status: 'error', tokens: [] }), false);
  assert.equal(isRadarSnapshot(null), false);
});
