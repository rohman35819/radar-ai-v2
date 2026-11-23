'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoPlusService } = require('../lib/goplus');
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

test('GoPlus computes top-10 token and LP holder concentration without claiming full coverage', () => {
  const normalized = normalizeSecurity({
    holder_count: '2500',
    owner_percent: '0.03',
    creator_percent: '0.02',
    holders: [
      { address: 'pool', percent: '0.52', is_contract: '1', is_locked: '0' },
      { address: 'wallet-a', percent: '0.04', is_contract: '0', is_locked: '0' },
      { address: 'wallet-b', percent: '0.03', is_contract: '0', is_locked: '1' },
      { address: 'invalid', percent: 'unknown', is_contract: '0', is_locked: '0' }
    ],
    lp_holder_count: '2',
    lp_holders: [
      { address: 'lp-a', percent: '0.99', is_contract: '0', is_locked: '0' },
      { address: 'lp-b', percent: '0.01', is_contract: '0', is_locked: '1' }
    ]
  });
  const summary = normalized.holder_concentration;
  assert.equal(summary.holder_count, 2500);
  assert.equal(summary.token_holders.sample_size, 3);
  assert.equal(summary.token_holders.top1_percent, 52);
  assert.equal(summary.token_holders.top10_reported_percent, 59);
  assert.equal(summary.token_holders.non_contract_top10_percent, 7);
  assert.equal(summary.token_holders.contract_top10_percent, 52);
  assert.equal(summary.token_holders.locked_top10_percent, 3);
  assert.equal(summary.lp_holders.top10_reported_percent, 100);
  assert.equal(summary.owner_percent, 3);
  assert.equal(summary.token_holders.coverage, 'reported_top_10_sample_only');
});

test('GoPlus requires credentials and never silently bypasses authentication', async () => {
  let calls = 0;
  const service = createGoPlusService({ fetchImpl: async () => { calls++; return response({ code: 1, result: {} }); } });
  await assert.rejects(service.security({ networkId: 'base', tokenAddress: '0x1111111111111111111111111111111111111111' }), (e) => e.code === 'GOPLUS_NOT_CONFIGURED' && e.status === 503);
  assert.equal(calls, 0);
});

test('GoPlus signs a free app token server-side and returns risk flags', async () => {
  const calls = [];
  const address = '0x1111111111111111111111111111111111111111';
  const service = createGoPlusService({ appKey: 'test-app-key', appSecret: 'test-app-secret', now: () => 1800000000000, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/v1/token')) return response({ code: 1, result: { access_token: 'test-access-token', expires_in: 600 } });
    assert.equal(options.headers.authorization, 'Bearer test-access-token');
    return response({ code: 1, result: { [address]: { token_name: 'Risk Token', is_honeypot: '1', is_mintable: '1', sell_tax: '0.2', holder_count: '120' } } });
  }});
  const result = await service.security({ networkId: 'base', tokenAddress: address });
  assert.equal(result.status, 'success');
  assert.equal(result.data.token_name, 'Risk Token');
  assert.ok(result.risk_flags.some((flag) => flag.field === 'is_honeypot' && flag.severity === 'critical'));
  assert.ok(result.risk_flags.some((flag) => flag.field === 'sell_tax'));
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/api\/v1\/token$/);
  assert.match(calls[1].url, /token_security\/8453/);
});

test('GoPlus Solana beta endpoint is selected and unsupported network rejected', async () => {
  const address = 'So11111111111111111111111111111111111111112';
  let url = '';
  const service = createGoPlusService({ accessToken: 'static-token', fetchImpl: async (u, options) => {
    url = u;
    assert.equal(options.headers.authorization, 'Bearer static-token');
    return response({ code: 1, result: { [address]: { token_name: 'SOL token', freeze_authority: 'SomeAuthority' } } });
  }});
  const result = await service.security({ networkId: 'solana', tokenAddress: address });
  assert.equal(result.status, 'success');
  assert.match(url, /\/api\/v1\/solana\/token_security/);
  await assert.rejects(service.security({ networkId: 'sui', tokenAddress: address }), (e) => e.code === 'GOPLUS_UNSUPPORTED_NETWORK');
});

test('GoPlus enforces a five-call/minute budget before upstream requests', async () => {
  let calls = 0;
  const service = createGoPlusService({ accessToken: 'static-token', now: () => Date.parse('2026-11-23T10:00:00Z'), fetchImpl: async () => {
    calls++;
    return response({ code: 1, result: {} });
  }});
  const addresses = Array.from({ length: 6 }, (_, i) => '0x' + String(i + 1).padStart(40, '0'));
  for (const tokenAddress of addresses.slice(0, 5)) {
    await assert.rejects(service.security({ networkId: 'base', tokenAddress }), (e) => e.code === 'GOPLUS_NO_DATA');
  }
  await assert.rejects(service.security({ networkId: 'base', tokenAddress: addresses[5] }), (e) => e.code === 'GOPLUS_LOCAL_RATE_LIMITED' && e.status === 429);
  assert.equal(calls, 5);
});

test('GoPlus persists usage counters and blocks daily quota exhaustion', async () => {
  let calls = 0, persisted = 0;
  const usageState = { day: '2026-11-23', month: '2026-11', day_count: 1000, month_count: 1000 };
  const service = createGoPlusService({ accessToken: 'static-token', usageState, onUsage: () => { persisted++; }, now: () => Date.parse('2026-11-23T10:00:00Z'), fetchImpl: async () => {
    calls++;
    return response({ code: 1, result: {} });
  }});
  await assert.rejects(service.security({ networkId: 'base', tokenAddress: '0x1111111111111111111111111111111111111111' }), (e) => e.code === 'GOPLUS_FREE_QUOTA_DAILY' && e.status === 429);
  assert.equal(calls, 0);
  assert.equal(persisted, 0);
});

test('GoPlus usage counters persist after an actual upstream request', async () => {
  const address = '0x2222222222222222222222222222222222222222';
  const usageState = { day: null, month: null, day_count: 0, month_count: 0 };
  let persisted = 0;
  const service = createGoPlusService({ accessToken: 'static-token', usageState, now: () => Date.parse('2026-11-23T10:00:00Z'),
    onUsage: (value) => { persisted++; assert.equal(value, usageState); },
    fetchImpl: async () => response({ code: 1, result: { [address]: { token_name: 'Budgeted Token' } } })
  });
  const result = await service.security({ networkId: 'base', tokenAddress: address });
  assert.equal(result.data.token_name, 'Budgeted Token');
  assert.equal(usageState.day_count, 1);
  assert.equal(usageState.month_count, 1);
  assert.equal(persisted, 1);
});
