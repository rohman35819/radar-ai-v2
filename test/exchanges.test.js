'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createExchangeService, ExchangeError } = require('../lib/exchanges');

const response = (body, ok = true, status = 200, headers = {}) => ({ ok, status, headers: { get: (name) => headers[String(name).toLowerCase()] || null }, json: async () => body });

test('status hanya mengungkap keberadaan konfigurasi, bukan nilai kredensial', () => {
  const service = createExchangeService({ env: { BINANCE_API_KEY: 'key', BINANCE_API_SECRET: 'secret' }, fetchImpl: async () => response({}) });
  assert.deepEqual(service.status().binance, { configured: true, mode: 'read-only', products: ['spot', 'usd-m-futures'] });
  assert.equal(service.status().bybit.configured, false);
  assert.equal(JSON.stringify(service.status()).includes('secret'), false);
});

test('Binance menandatangani request di server dan menormalkan saldo serta posisi', async () => {
  const key = 'test-binance-key', secret = 'test-binance-secret';
  const seen = [];
  const service = createExchangeService({
    env: { BINANCE_API_KEY: key, BINANCE_API_SECRET: secret },
    now: () => 1700000000000,
    fetchImpl: async (url, options) => {
      const parsed = new URL(url); seen.push({ parsed, options });
      assert.equal(options.headers['X-MBX-APIKEY'], key);
      const signature = parsed.searchParams.get('signature');
      parsed.searchParams.delete('signature');
      const expected = crypto.createHmac('sha256', secret).update(parsed.searchParams.toString()).digest('hex');
      assert.equal(signature, expected);
      if (parsed.pathname === '/api/v3/account') return response({ canTrade: false, balances: [{ asset: 'USDT', free: '12.5', locked: '1' }, { asset: 'BTC', free: '0', locked: '0' }] });
      if (parsed.pathname === '/fapi/v2/account') return response({ canTrade: true, totalWalletBalance: '25', availableBalance: '20', totalUnrealizedProfit: '2' });
      if (parsed.pathname === '/sapi/v1/account/apiRestrictions') return response({ enableReading: true, enableSpotAndMarginTrading: false, enableFutures: false, enableWithdrawals: false, enableInternalTransfer: false, permitsUniversalTransfer: false });
      if (parsed.pathname === '/fapi/v2/positionRisk') return response([{ symbol: 'BTCUSDT', positionAmt: '0.01', entryPrice: '50000', markPrice: '51000', unRealizedProfit: '10', leverage: '5', marginType: 'isolated' }, { symbol: 'ETHUSDT', positionAmt: '0' }]);
      throw new Error('unexpected endpoint');
    },
  });
  const result = await service.account('binance');
  assert.equal(seen.length, 4);
  assert.equal(result.connected, true);
  assert.equal(result.account.api_permissions.available, true);
  assert.equal(result.account.api_permissions.spot_trading, false);
  assert.equal(result.account.api_permissions.futures_trading, false);
  assert.equal(result.account.api_permissions.withdrawals, false);
  assert.equal(result.account.spot.balances.length, 1);
  assert.equal(result.account.spot.balances[0].total, 13.5);
  assert.equal(result.account.futures.wallet_balance, 25);
  assert.equal(result.account.futures.can_trade, true);
  assert.equal(result.account.futures.positions[0].side, 'LONG');
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('Binance returns a safe account label and one-way API key fingerprint without exposing credentials', async () => {
  const key = 'private-binance-api-key';
  const service = createExchangeService({
    env: { BINANCE_API_KEY: key, BINANCE_API_SECRET: 'private-secret', BINANCE_ACCOUNT_LABEL: 'Akun Utama Rohman' },
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/api/v3/account') return response({ balances: [] });
      if (pathname === '/fapi/v2/account') return response({});
      if (pathname === '/fapi/v2/positionRisk') return response([]);
      if (pathname === '/sapi/v1/account/apiRestrictions') return response({ enableSpotAndMarginTrading: false, enableFutures: false });
      throw new Error('unexpected endpoint');
    },
  });
  const result = await service.account('binance');
  assert.equal(result.account.identity.display_name, 'Akun Utama Rohman');
  assert.equal(result.account.identity.label_configured, true);
  assert.match(result.account.identity.key_fingerprint, /^[A-F0-9]{10}$/);
  assert.notEqual(result.account.identity.key_fingerprint, key);
  assert.equal(JSON.stringify(result).includes(key), false);
  assert.equal(JSON.stringify(result).includes('private-secret'), false);
});

test('Binance reports actual API Key trading permissions independently from account canTrade', async () => {
  const service = createExchangeService({
    env: { BINANCE_API_KEY: 'key', BINANCE_API_SECRET: 'secret' },
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/api/v3/account') return response({ canTrade: false, balances: [] });
      if (pathname === '/fapi/v2/account') return response({ canTrade: false });
      if (pathname === '/fapi/v2/positionRisk') return response([]);
      if (pathname === '/sapi/v1/account/apiRestrictions') return response({
        enableSpotAndMarginTrading: true, enableFutures: true,
        enableWithdrawals: false, enableInternalTransfer: false, permitsUniversalTransfer: false,
      });
      throw new Error('unexpected endpoint');
    },
  });
  const result = await service.account('binance');
  assert.equal(result.connected, true);
  assert.equal(result.account.api_permissions.available, true);
  assert.equal(result.account.api_permissions.spot_trading, true);
  assert.equal(result.account.api_permissions.futures_trading, true);
  assert.equal(result.account.api_permissions.withdrawals, false);
});

