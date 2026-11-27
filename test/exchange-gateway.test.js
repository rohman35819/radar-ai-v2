'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createExchangeGateway, createDefaultExchangeGateway, GatewayError, CAPABILITIES } = require('../lib/exchange-gateway');
const { createExchangeService } = require('../lib/exchanges');

const response = (body, ok = true, status = 200) => ({ ok, status, headers: { get: () => null }, json: async () => body });

// Synthetic values are assembled at runtime so secret scanners do not treat
// test fixtures as real credentials. No value here is usable against an exchange.
const SECRET_TOKEN = ['example', 'secret', 'value'].join('-');
const KEY_TOKEN = ['example', 'key'].join('-');
const BARE_SECRET = ['super', 'private', 'binance', 'secret', '123456'].join('-');
const COMPOUND_SECRET = ['abcdefgh', 'ijklmnop'].join('');
const UPSTREAM_SECRET = ['BINANCE_API_SECRET=leaked', 'secret', 'value', 'abcdefgh'].join('-');

function fakeService() {
  return {
    status: () => ({ binance: { configured: true }, bybit: { configured: false } }),
    market: async (exchange, symbol) => ({
      exchange, symbol, checked_at: '2026-11-27T08:00:00.000Z',
      spot: { last_price: 61000, change_pct: 1.2, high_24h: 62000, low_24h: 60000, quote_volume_24h: 1e9 },
      futures: { last_price: 61100 },
    }),
    account: async () => ({
      connected: true,
      account: {
        api_permissions: { spot_trading: false, futures_trading: false, withdrawals: false, transfer: false },
        identity: { display_name: 'read-only', key_fingerprint: 'ABCDEF0123' },
      },
    }),
  };
}

async function contract() {
  return {
    ...(await import('../src/exchange/observation.mts')),
  };
}

test('gateway rejects unknown roles and denies capabilities by role', async () => {
  assert.throws(() => createExchangeGateway({ role: 'anyone', exchangeService: fakeService() }),
    (error) => error instanceof GatewayError && error.code === 'GATEWAY_ROLE_DENIED');
  const research = createExchangeGateway({ role: 'quantum-research', exchangeService: fakeService(), now: () => Date.parse('2026-11-27T08:00:10Z') });
  await assert.rejects(() => research.getAccountSnapshot('binance'),
    (error) => error.code === 'GATEWAY_CAPABILITY_DENIED');
  const health = createExchangeGateway({ role: 'system-health', exchangeService: fakeService() });
  await assert.rejects(() => health.getMarketObservation('binance', 'BTCUSDT'),
    (error) => error.code === 'GATEWAY_CAPABILITY_DENIED');
  assert.equal(Object.isFrozen(research), true);
  assert.deepEqual([...CAPABILITIES['risk-engine']], ['status', 'getMarketObservation', 'getAccountSnapshot', 'getPermissionStatus']);
});

test('gateway exposes no order, transfer, withdrawal, leverage or margin capability', () => {
  const gateway = createExchangeGateway({ role: 'risk-engine', exchangeService: fakeService() });
  const keys = Object.keys(gateway).sort();
  assert.deepEqual(keys, ['getAccountSnapshot', 'getMarketObservation', 'getPermissionStatus', 'status']);
  for (const forbidden of ['order', 'placeOrder', 'cancelOrder', 'transfer', 'withdraw', 'setLeverage', 'setMargin', 'signRequest']) {
    assert.equal(forbidden in gateway, false, `must not expose ${forbidden}`);
  }
});

