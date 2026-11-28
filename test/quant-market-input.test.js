'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');

const SOURCE_PATH = join(__dirname, '..', 'src', 'quant', 'market-observation-input.mts');
const NOW = '2026-11-27T09:00:00.000Z';

// Mirrors the gateway/adapter canonical digest so fixtures carry a real attestation.
function digest(value) {
  const sort = (item) => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === 'object') {
      const out = {};
      for (const key of Object.keys(item).sort()) if (item[key] !== undefined) out[key] = sort(item[key]);
      return out;
    }
    return item;
  };
  return createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');
}

async function adapter() {
  return import('../src/quant/market-observation-input.mts');
}

function observation(overrides = {}) {
  const base = {
    schema_version: 'market-observation.v1',
    source: 'binance:ticker',
    symbol: 'BTCUSDT',
    interval: '24h',
    observed_at: '2026-11-27T08:59:00.000Z',
    received_at: '2026-11-27T08:59:00.500Z',
    is_complete: true,
    freshness: 'fresh',
    payload: {
      exchange: 'binance',
      symbol: 'BTCUSDT',
      spot: { last_price: 61000, change_pct: 1.2, high_24h: 62000, low_24h: 60000, quote_volume_24h: 1e9 },
      futures: { last_price: 61100 },
    },
    ...overrides,
  };
  const { checksum, provenance_ref, ...signed } = base;
  void checksum; void provenance_ref;
  const value = digest(signed);
  if (!('provenance_ref' in overrides)) base.provenance_ref = value;
  if (!('checksum' in overrides)) base.checksum = value;
  return base;
}

function rejectsWith(promise, code) {
  return assert.rejects(promise, (error) => {
    assert.equal(error.name, 'QuantInputError');
    assert.equal(error.code, code);
    return true;
  });
}

test('valid market observation is accepted with explicit provenance and injected now', async () => {
  const { createQuantMarketInput, isMarketObservationInputV1 } = await adapter();
  const source = observation();
  const input = createQuantMarketInput(source, { now: NOW });
  assert.equal(isMarketObservationInputV1(input), true);
  assert.equal(input.schema_version, 'market-observation-input.v1');
  assert.equal(input.symbol, 'BTCUSDT');
  assert.equal(input.observed_at, '2026-11-27T08:59:00.000Z');
  assert.equal(input.received_at, '2026-11-27T08:59:00.500Z');
  assert.equal(input.accepted_at, NOW);
  assert.equal(input.provenance_ref, input.checksum);
  assert.match(input.checksum, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(input), true);
});

test('stale, future, malformed and out-of-order timestamps are rejected', async () => {
  const { createQuantMarketInput } = await adapter();
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation(), { now: '2026-11-27T10:00:00Z' })), 'STALE_OBSERVATION');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ observed_at: '2026-11-27T10:00:00Z' }), { now: NOW })), 'FUTURE_TIMESTAMP');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ observed_at: 'not-a-time' }), { now: NOW })), 'TIMESTAMP_MALFORMED');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ observed_at: '2026-11-27T08:59:00' }), { now: NOW })), 'TIMESTAMP_MALFORMED');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ received_at: '2026-11-27T08:58:00Z' }), { now: NOW })), 'TIMESTAMP_ORDER');
  const bounded = createQuantMarketInput(observation(), { now: NOW, maxAgeMs: 120000 });
  assert.equal(bounded.kind, 'market_ticker');
});

test('freshness unknown/stale and incomplete observations are rejected', async () => {
  const { createQuantMarketInput } = await adapter();
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ freshness: 'unknown' }), { now: NOW })), 'FRESHNESS_UNKNOWN');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ freshness: 'stale' }), { now: NOW })), 'FRESHNESS_STALE');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ is_complete: false }), { now: NOW })), 'INCOMPLETE_OBSERVATION');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ freshness: undefined }), { now: NOW })), 'FRESHNESS_UNKNOWN');
});

