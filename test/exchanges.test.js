'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createExchangeService, ExchangeError } = require('../lib/exchanges');

const response = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

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
      if (parsed.pathname === '/fapi/v2/account') return response({ totalWalletBalance: '25', availableBalance: '20', totalUnrealizedProfit: '2' });
      if (parsed.pathname === '/fapi/v2/positionRisk') return response([{ symbol: 'BTCUSDT', positionAmt: '0.01', entryPrice: '50000', markPrice: '51000', unRealizedProfit: '10', leverage: '5', marginType: 'isolated' }, { symbol: 'ETHUSDT', positionAmt: '0' }]);
      throw new Error('unexpected endpoint');
    },
  });
  const result = await service.account('binance');
  assert.equal(seen.length, 3);
  assert.equal(result.connected, true);
  assert.equal(result.account.spot.balances.length, 1);
  assert.equal(result.account.spot.balances[0].total, 13.5);
  assert.equal(result.account.futures.wallet_balance, 25);
  assert.equal(result.account.futures.positions[0].side, 'LONG');
  assert.equal(JSON.stringify(result).includes(secret), false);
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
      throw new Error('unexpected endpoint');
    },
  });
  const result = await service.account('bybit');
  assert.equal(result.account.wallet.total_equity, 120);
  assert.equal(result.account.wallet.coins[0].asset, 'USDT');
  assert.equal(result.account.positions[0].side, 'BUY');
  assert.equal(JSON.stringify(result).includes(secret), false);
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
  };
  const app = createApp({ state, exchangeService: service });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    const status = await (await fetch(base + '/api/exchanges/status')).json();
    assert.equal(status.exchanges.binance.configured, true);
    const accountResponse = await fetch(base + '/api/exchanges/binance/account');
    const account = await accountResponse.json();
    assert.equal(accountResponse.status, 200);
    assert.equal(account.connected, true);
    assert.equal(JSON.stringify(account).includes('secret'), false);
    assert.equal((await fetch(base + '/api/exchanges/unknown/account')).status, 404);
  } finally { app.stop(); }
});