test('Binance reports unavailable positions separately from a successful wallet read', async () => {
  const service = createExchangeService({
    env: { BINANCE_API_KEY: 'key', BINANCE_API_SECRET: 'secret' },
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/api/v3/account') return response({ canTrade: false, balances: [] });
      if (pathname === '/fapi/v2/account') return response({ totalWalletBalance: '10', availableBalance: '8', totalUnrealizedProfit: '0' });
      if (pathname === '/fapi/v2/positionRisk') throw new Error('positions unavailable');
      throw new Error('unexpected endpoint');
    },
  });
  const result = await service.account('binance');
  assert.equal(result.account.api_permissions.available, false);
  assert.equal(result.account.api_permissions.error, 'API_PERMISSION_READ_UNAVAILABLE');
  assert.equal(result.account.futures.available, true);
  assert.equal(result.account.futures.positions_available, false);
  assert.equal(result.account.futures.positions_error, 'FUTURES_POSITIONS_READ_UNAVAILABLE');
  assert.deepEqual(result.account.futures.positions, []);
});

test('Bybit signs V5 requests and returns wallet and open positions', async () => {
  const key = 'test-bybit-key', secret = 'test-bybit-secret';
  const service = createExchangeService({
    env: { BYBIT_API_KEY: key, BYBIT_API_SECRET: secret },
    now: () => 1700000000123,
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      const query = parsed.searchParams.toString();
      const expected = crypto.createHmac('sha256', secret).update('1700000000123' + key + '5000' + query).digest('hex');
      assert.equal(options.headers['X-BAPI-API-KEY'], key);
      assert.equal(options.headers['X-BAPI-SIGN'], expected);
      if (parsed.pathname === '/v5/account/wallet-balance') return response({ retCode: 0, result: { list: [{ accountType: 'UNIFIED', totalEquity: '120', totalWalletBalance: '110', totalAvailableBalance: '90', coin: [{ coin: 'USDT', walletBalance: '110', equity: '120', availableToWithdraw: '90' }] }] } });
      if (parsed.pathname === '/v5/position/list') return response({ retCode: 0, result: { list: [{ symbol: 'BTCUSDT', side: 'Buy', size: '0.02', avgPrice: '50000', markPrice: '50500', unrealisedPnl: '10', leverage: '3' }] } });
      if (parsed.pathname === '/v5/user/query-api') return response({ retCode: 0, result: { userID: 12345678, readOnly: 1, permissions: { Spot: [], ContractTrade: [], Wallet: [], Earn: [] }, apiKey: 'must-not-be-returned', secret: '' } });
      throw new Error('unexpected endpoint');
    },
  });
  const result = await service.account('bybit');
  assert.equal(result.account.wallet.total_equity, 120);
  assert.equal(result.account.wallet.coins[0].asset, 'USDT');
  assert.equal(result.account.wallet.coins[0].withdrawable_balance, 90);
  assert.equal(result.account.identity.account_id, '12345678');
  assert.equal(result.account.identity.display_name, 'Akun Bybit · UID 12345678');
  assert.equal(result.account.api_permissions.available, true);
  assert.equal(result.account.api_permissions.read_only, true);
  assert.equal(result.account.api_permissions.withdrawals, false);
  assert.equal(JSON.stringify(result).includes('must-not-be-returned'), false);
  assert.equal(result.account.positions[0].side, 'BUY');
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('Bybit reports position API failures instead of returning an empty valid position list', async () => {
  const service = createExchangeService({
    env: { BYBIT_API_KEY: 'key', BYBIT_API_SECRET: 'secret' },
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/v5/account/wallet-balance') return response({ retCode: 0, result: { list: [{ accountType: 'UNIFIED', coin: [] }] } });
      if (pathname === '/v5/position/list') return response({ retCode: 10001, retMsg: 'position read failed' });
      throw new Error('unexpected endpoint');
    },
  });
  const result = await service.account('bybit');
  assert.equal(result.account.positions_available, false);
  assert.equal(result.account.positions_error, 'BYBIT_POSITIONS_READ_UNAVAILABLE');
  assert.deepEqual(result.account.positions, []);
});

