'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');

const SOURCE_PATH = join(__dirname, '..', 'src', 'quant', 'market-observation-shadow.mts');
const NOW = '2026-11-27T09:10:00.000Z';

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

async function modules() {
  return {
    shadow: await import('../src/quant/market-observation-shadow.mts'),
    input: await import('../src/quant/market-observation-input.mts'),
  };
}

function observation(overrides = {}) {
  const base = {
    schema_version: 'market-observation.v1',
    source: 'binance:ticker',
    symbol: 'BTCUSDT',
    interval: '24h',
    observed_at: '2026-11-27T09:09:00.000Z',
    received_at: '2026-11-27T09:09:00.500Z',
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

function resign(value) {
  const { checksum, provenance_ref, ...signed } = value;
  void checksum; void provenance_ref;
  const next = digest(signed);
  return { ...value, checksum: next, provenance_ref: next };
}

async function validInput(overrides = {}) {
  const { input } = await modules();
  return input.createQuantMarketInput(observation(overrides), { now: NOW });
}

function rejectsWith(promise, code) {
  return assert.rejects(promise, (error) => {
    assert.equal(error.name, 'ShadowInputError');
    assert.equal(error.code, code);
    return true;
  });
}

test('valid input produces a deterministic OBSERVE_ONLY receipt', async () => {
  const { shadow } = await modules();
  const input = await validInput();
  const receipt = shadow.consumeShadowObservation(input, { now: NOW });
  assert.equal(receipt.schema_version, 'market-observation-shadow.v1');
  assert.equal(input.provenance_ref, input.checksum);
  assert.equal(receipt.decision, 'OBSERVE_ONLY');
  assert.equal(receipt.symbol, 'BTCUSDT');
  assert.equal(receipt.source, 'binance:ticker');
  assert.equal(receipt.observed_at, input.observed_at);
  assert.equal(receipt.consumed_at, NOW);
  assert.equal(receipt.provenance_ref, input.provenance_ref);
  assert.equal(receipt.checksum, input.checksum);
  assert.equal(Object.isFrozen(receipt), true);
  assert.ok(receipt.reasons.some((reason) => reason.includes('NOT_A_TRADE_DECISION')));
});

test('identical input and now produce byte-identical receipts', async () => {
  const { shadow } = await modules();
  const input = await validInput();
  const first = shadow.consumeShadowObservation(input, { now: NOW });
  const second = shadow.consumeShadowObservation(input, { now: NOW });
  assert.deepEqual(first, second);
  assert.equal(first.dedupe_key, second.dedupe_key);
});

test('duplicate provenance is rejected deterministically', async () => {
  const { shadow } = await modules();
  const input = await validInput();
  const key = shadow.shadowDedupeKey(input);
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(input, { now: NOW, seen: [key] })), 'DUPLICATE_OBSERVATION');
  const other = await validInput({ observed_at: '2026-11-27T09:09:30.000Z', received_at: '2026-11-27T09:09:30.500Z' });
  assert.notEqual(shadow.shadowDedupeKey(other), key);
  const forged = { ...input, provenance_ref: 'b'.repeat(64), checksum: 'b'.repeat(64) };
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(forged, { now: NOW, seen: [key] })), 'CHECKSUM_INVALID');
});

test('stale, future and malformed timestamps are rejected', async () => {
  const { shadow } = await modules();
  const input = await validInput();
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(input, { now: '2026-11-27T10:00:00Z' })), 'STALE_OBSERVATION');
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(input, { now: '2026-11-27T09:00:00Z' })), 'FUTURE_TIMESTAMP');
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(resign({ ...input, observed_at: 'bad' }), { now: NOW })), 'TIMESTAMP_MALFORMED');
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(resign({ ...input, accepted_at: '2026-11-27T09:08:00Z' }), { now: NOW })), 'TIMESTAMP_ORDER');
});

test('allowlist cannot be bypassed by options or by adapter caller', async () => {
  const { shadow, input } = await modules();
  const sol = await Promise.resolve()
    .then(() => input.createQuantMarketInput(observation({ symbol: 'SOLUSDT' }), { now: NOW }))
    .catch(() => null);
  assert.equal(sol, null);
  const forced = { ...(await validInput()), symbol: 'SOLUSDT', payload: { ...(await validInput()).payload, symbol: 'SOLUSDT' } };
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(forced, { now: NOW, allowedSymbols: ['SOLUSDT'] })), 'SYMBOL_NOT_ALLOWED');
});

test('provenance, checksum, freshness and schema version are fail-closed', async () => {
  const { shadow } = await modules();
  const input = await validInput();
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation({ ...input, provenance_ref: 'bad' }, { now: NOW })), 'PROVENANCE_INVALID');
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation({ ...input, checksum: 'd'.repeat(64) }, { now: NOW })), 'PROVENANCE_INVALID');
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(resign({ ...input, freshness: 'unknown' }), { now: NOW })), 'FRESHNESS_REJECTED');
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(resign({ ...input, schema_version: 'market-observation-input.v9' }), { now: NOW })), 'SCHEMA_VERSION_INVALID');
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(resign({ ...input, kind: 'candle' }), { now: NOW })), 'NOT_TICKER_OBSERVATION');
});

test('secret and private-account payloads are rejected and never echoed', async () => {
  const { shadow } = await modules();
  const input = await validInput();
  const secret = ['example', 'secret', 'value'].join('-');
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(resign({
    ...input, payload: { ...input.payload, note: secret },
  }), { now: NOW })), 'SECRET_REJECTED');
  await rejectsWith(Promise.resolve().then(() => shadow.consumeShadowObservation(resign({
    ...input, payload: { ...input.payload, balances: [{ asset: 'USDT', total: 10 }] },
  }), { now: NOW })), 'PRIVATE_DATA_REJECTED');
  const receipt = shadow.consumeShadowObservation(input, { now: NOW });
  assert.equal(JSON.stringify(receipt).includes('balance'), false);
  assert.equal(JSON.stringify(receipt).includes('position'), false);
  assert.equal(JSON.stringify(receipt).includes('61000'), false);
});

test('consumer has no order, fill, ledger, reconciliation or network path', async () => {
  const mod = await import('../src/quant/market-observation-shadow.mts');
  const exported = Object.keys(mod).sort();
  for (const forbidden of ['order', 'fill', 'ledger', 'reconcile', 'gateway', 'fetch']) {
    assert.equal(exported.includes(forbidden), false, `must not export ${forbidden}`);
  }
  const source = readFileSync(SOURCE_PATH, 'utf8');
  assert.equal(/fetch\s*\(/.test(source), false);
  assert.equal(/from\s+['"][^'"]*gateway/i.test(source), false);
  for (const forbidden of ['placeOrder', 'cancelOrder', 'withdraw', 'transfer', 'setLeverage', 'setMargin']) {
    assert.equal(new RegExp(`\\b${forbidden}\\s*\\(`).test(source), false, `must not call ${forbidden}`);
  }
  assert.equal(source.includes('EXCHANGE_ACCESS_TOKEN'), false);
});

test('ticker input is never converted into OHLCV or a trade decision', async () => {
  const { shadow } = await modules();
  const receipt = shadow.consumeShadowObservation(await validInput(), { now: NOW });
  assert.equal(receipt.kind, 'observation_receipt');
  assert.equal(receipt.decision, 'OBSERVE_ONLY');
  assert.equal('candles' in receipt, false);
  assert.equal('open' in receipt, false);
  assert.ok(receipt.limitations.some((line) => line.includes('not OHLCV')));
});
