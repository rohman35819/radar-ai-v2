'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createAppJwt, createGithubAppClient, validateRepoPath, validateBranch } = require('../lib/github/app-client');

test('GitHub App JWT is signed and has a short lifetime', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = createAppJwt({ appId: 123, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), now: 1700000000000 });
  const [header, payload, signature] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url').toString()).alg, 'RS256');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(claims.iss, '123');
  assert.equal(claims.exp - claims.iat, 600);
  assert.equal(crypto.verify('RSA-SHA256', Buffer.from(header + '.' + payload), publicKey, Buffer.from(signature, 'base64url')), true);
});

test('repository path and branch are restricted', () => {
  assert.equal(validateRepoPath('public/app.js'), 'public/app.js');
  assert.throws(() => validateRepoPath('../server.js'));
  assert.throws(() => validateRepoPath('server.js'));
  assert.equal(validateBranch('ai-dev/dashboard-refresh'), 'ai-dev/dashboard-refresh');
  assert.throws(() => validateBranch('main'));
});

test('GitHub App client creates installation token and opens only draft PRs', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/access_tokens')) return { ok: true, json: async () => ({ token: 'temporary-installation-token', expires_at: '2030-01-01T00:00:00Z' }) };
    if (url.endsWith('/git/ref/heads/main')) return { ok: true, json: async () => ({ object: { sha: 'base-sha' } }) };
    if (url.endsWith('/git/refs')) return { ok: true, json: async () => ({ ref: 'refs/heads/ai-dev/dashboard-refresh' }) };
    if (url.endsWith('/pulls')) return { ok: true, json: async () => ({ number: 12, draft: true }) };
    return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
  };
  const client = createGithubAppClient({
    appId: '123', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    installationId: '456', repository: 'owner/repo', fetchImpl, now: () => 1700000000000
  });
  const branch = await client.createBranch('dashboard-refresh');
  const pr = await client.openPullRequest({ branch, title: 'Improve dashboard' });
  assert.equal(branch, 'ai-dev/dashboard-refresh');
  assert.equal(pr.draft, true);
  assert.equal(calls.filter((c) => c.url.includes('/access_tokens')).length, 1);
  assert.equal(calls.find((c) => c.url.endsWith('/pulls')).options.body.includes('"draft":true'), true);
});


test('GitHub App connection probe reads the pinned repository with installation token', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/access_tokens')) return { ok: true, json: async () => ({ token: 'short-lived-token', expires_at: '2030-01-01T00:00:00Z', permissions: { contents: 'write', issues: 'write', pull_requests: 'write', actions: 'read', metadata: 'read' } }) };
    if (url === 'https://api.github.com/repos/owner/repo') return { ok: true, json: async () => ({ full_name: 'owner/repo', default_branch: 'main' }) };
    if (url === 'https://api.github.com/repos/owner/repo/contents/README.md') return { ok: true, json: async () => ({ type: 'file', name: 'README.md' }) };
    return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
  };
  const client = createGithubAppClient({
    appId: '123', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    installationId: '456', repository: 'owner/repo', fetchImpl, now: () => 1700000000000
  });
  const result = await client.checkConnection();
  assert.deepEqual(result, { connected: true, repository: 'owner/repo', default_branch: 'main', installation_permissions: { contents: 'write', issues: 'write', pull_requests: 'write', actions: 'read', metadata: 'read' } });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].options.headers.authorization, 'Bearer short-lived-token');
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(calls[2].url.endsWith('/contents/README.md'), true);
});

test('GitHub App API rejects redirects rather than forwarding installation credentials', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const fetchImpl = async (url) => {
    if (url.includes('/access_tokens')) return { ok: true, json: async () => ({ token: 'short-lived-token', expires_at: '2030-01-01T00:00:00Z' }) };
    return { ok: false, status: 302, json: async () => ({ message: 'Found' }) };
  };
  const client = createGithubAppClient({
    appId: '123', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    installationId: '456', repository: 'owner/repo', fetchImpl, now: () => 1700000000000
  });
  await assert.rejects(client.checkConnection(), /GitHub API:/);
});