test('kredensial yang tidak lengkap ditolak tanpa request ke exchange', async () => {
  let called = false;
  const service = createExchangeService({ env: { BINANCE_API_KEY: 'key' }, fetchImpl: async () => { called = true; return response({}); } });
  await assert.rejects(service.account('binance'), (error) => error instanceof ExchangeError && error.code === 'BINANCE_CREDENTIALS_NOT_CONFIGURED');
  assert.equal(called, false);
});

test('kegagalan HTTP upstream tidak meneruskan body sensitif', async () => {
  const service = createExchangeService({
    env: { BINANCE_API_KEY: 'key', BINANCE_API_SECRET: 'secret' },
    fetchImpl: async () => response({ msg: 'secret should not leak' }, false, 401),
  });
  await assert.rejects(service.account('binance'), (error) => error.code === 'EXCHANGE_UPSTREAM_HTTP_401' && !error.message.includes('secret should not leak'));
});

test('server menyediakan status dan data akun melalui route read-only tanpa secret', async () => {
  const { createApp } = require('../server');
  const state = { tokens: [], fundamentals: {}, vol10m: {}, health: {}, news: [], unlocks: [], alerts: [], lastOk: null, lastRefresh: null };
  const service = {
    status: () => ({ binance: { configured: true, mode: 'read-only' }, bybit: { configured: false, mode: 'read-only' } }),
    account: async (name) => ({ exchange: name, connected: true, checked_at: '2026-11-22T00:00:00.000Z', account: { spot: { balances: [] } } }),
    market: async (name, symbol) => ({ exchange: name, symbol, spot: { last_price: 1 }, futures: null }),
  };
  const app = createApp({ state, exchangeService: service, exchangeAccessToken: 'owner-session-test-token' });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    const status = await (await fetch(base + '/api/exchanges/status')).json();
    assert.equal(status.exchanges.binance.configured, true);
    assert.equal(status.access_configured, true);
    const denied = await fetch(base + '/api/exchanges/binance/account');
    assert.equal(denied.status, 401);
    const accountResponse = await fetch(base + '/api/exchanges/binance/account', { headers: { 'x-exchange-access-token': 'owner-session-test-token' } });
    const account = await accountResponse.json();
    assert.equal(accountResponse.status, 200);
    assert.equal(account.connected, true);
    assert.equal(JSON.stringify(account).includes('secret'), false);
    const market = await (await fetch(base + '/api/exchanges/market?exchange=binance&symbol=BTCUSDT')).json();
    assert.equal(market.symbol, 'BTCUSDT');
    assert.equal((await fetch(base + '/api/exchanges/unknown/account')).status, 404);
  } finally { app.stop(); }
});


