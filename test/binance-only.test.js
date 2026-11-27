'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createApp } = require('../server');

const ROOT = join(__dirname, '..');
const HTML = readFileSync(join(ROOT, 'public', 'trading.html'), 'utf8');
const JS = readFileSync(join(ROOT, 'public', 'trading.js'), 'utf8');
const SERVER = readFileSync(join(ROOT, 'server.js'), 'utf8');

function fakeService() {
  return {
    status: () => ({ binance: { configured: true, mode: 'read-only' }, bybit: { configured: true, mode: 'read-only' } }),
    account: async (name) => ({ exchange: name, connected: true, checked_at: '2026-11-27T00:00:00Z', account: { spot: { balances: [] } } }),
    market: async (name, symbol) => ({ exchange: name, symbol, spot: { last_price: 1 }, futures: null }),
  };
}

test('dashboard exposes Binance as the only active exchange', () => {
  assert.equal(HTML.includes('data-exchange-tab="Bybit"'), false);
  assert.equal(HTML.includes('<option>Bybit</option>'), false);
  assert.equal(HTML.includes('<option value="Binance">Binance</option>'), true);
  assert.equal(HTML.includes('DEFERRED'), true);
  assert.equal(JS.includes('Bybit:{'), false);
  assert.equal(/const selected='Binance'/.test(JS), true);
  assert.equal(SERVER.includes("const ACTIVE_EXCHANGE = 'binance'"), true);
});

test('server marks Bybit deferred and rejects its active routes without fallback', async () => {
  const state = { tokens: [], fundamentals: {}, vol10m: {}, health: {}, news: [], unlocks: [], alerts: [], lastOk: null, lastRefresh: null };
  const app = createApp({ state, exchangeService: fakeService(), exchangeAccessToken: 'owner-session-test-token' });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    const status = await (await fetch(base + '/api/exchanges/status')).json();
    assert.equal(status.active_exchange, 'binance');
    assert.equal(status.exchanges.binance.configured, true);
    assert.equal(status.exchanges.bybit.configured, false);
    assert.equal(status.exchanges.bybit.deferred, true);

    const account = await fetch(base + '/api/exchanges/bybit/account', {
      headers: { 'x-exchange-access-token': 'owner-session-test-token' },
    });
    const accountBody = await account.json();
    assert.equal(account.status, 403);
    assert.equal(accountBody.code, 'EXCHANGE_DEFERRED');
    assert.equal(accountBody.exchange, 'bybit');

    const market = await fetch(base + '/api/exchanges/market?exchange=bybit&symbol=BTCUSDT');
    const marketBody = await market.json();
    assert.equal(market.status, 403);
    assert.equal(marketBody.code, 'EXCHANGE_DEFERRED');

    const binanceMarket = await (await fetch(base + '/api/exchanges/market?exchange=binance&symbol=BTCUSDT')).json();
    assert.equal(binanceMarket.exchange, 'binance');
    assert.equal(binanceMarket.symbol, 'BTCUSDT');
  } finally { app.stop(); }
});
