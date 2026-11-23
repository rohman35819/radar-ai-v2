'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDexScreenerService } = require('../lib/dexscreener');
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

test('DEX Screener validates the exact chain and token address, then normalizes pair metrics', async () => {
  const calls = [];
  const service = createDexScreenerService({ fetchImpl: async (url) => {
    calls.push(url);
    return response([
      { chainId: 'solana', dexId: 'raydium', pairAddress: 'PoolABC', url: 'https://dexscreener.com/solana/PoolABC',
        baseToken: { address: 'So11111111111111111111111111111111111111112', name: 'Alpha', symbol: 'ALP' }, quoteToken: { address: 'QuoteABC', name: 'SOL', symbol: 'SOL' },
        priceUsd: '0.02', liquidity: { usd: 25000 }, volume: { h24: 12000 }, priceChange: { h24: 8 },
        txns: { h24: { buys: 120, sells: 80 } }, fdv: 100000, marketCap: 90000, pairCreatedAt: 1000 },
      { chainId: 'ethereum', baseToken: { address: 'So11111111111111111111111111111111111111112' }, quoteToken: { address: '0x0000000000000000000000000000000000000001' } }
    ]);
  }});
  const result = await service.validate({ networkId: 'solana', tokenAddress: 'So11111111111111111111111111111111111111112', poolAddress: 'PoolABC' });
  assert.equal(result.status, 'success');
  assert.equal(result.pair_count, 1);
  assert.equal(result.same_pool_found, true);
  assert.equal(result.pairs[0].liquidity_usd, 25000);
  assert.equal(result.pairs[0].volume_24h_usd, 12000);
  assert.equal(result.pairs[0].buys_24h, 120);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /token-pairs\/v1\/solana\/So11111111111111111111111111111111111111112/);
});

test('DEX Screener rejects unknown networks and invalid token addresses before network access', async () => {
  let calls = 0;
  const service = createDexScreenerService({ fetchImpl: async () => { calls++; return response([]); } });
  await assert.rejects(service.validate({ networkId: 'unknown', tokenAddress: 'So11111111111111111111111111111111111111112' }), (e) => e.code === 'DEXSCREENER_UNSUPPORTED_NETWORK');
  await assert.rejects(service.validate({ networkId: 'base', tokenAddress: 'So11111111111111111111111111111111111111112' }), (e) => e.code === 'DEXSCREENER_INVALID_TOKEN_ADDRESS');
  assert.equal(calls, 0);
});

test('DEX Screener caches lookups and returns explicit no-pair results', async () => {
  let calls = 0;
  const service = createDexScreenerService({ fetchImpl: async () => { calls++; return response([]); } });
  const first = await service.validate({ networkId: 'base', tokenAddress: '0x1111111111111111111111111111111111111111' });
  const second = await service.validate({ networkId: 'base', tokenAddress: '0x1111111111111111111111111111111111111111' });
  assert.equal(first.pair_count, 0);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
});

test('DEX Screener cache keeps pool-specific same-pool verification separate', async () => {
  let calls = 0;
  const token = 'So11111111111111111111111111111111111111112';
  const service = createDexScreenerService({ fetchImpl: async () => {
    calls++;
    return response([{ chainId: 'solana', dexId: 'raydium', pairAddress: 'PoolOne',
      baseToken: { address: token, symbol: 'SOL' }, quoteToken: { address: '11111111111111111111111111111111', symbol: 'USDC' },
      liquidity: { usd: 1000 }, volume: { h24: 500 } }]);
  }});
  const first = await service.validate({ networkId: 'solana', tokenAddress: token, poolAddress: 'PoolOne' });
  const second = await service.validate({ networkId: 'solana', tokenAddress: token, poolAddress: 'PoolTwo' });
  assert.equal(first.same_pool_found, true);
  assert.equal(second.same_pool_found, false);
  assert.equal(calls, 2);
});