test('private exchange account routes require a configured owner token', async () => {
  const { createApp } = require('../server');
  const state = { tokens: [], fundamentals: {}, vol10m: {}, health: {}, news: [], unlocks: [], alerts: [], lastOk: null, lastRefresh: null };
  const service = { status: () => ({ binance: { configured: true, mode: 'read-only' } }), account: async () => { throw new Error('must not be called'); }, market: async () => ({}) };
  const app = createApp({ state, exchangeService: service, exchangeAccessToken: '' });
  await new Promise((resolve) => app.server.listen(0, resolve));
  try {
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const response = await fetch(base + '/api/exchanges/binance/account');
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.code, 'EXCHANGE_ACCESS_NOT_CONFIGURED');
  } finally { app.stop(); }
});

test('menerima nama environment secret key yang umum tanpa mengekspos nilainya', () => {
  const service = createExchangeService({ env: { BINANCE_API_KEY: 'key', BINANCE_SECRET_KEY: 'secret' }, fetchImpl: async () => response({}) });
  assert.equal(service.status().binance.configured, true);
  assert.equal(JSON.stringify(service.status()).includes('secret'), false);
});

test('Binance public ticker dinormalisasi tanpa mengirim API key', async () => {
  const service = createExchangeService({
    env: {},
    now: () => 1700000000000,
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(options.headers['X-MBX-APIKEY'], undefined);
      if (parsed.pathname === '/api/v3/ticker/24hr') return response({ lastPrice: '60000', priceChangePercent: '2.5', highPrice: '61000', lowPrice: '59000', quoteVolume: '123456' });
      if (parsed.pathname === '/fapi/v1/ticker/24hr') return response({ lastPrice: '60010', priceChangePercent: '2.7', highPrice: '61100', lowPrice: '59100', quoteVolume: '234567' });
      throw new Error('unexpected endpoint');
    },
  });
  const result = await service.market('binance', 'btcusdt');
  assert.equal(result.symbol, 'BTCUSDT');
  assert.equal(result.spot.last_price, 60000);
  assert.equal(result.futures.change_pct, 2.7);
});

test('Bybit public ticker mengubah price24hPcnt menjadi persen', async () => {
  const service = createExchangeService({
    env: {},
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.searchParams.get('category') === 'spot') return response({ retCode: 0, result: { list: [{ lastPrice: '100', price24hPcnt: '0.015', highPrice24h: '105', lowPrice24h: '95', turnover24h: '9000' }] } });
      return response({ retCode: 0, result: { list: [{ lastPrice: '101', price24hPcnt: '-0.01', highPrice24h: '106', lowPrice24h: '94', turnover24h: '12000' }] } });
    },
  });
  const result = await service.market('bybit', 'ETHUSDT');
  assert.equal(result.spot.change_pct, 1.5);
  assert.equal(result.futures.change_pct, -1);
});

test('simbol market invalid ditolak sebelum request keluar', async () => {
  let called = false;
  const service = createExchangeService({ env: {}, fetchImpl: async () => { called = true; return response({}); } });
  await assert.rejects(service.market('binance', 'BTC/USDT'), (error) => error.code === 'INVALID_MARKET_SYMBOL');
  assert.equal(called, false);
});


