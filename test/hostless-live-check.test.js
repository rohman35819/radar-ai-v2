'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeSnapshot } = require('../scripts/hostless-live-check');

test('Hostless diagnostics expose only safe on-chain and GoPlus configuration status', () => {
  const result = summarizeSnapshot({
    status: 'success',
    stale: false,
    news: [{ title: 'headline' }],
    health: {
      news: { ok: true },
      news_sources: [{ host: 'example.org', ok: true, count: 1 }],
      onchain: { ok: true, error: null },
      onchain_trending: { ok: false, error: 'ONCHAIN_RATE_LIMITED' }
    },
    early_gems: [{ id: 'solana:pool-a' }],
    early_gems_meta: { fetched_at: '2026-11-23T12:00:00.000Z', source: 'CoinGecko Onchain / GeckoTerminal', trending_error: 'ONCHAIN_RATE_LIMITED' },
    config_needed: {
      early_gems_enabled: true,
      onchain_key: false,
      onchain_refresh_min: 60,
      goplus_enabled: true,
      goplus_usage: { day_count: 3, month_count: 20, daily_limit: 1000, monthly_limit: 5000 }
    }
  });
  assert.equal(result.early_gems.enabled, true);
  assert.equal(result.early_gems.coingecko_key_configured, true);
  assert.equal(result.early_gems.pool_count, 1);
  assert.equal(result.early_gems.trending_health.ok, false);
  assert.equal(result.goplus.credentials_configured, true);
  assert.equal(result.goplus.day_count, 3);
  assert.equal(JSON.stringify(result).includes('APP_SECRET'), false);
});

test('Hostless diagnostics distinguish missing configuration from configured false values', () => {
  const result = summarizeSnapshot({ config_needed: { onchain_key: true, goplus_enabled: false } });
  assert.equal(result.early_gems.coingecko_key_configured, false);
  assert.equal(result.goplus.credentials_configured, false);
  assert.equal(result.early_gems.pool_count, 0);
});

test('Hostless provider diagnostics summarize Binance Futures and DEX without exposing raw payloads', () => {
  const { summarizeDerivatives, summarizeDex } = require('../scripts/hostless-live-check');
  const derivatives = summarizeDerivatives({ data: {
    status: 'success', symbol: 'BTCUSDT', partial: true,
    data: { funding: {}, open_interest: {}, open_interest_history: [], taker_flow: null },
    sources: { funding: { ok: true }, taker_flow: { ok: false, error: 'UPSTREAM_ERROR' } }
  } }, 200);
  assert.equal(derivatives.status, 'success');
  assert.equal(derivatives.partial, true);
  assert.equal(derivatives.metrics.funding, true);
  assert.equal(derivatives.metrics.taker_flow, false);
  assert.equal(derivatives.sources.taker_flow.error, 'UPSTREAM_ERROR');
  const dex = summarizeDex({ data: { status: 'success', pair_count: 0, same_pool_found: false } }, 200);
  assert.equal(dex.status, 'success');
  assert.equal(dex.pair_count, 0);
  assert.equal(dex.same_pool_found, false);
  assert.equal(JSON.stringify({ derivatives, dex }).includes('tokenAddress'), false);
});
