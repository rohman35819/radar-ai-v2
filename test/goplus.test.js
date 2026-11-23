'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoPlusService, GOPLUS_CHAINS, GOPLUS_SUPPORTED_NETWORKS, EVM_CHAINS, validAddress, validTronAddress } = require('../lib/goplus');
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

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


test('GoPlus supports every documented Token Security chain ID plus Solana Beta', () => {
  const address = '0x1111111111111111111111111111111111111111';
  const numericChains = GOPLUS_CHAINS.filter((chain) => Number.isInteger(Number(chain.id)));
  assert.equal(GOPLUS_CHAINS.length, 38);
  assert.equal(numericChains.length, 37);
  assert.equal(GOPLUS_SUPPORTED_NETWORKS.length, 39);
  for (const chain of numericChains) {
    assert.equal(validAddress(chain.id, address), true, chain.name + ' numeric chain ID');
    assert.equal(EVM_CHAINS[chain.id], chain.id);
    for (const alias of chain.aliases) {
      assert.equal(validAddress(alias, address), true, chain.name + ' alias ' + alias);
      assert.equal(EVM_CHAINS[alias], chain.id);
    }
  }
  assert.equal(validAddress('solana', 'So11111111111111111111111111111111111111112'), true);
  assert.equal(validAddress('sui', address), false);
});

test('GoPlus maps newly documented Arc chain and numeric IDs to canonical API path', async () => {
  const address = '0x1111111111111111111111111111111111111111';
  const urls = [];
  const service = createGoPlusService({ accessToken: 'static-token', fetchImpl: async (url) => {
    urls.push(url);
    return response({ code: 1, result: { [address]: { token_name: 'Arc Test Token' } } });
  }});
  const byAlias = await service.security({ networkId: 'arc', tokenAddress: address });
  assert.equal(byAlias.chain_id, '5042');
  const byId = await service.security({ networkId: '5042', tokenAddress: '0x2222222222222222222222222222222222222222' });
  assert.equal(byId.chain_id, '5042');
  assert.ok(urls.some((url) => url.includes('/token_security/5042?')));
});

test('GoPlus validates Tron Base58Check addresses and selects the documented Tron route', async () => {
  const address = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  let requested = '';
  assert.equal(validTronAddress(address), true);
  assert.equal(validAddress('tron', address), true);
  assert.equal(validTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6x'), false);
  const service = createGoPlusService({ accessToken: 'static-token', fetchImpl: async (url) => {
    requested = url;
    return response({ code: 1, result: { [address]: { token_name: 'USD Tether' } } });
  }});
  const result = await service.security({ networkId: 'tron', tokenAddress: address });
  assert.equal(result.status, 'success');
  assert.equal(result.chain_id, 'tron');
  assert.ok(requested.includes('/token_security/tron?'));
});


test('GoPlus credential verification checks Bearer access without exposing credentials', async () => {
  const calls = [];
  const service = createGoPlusService({ appKey: 'private-app-key', appSecret: 'private-app-secret', now: () => 1800000000000, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/v1/token')) return response({ code: 1, result: { access_token: 'private-bearer-token', expires_in: 600 } });
    assert.equal(options.headers.authorization, 'Bearer private-bearer-token');
    return response({ code: 1, result: [{ chain_id: '5042', name: 'Arc' }] });
  }});
  const result = await service.verifyCredentials();
  assert.equal(result.configured, true);
  assert.equal(result.verified, true);
  assert.equal(result.auth_mode, 'app_key_secret');
  assert.equal(result.provider_chain_count, 1);
  assert.equal(JSON.stringify(result).includes('private-bearer-token'), false);
  assert.equal(JSON.stringify(result).includes('private-app-secret'), false);
  assert.equal(calls.length, 2);
  const cached = await service.verifyCredentials();
  assert.equal(cached.cached, true);
  assert.equal(calls.length, 2);
});

test('GoPlus credential verification reports missing or rejected credentials safely', async () => {
  let calls = 0;
  const missing = createGoPlusService({ fetchImpl: async () => { calls++; return response({ code: 1, result: [] }); } });
  const absent = await missing.verifyCredentials();
  assert.equal(absent.configured, false);
  assert.equal(absent.verified, false);
  assert.equal(absent.error_code, 'GOPLUS_NOT_CONFIGURED');
  assert.equal(calls, 0);
  const rejected = createGoPlusService({ accessToken: 'bad-token', fetchImpl: async () => response({ code: 4023, message: 'Access token not found' }) });
  const invalid = await rejected.verifyCredentials();
  assert.equal(invalid.configured, true);
  assert.equal(invalid.verified, false);
  assert.equal(invalid.error_code, 'GOPLUS_CREDENTIALS_REJECTED');
});