test('Bybit does not claim read-only when API key permission endpoint is unavailable', async () => {
  const service = createExchangeService({ env: { BYBIT_API_KEY: 'key', BYBIT_API_SECRET: 'secret' }, fetchImpl: async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/v5/account/wallet-balance') return response({ retCode: 0, result: { list: [{ accountType: 'UNIFIED', coin: [] }] } });
    if (pathname === '/v5/position/list') return response({ retCode: 0, result: { list: [] } });
    if (pathname === '/v5/user/query-api') return response({ retCode: 10001, retMsg: 'permission read unavailable' });
    throw new Error('unexpected endpoint');
  } });
  const result = await service.account('bybit');
  assert.equal(result.connected, true);
  assert.equal(result.account.api_permissions.available, false);
  assert.equal(result.account.api_permissions.error, 'BYBIT_API_PERMISSION_READ_UNAVAILABLE');
  assert.equal(result.account.identity.account_id, undefined);
});


test('Bybit treats incomplete core permission categories as unverified', async () => {
  const service = createExchangeService({ env: { BYBIT_API_KEY: 'key', BYBIT_API_SECRET: 'secret' }, fetchImpl: async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/v5/account/wallet-balance') return response({ retCode: 0, result: { list: [{ accountType: 'UNIFIED', coin: [] }] } });
    if (pathname === '/v5/position/list') return response({ retCode: 0, result: { list: [] } });
    if (pathname === '/v5/user/query-api') return response({ retCode: 0, result: { userID: 123, readOnly: 1, permissions: { Spot: [], ContractTrade: [] } } });
    throw new Error('unexpected endpoint');
  } });
  const result = await service.account('bybit');
  assert.equal(result.account.identity.account_id, '123');
  assert.equal(result.account.api_permissions.available, false);
  assert.equal(result.account.api_permissions.error, 'BYBIT_API_PERMISSION_READ_UNAVAILABLE');
});


test('Binance exposes withdrawal and transfer API key permissions independently from trading flags', async () => {
  const service = createExchangeService({ env: { BINANCE_API_KEY: 'key', BINANCE_API_SECRET: 'secret' }, fetchImpl: async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/api/v3/account') return response({ balances: [] });
    if (pathname === '/fapi/v2/account') return response({});
    if (pathname === '/fapi/v2/positionRisk') return response([]);
    if (pathname === '/sapi/v1/account/apiRestrictions') return response({ enableSpotAndMarginTrading: false, enableFutures: false, enableWithdrawals: true, enableInternalTransfer: true, permitsUniversalTransfer: false });
    throw new Error('unexpected endpoint');
  } });
  const result = await service.account('binance');
  assert.equal(result.account.api_permissions.spot_trading, false);
  assert.equal(result.account.api_permissions.futures_trading, false);
  assert.equal(result.account.api_permissions.withdrawals, true);
  assert.equal(result.account.api_permissions.internal_transfer, true);
});


test('Bybit never substitutes availableToBorrow for a missing withdrawable balance', async () => {
  const service = createExchangeService({ env: { BYBIT_API_KEY: 'key', BYBIT_API_SECRET: 'secret' }, fetchImpl: async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/v5/account/wallet-balance') return response({ retCode: 0, result: { list: [{ accountType: 'UNIFIED', coin: [{ coin: 'USDT', walletBalance: '10', equity: '10', availableToBorrow: '999' }] }] } });
    if (pathname === '/v5/position/list') return response({ retCode: 0, result: { list: [] } });
    if (pathname === '/v5/user/query-api') return response({ retCode: 0, result: { userID: 1, readOnly: 1, permissions: { Spot: [], ContractTrade: [], Wallet: [] } } });
    throw new Error('unexpected endpoint');
  } });
  const result = await service.account('bybit');
  assert.equal(result.account.wallet.coins[0].withdrawable_balance, null);
});