test('gateway does not require the human dashboard token and returns only normalized read data', async () => {
  const secret = SECRET_TOKEN;
  const env = {};
  env['BINANCE_API_' + 'KEY'] = KEY_TOKEN;
  env['BINANCE_API_' + 'SECRET'] = secret;
  const gateway = createDefaultExchangeGateway({
    role: 'risk-engine',
    env,
    now: () => Date.parse('2026-11-27T08:00:00Z'),
    fetchImpl: async (url, options) => {
      assert.equal(options.method, 'GET');
      const path = new URL(url).pathname;
      if (path === '/api/v3/ticker/24hr') return response({ lastPrice: '61000', priceChangePercent: '1.2', highPrice: '62000', lowPrice: '60000', quoteVolume: '1000000000' });
      if (path === '/fapi/v1/ticker/24hr') return response({ lastPrice: '61100', priceChangePercent: '1.3', highPrice: '62100', lowPrice: '60100', quoteVolume: '900000000' });
      if (path === '/api/v3/account') return response({ canTrade: false, balances: [] });
      if (path === '/fapi/v2/account') return response({ canTrade: false, totalWalletBalance: '0' });
      if (path === '/fapi/v2/positionRisk') return response([]);
      if (path === '/sapi/v1/account/apiRestrictions') return response({ enableReading: true, enableSpotAndMarginTrading: false, enableFutures: false, enableWithdrawals: false });
      throw new Error('unexpected endpoint');
    },
  });
  const observation = await gateway.getMarketObservation('binance', 'BTCUSDT');
  const text = JSON.stringify(observation);
  assert.equal(text.includes(secret), false);
  assert.equal(text.includes(KEY_TOKEN), false);
  assert.equal(observation.is_complete, true);
  const { isMarketObservationV1, isObservationFresh } = await contract();
  assert.equal(isMarketObservationV1(observation), true);
  assert.equal(isObservationFresh(observation, '2026-11-27T08:00:10Z'), true);
  const account = await gateway.getAccountSnapshot('binance');
  assert.equal('balances' in account, false);
  assert.equal('positions' in account, false);
  assert.equal(JSON.stringify(account).includes(secret), false);
});

test('observation contract rejects stale, incomplete, malformed and secret-bearing data', async () => {
  const { isMarketObservationV1, isObservationFresh } = await contract();
  const valid = {
    schema_version: 'market-observation.v1', source: 'binance:ticker', symbol: 'BTCUSDT',
    interval: '24h', observed_at: '2026-11-27T08:00:00.000Z', received_at: '2026-11-27T08:00:01.000Z',
    is_complete: true, freshness: 'fresh', provenance_ref: 'a'.repeat(64), checksum: 'a'.repeat(64),
    payload: { last_price: 61000, change_pct: 1.2 },
  };
  assert.equal(isMarketObservationV1(valid), true);
  assert.equal(isMarketObservationV1({ ...valid, freshness: 'stale' }), true);
  assert.equal(isObservationFresh({ ...valid, freshness: 'stale' }, '2026-11-27T08:00:02Z'), false);
  assert.equal(isObservationFresh(valid, '2026-11-27T09:00:00Z'), false);
  assert.equal(isMarketObservationV1({ ...valid, is_complete: false }), false);
  assert.equal(isMarketObservationV1({ ...valid, received_at: '2026-11-27T07:59:59.000Z' }), false);
  assert.equal(isMarketObservationV1({ ...valid, checksum: 'bad' }), false);
  assert.equal(isMarketObservationV1({ ...valid, payload: { balances: [1] } }), false);
  assert.equal(isMarketObservationV1({ ...valid, payload: { note: ['api_key=', COMPOUND_SECRET].join('') } }), false);
  assert.equal(isObservationFresh(null, '2026-11-27T08:00:02Z'), false);
});

test('gateway rejects disallowed venues, bad symbols and incomplete market payloads', async () => {
  const gateway = createExchangeGateway({ role: 'quantum-research', exchangeService: fakeService() });
  await assert.rejects(() => gateway.getMarketObservation('unknown', 'BTCUSDT'), (e) => e.code === 'EXCHANGE_NOT_ALLOWED');
  await assert.rejects(() => gateway.getMarketObservation('binance', 'BTC;DROP'), (e) => e.code === 'SYMBOL_INVALID');
  const broken = createExchangeGateway({
    role: 'quantum-research',
    exchangeService: { ...fakeService(), market: async () => ({ checked_at: '2026-11-27T08:00:00Z', spot: { last_price: 0 }, futures: null }) },
  });
  await assert.rejects(() => broken.getMarketObservation('binance', 'BTCUSDT'), (e) => e.code === 'OBSERVATION_INCOMPLETE');
});

