'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoPlusService } = require('../lib/goplus');
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