test('HTTP 429 exposes rate-limit status and Retry-After without retrying', async () => {
  const service = createExchangeService({ env: {}, fetchImpl: async () => response({}, false, 429, { 'retry-after': '12' }) });
  await assert.rejects(service.market('binance', 'BTCUSDT'), (error) =>
    error.code === 'EXCHANGE_RATE_LIMITED' && error.status === 429 && error.retryAfterSeconds === 12);
});

test('Binance -1003 API response is normalized as rate-limited', async () => {
  const service = createExchangeService({
    env: { BINANCE_API_KEY: 'key', BINANCE_API_SECRET: 'secret' },
    fetchImpl: async () => response({ code: -1003, msg: 'Too many requests' }),
  });
  await assert.rejects(service.account('binance'), (error) => error.code === 'EXCHANGE_RATE_LIMITED' && error.status === 429);
});

test('Bybit retCode 10006 is normalized as rate-limited', async () => {
  const service = createExchangeService({
    env: { BYBIT_API_KEY: 'key', BYBIT_API_SECRET: 'secret' },
    now: () => 1700000000000,
    fetchImpl: async () => response({ retCode: 10006, retMsg: 'Too many visits!' }, true, 200, { 'x-bapi-limit-reset-timestamp': '1700000005000' }),
  });
  await assert.rejects(service.account('bybit'), (error) =>
    error.code === 'EXCHANGE_RATE_LIMITED' && error.status === 429 && error.retryAfterSeconds === 5);
});

test('private Exchange Hub forwards safe Retry-After for rate-limited exchange responses', async () => {
  const { createApp } = require('../server');
  const state = { tokens: [], fundamentals: {}, vol10m: {}, health: {}, news: [], unlocks: [], alerts: [], lastOk: null, lastRefresh: null };
  const service = {
    status: () => ({ binance: { configured: true, mode: 'read-only' } }),
    account: async () => { throw new ExchangeError('EXCHANGE_RATE_LIMITED', 429, 15); },
    market: async () => ({}),
  };
  const app = createApp({ state, exchangeService: service, exchangeAccessToken: 'owner-session-test-token' });
  await new Promise((resolve) => app.server.listen(0, resolve));
  try {
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const result = await fetch(base + '/api/exchanges/binance/account', { headers: { 'x-exchange-access-token': 'owner-session-test-token' } });
    const body = await result.json();
    assert.equal(result.status, 429);
    assert.equal(result.headers.get('retry-after'), '15');
    assert.equal(body.code, 'EXCHANGE_RATE_LIMITED');
  } finally { app.stop(); }
});


test('Bybit HTTP 403 access-too-frequent response is normalized as rate-limited', async () => {
  const service = createExchangeService({ env: {}, fetchImpl: async () => response({ retMsg: 'access too frequent' }, false, 403) });
  await assert.rejects(service.market('bybit', 'BTCUSDT'), (error) =>
    error.code === 'EXCHANGE_RATE_LIMITED' && error.status === 429 && error.retryAfterSeconds === 600);
});


test('Bybit read-only SubMemberTransferList permission is not misclassified as transfer capability', async () => {
  const service = createExchangeService({ env: { BYBIT_API_KEY: 'key', BYBIT_API_SECRET: 'secret' }, fetchImpl: async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/v5/account/wallet-balance') return response({ retCode: 0, result: { list: [{ accountType: 'UNIFIED', coin: [] }] } });
    if (pathname === '/v5/position/list') return response({ retCode: 0, result: { list: [] } });
    if (pathname === '/v5/user/query-api') return response({ retCode: 0, result: { userID: 42, readOnly: 1, permissions: { Spot: [], ContractTrade: [], Wallet: ['SubMemberTransferList'] } } });
    throw new Error('unexpected endpoint');
  } });
  const result = await service.account('bybit');
  assert.equal(result.account.api_permissions.available, true);
  assert.equal(result.account.api_permissions.read_only, true);
  assert.equal(result.account.api_permissions.transfers, false);
});