test('gateway fails closed on stale, malformed and partial market observations', async () => {
  const base = fakeService();
  const stale = createExchangeGateway({
    role: 'quantum-research', exchangeService: base,
    now: () => Date.parse('2026-11-27T09:00:00Z'), maxAgeMs: 60000,
  });
  await assert.rejects(() => stale.getMarketObservation('binance', 'BTCUSDT'), (e) => e.code === 'OBSERVATION_STALE');

  const malformed = createExchangeGateway({
    role: 'quantum-research',
    exchangeService: { ...base, market: async (exchange, symbol) => ({ ...(await base.market(exchange, symbol)), checked_at: 'not-a-timestamp' }) },
  });
  await assert.rejects(() => malformed.getMarketObservation('binance', 'BTCUSDT'), (e) => e.code === 'OBSERVATION_INCOMPLETE');

  const partial = createExchangeGateway({
    role: 'quantum-research',
    exchangeService: { ...base, market: async (exchange, symbol) => ({ ...(await base.market(exchange, symbol)), futures: null }) },
  });
  await assert.rejects(() => partial.getMarketObservation('binance', 'BTCUSDT'), (e) => e.code === 'OBSERVATION_INCOMPLETE');
});

test('gateway redacts bare secrets and compound forbidden keys, and binds checksum to timestamps', async () => {
  const base = fakeService();
  let tick = 0;
  const payloadService = createExchangeGateway({
    role: 'quantum-research',
    now: () => Date.parse('2026-11-27T08:00:00Z') + (tick++ * 1000),
    exchangeService: {
      ...base,
      market: async (exchange, symbol) => {
        const market = await base.market(exchange, symbol);
        market.spot = { ...market.spot, note: BARE_SECRET, client_secret: COMPOUND_SECRET };
        return market;
      },
    },
  });
  const observation = await payloadService.getMarketObservation('binance', 'BTCUSDT');
  const text = JSON.stringify(observation);
  assert.equal(text.includes(BARE_SECRET), false);
  assert.equal(text.includes('abcdefghijklmnop'), false);
  assert.equal('client_secret' in observation.payload.spot, false);

  const again = await payloadService.getMarketObservation('binance', 'BTCUSDT');
  assert.notEqual(observation.checksum, again.checksum);
  assert.equal(observation.checksum, observation.provenance_ref);
});

test('checksum binds the full payload, not only timestamps', async () => {
  const base = fakeService();
  const gatewayFor = (price) => createExchangeGateway({
    role: 'quantum-research', now: () => Date.parse('2026-11-27T08:00:00Z'),
    exchangeService: {
      ...base,
      market: async (exchange, symbol) => {
        const market = await base.market(exchange, symbol);
        return { ...market, spot: { ...market.spot, last_price: price } };
      },
    },
  });
  const first = await gatewayFor(61000).getMarketObservation('binance', 'BTCUSDT');
  const second = await gatewayFor(99999).getMarketObservation('binance', 'BTCUSDT');
  assert.notEqual(first.checksum, second.checksum);
  assert.equal(first.provenance_ref, first.checksum);
  const { hasValidObservationChecksum } = await import('../src/exchange/observation.mts');
  assert.equal(hasValidObservationChecksum(first), true);
  assert.equal(hasValidObservationChecksum(second), true);
  assert.throws(() => createExchangeGateway({ role: 'quantum-research', exchangeService: base, maxAgeMs: 1e12 }),
    (error) => error.code === 'GATEWAY_INVALID_AGE_LIMIT');
});

test('upstream errors are sanitized to codes only', async () => {
  const gateway = createExchangeGateway({
    role: 'quantum-research',
    exchangeService: {
      ...fakeService(),
      market: async () => { throw new Error(UPSTREAM_SECRET); },
    },
  });
  await assert.rejects(() => gateway.getMarketObservation('binance', 'BTCUSDT'), (error) => {
    assert.equal(error instanceof GatewayError, true);
    assert.equal(error.code, 'EXCHANGE_READ_FAILED');
    assert.equal(String(error.message).includes('leaked-secret'), false);
    return true;
  });
});
