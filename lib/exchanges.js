'use strict';

const crypto = require('crypto');

class ExchangeError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = 'ExchangeError';
    this.code = code;
    this.status = status;
  }
}

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const cleanBase = (value, fallback) => String(value || fallback).replace(/\/+$/, '');

function createExchangeService({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const read = (name, fallback = '') => env[name] === undefined || env[name] === '' ? fallback : String(env[name]);
  const credentials = (name) => ({
    key: read(name + '_API_KEY'),
    secret: read(name + '_API_SECRET'),
  });
  const configured = (name) => {
    const c = credentials(name);
    return Boolean(c.key && c.secret);
  };
  const status = () => ({
    binance: { configured: configured('BINANCE'), mode: 'read-only', products: ['spot', 'usd-m-futures'] },
    bybit: { configured: configured('BYBIT'), mode: 'read-only', products: ['unified-wallet', 'linear-derivatives'] },
  });

  async function request(url, options) {
    let response;
    try {
      response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(10000) });
    } catch (error) {
      if (error && error.name === 'TimeoutError') throw new ExchangeError('EXCHANGE_TIMEOUT', 504);
      throw new ExchangeError('EXCHANGE_NETWORK_ERROR', 502);
    }
    let body;
    try { body = await response.json(); }
    catch { throw new ExchangeError('EXCHANGE_INVALID_RESPONSE', 502); }
    if (!response.ok) throw new ExchangeError('EXCHANGE_UPSTREAM_HTTP_' + response.status, 502);
    return body;
  }

  async function binanceAccount() {
    const c = credentials('BINANCE');
    if (!c.key || !c.secret) throw new ExchangeError('BINANCE_CREDENTIALS_NOT_CONFIGURED', 409);
    const spotBase = cleanBase(read('BINANCE_API_BASE'), 'https://api.binance.com');
    const futuresBase = cleanBase(read('BINANCE_FUTURES_BASE'), 'https://fapi.binance.com');

    const signedGet = async (base, pathname, params = {}) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) query.set(key, String(value));
      query.set('recvWindow', '5000');
      query.set('timestamp', String(now()));
      const unsigned = query.toString();
      const signature = crypto.createHmac('sha256', c.secret).update(unsigned).digest('hex');
      const body = await request(base + pathname + '?' + unsigned + '&signature=' + signature, {
        method: 'GET', headers: { 'X-MBX-APIKEY': c.key, accept: 'application/json' },
      });
      if (body && typeof body.code === 'number' && body.code < 0) throw new ExchangeError('BINANCE_API_ERROR_' + Math.abs(body.code), 502);
      return body;
    };

    const [spotResult, futuresResult, positionsResult] = await Promise.allSettled([
      signedGet(spotBase, '/api/v3/account'),
      signedGet(futuresBase, '/fapi/v2/account'),
      signedGet(futuresBase, '/fapi/v2/positionRisk'),
    ]);
    if (spotResult.status === 'rejected') throw spotResult.reason;
    const spot = spotResult.value;
    const futures = futuresResult.status === 'fulfilled' ? futuresResult.value : null;
    const rawPositions = positionsResult.status === 'fulfilled' && Array.isArray(positionsResult.value) ? positionsResult.value : [];
    const balances = (Array.isArray(spot.balances) ? spot.balances : []).map((item) => ({
      asset: String(item.asset || ''),
      free: number(item.free),
      locked: number(item.locked),
      total: number(item.free) + number(item.locked),
    })).filter((item) => item.asset && item.total > 0).slice(0, 40);
    const positions = rawPositions.map((item) => ({
      symbol: String(item.symbol || ''),
      side: number(item.positionAmt) > 0 ? 'LONG' : number(item.positionAmt) < 0 ? 'SHORT' : 'FLAT',
      size: Math.abs(number(item.positionAmt)),
      entry_price: number(item.entryPrice),
      mark_price: number(item.markPrice),
      unrealized_pnl: number(item.unRealizedProfit),
      leverage: number(item.leverage),
      margin_type: String(item.marginType || ''),
    })).filter((item) => item.size > 0).slice(0, 50);

    return {
      exchange: 'binance', connected: true, checked_at: new Date(now()).toISOString(),
      account: {
        spot: { can_trade: Boolean(spot.canTrade), balances },
        futures: futures ? {
          available: true,
          wallet_balance: number(futures.totalWalletBalance),
          available_balance: number(futures.availableBalance),
          unrealized_pnl: number(futures.totalUnrealizedProfit),
          positions,
        } : { available: false, error: 'FUTURES_READ_UNAVAILABLE', positions: [] },
      },
    };
  }

  async function bybitAccount() {
    const c = credentials('BYBIT');
    if (!c.key || !c.secret) throw new ExchangeError('BYBIT_CREDENTIALS_NOT_CONFIGURED', 409);
    const base = cleanBase(read('BYBIT_API_BASE'), 'https://api.bybit.com');
    const signedGet = async (pathname, params) => {
      const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
      const query = new URLSearchParams(sorted).toString();
      const timestamp = String(now());
      const recvWindow = '5000';
      const signaturePayload = timestamp + c.key + recvWindow + query;
      const signature = crypto.createHmac('sha256', c.secret).update(signaturePayload).digest('hex');
      const body = await request(base + pathname + '?' + query, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': c.key,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN': signature,
          accept: 'application/json',
        },
      });
      if (body.retCode !== 0) throw new ExchangeError('BYBIT_API_ERROR_' + String(body.retCode || 'UNKNOWN'), 502);
      return body.result || {};
    };

    const [walletResult, positionsResult] = await Promise.allSettled([
      signedGet('/v5/account/wallet-balance', { accountType: read('BYBIT_ACCOUNT_TYPE', 'UNIFIED') }),
      signedGet('/v5/position/list', { category: 'linear', settleCoin: 'USDT' }),
    ]);
    if (walletResult.status === 'rejected') throw walletResult.reason;
    const wallet = walletResult.value;
    const walletAccount = Array.isArray(wallet.list) ? wallet.list[0] || {} : {};
    const coins = (Array.isArray(walletAccount.coin) ? walletAccount.coin : []).map((item) => ({
      asset: String(item.coin || ''),
      wallet_balance: number(item.walletBalance),
      equity: number(item.equity),
      available_balance: number(item.availableToWithdraw || item.availableToBorrow),
    })).filter((item) => item.asset && (item.wallet_balance > 0 || item.equity > 0)).slice(0, 40);
    const positionList = positionsResult.status === 'fulfilled' && Array.isArray(positionsResult.value.list) ? positionsResult.value.list : [];
    const positions = positionList.map((item) => ({
      symbol: String(item.symbol || ''),
      side: String(item.side || '').toUpperCase(),
      size: Math.abs(number(item.size)),
      entry_price: number(item.avgPrice),
      mark_price: number(item.markPrice),
      unrealized_pnl: number(item.unrealisedPnl),
      leverage: number(item.leverage),
      margin_type: String(item.tradeMode || ''),
    })).filter((item) => item.size > 0).slice(0, 50);

    return {
      exchange: 'bybit', connected: true, checked_at: new Date(now()).toISOString(),
      account: {
        wallet: {
          account_type: String(walletAccount.accountType || read('BYBIT_ACCOUNT_TYPE', 'UNIFIED')),
          total_equity: number(walletAccount.totalEquity),
          wallet_balance: number(walletAccount.totalWalletBalance),
          available_balance: number(walletAccount.totalAvailableBalance),
          coins,
        },
        positions: positionsResult.status === 'fulfilled' ? positions : [],
        positions_available: positionsResult.status === 'fulfilled',
      },
    };
  }

  async function account(exchange) {
    const name = String(exchange || '').toLowerCase();
    if (name === 'binance') return binanceAccount();
    if (name === 'bybit') return bybitAccount();
    throw new ExchangeError('EXCHANGE_NOT_SUPPORTED', 404);
  }

  return { status, account };
}

module.exports = { createExchangeService, ExchangeError };