test('symbol allowlist and symbol format are enforced explicitly', async () => {
  const { createQuantMarketInput, RESEARCH_ALLOWED_SYMBOLS } = await adapter();
  assert.deepEqual([...RESEARCH_ALLOWED_SYMBOLS], ['BTCUSDT', 'ETHUSDT']);
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ symbol: 'SOLUSDT' }), { now: NOW })), 'SYMBOL_NOT_ALLOWED');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ symbol: 'BTC;DROP' }), { now: NOW })), 'SYMBOL_INVALID');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ symbol: 'BTC' }), { now: NOW })), 'SYMBOL_INVALID');
  const eth = createQuantMarketInput(observation({ symbol: 'ethusdt' }), { now: NOW });
  assert.equal(eth.symbol, 'ETHUSDT');
  const callerAttempt = /** @type {any} */ ({ now: NOW, allowedSymbols: ['SOLUSDT'] });
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ symbol: 'SOLUSDT' }), callerAttempt)), 'SYMBOL_NOT_ALLOWED');
  assert.deepEqual([...RESEARCH_ALLOWED_SYMBOLS], ['BTCUSDT', 'ETHUSDT']);
});

test('provenance, checksum, source and interval are fail-closed', async () => {
  const { createQuantMarketInput } = await adapter();
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ provenance_ref: 'bad' }), { now: NOW })), 'PROVENANCE_INVALID');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ checksum: 'bad' }), { now: NOW })), 'CHECKSUM_INVALID');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ checksum: 'b'.repeat(64) }), { now: NOW })), 'PROVENANCE_INVALID');
  const forged = { ...observation(), provenance_ref: 'f'.repeat(64), checksum: 'f'.repeat(64) };
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(forged, { now: NOW })), 'CHECKSUM_INVALID');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ source: 'unknown:api' }), { now: NOW })), 'SOURCE_NOT_ALLOWED');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ interval: '1m' }), { now: NOW })), 'INTERVAL_UNSUPPORTED');
});

test('secret and private-account payload fields are rejected', async () => {
  const { createQuantMarketInput } = await adapter();
  const secret = ['example', 'secret', 'value'].join('-');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({
    payload: { ...observation().payload, note: secret },
  }), { now: NOW })), 'SECRET_REJECTED');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({
    payload: { ...observation().payload, balances: [{ asset: 'USDT', total: 10 }] },
  }), { now: NOW })), 'PRIVATE_DATA_REJECTED');
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({
    payload: { ...observation().payload, spot: { ...observation().payload.spot, position: 'LONG' } },
  }), { now: NOW })), 'PRIVATE_DATA_REJECTED');
});

test('ticker output is explicitly not OHLCV and never becomes a candle', async () => {
  const { createQuantMarketInput } = await adapter();
  const input = createQuantMarketInput(observation(), { now: NOW });
  assert.equal(input.kind, 'market_ticker');
  assert.equal(input.is_ohlcv, false);
  assert.equal('candles' in input, false);
  assert.equal('ohlcv' in input.payload, false);
  assert.ok(input.limitations.some((line) => line.includes('NOT OHLCV candles')));
  const source = readFileSync(SOURCE_PATH, 'utf8');
  assert.equal(/fetch\s*\(/.test(source), false);
  assert.equal(/from\s+['"][^'"]*gateway/i.test(source), false);
  assert.equal(/from\s+['"][^'"]*(python|backtest)|import\(['"][^'"]*(python|backtest)/i.test(source), false);
});

test('adapter has no order, transfer, withdrawal or private-account path', async () => {
  const mod = await adapter();
  const exported = Object.keys(mod).sort();
  assert.equal(exported.includes('order'), false);
  assert.equal(exported.includes('getAccountSnapshot'), false);
  assert.equal(exported.includes('withdraw'), false);
  assert.equal(exported.includes('transfer'), false);
  const source = readFileSync(SOURCE_PATH, 'utf8');
  for (const forbidden of ['placeOrder', 'cancelOrder', 'withdraw', 'transfer', 'setLeverage', 'setMargin', 'getAccountSnapshot']) {
    assert.equal(new RegExp(`\\b${forbidden}\\s*\\(`).test(source), false, `must not call ${forbidden}`);
  }
  assert.equal(source.includes('EXCHANGE_ACCESS_TOKEN'), false);
});

test('stale data cannot be made fresh by changing received_at', async () => {
  const { createQuantMarketInput } = await adapter();
  const stale = observation({ received_at: '2026-11-27T12:00:00Z' });
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(stale, { now: NOW })), 'FUTURE_TIMESTAMP');
  assert.equal(stale.received_at, '2026-11-27T12:00:00Z');
});


test('Bybit ticker source is rejected by the Binance-only research contract', async () => {
  const { createQuantMarketInput } = await adapter();
  await rejectsWith(Promise.resolve().then(() => createQuantMarketInput(observation({ source: 'bybit:ticker' }), { now: NOW })), 'SOURCE_NOT_ALLOWED');
});
