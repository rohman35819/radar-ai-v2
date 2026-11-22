'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

async function withServer(app, run) {
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  try { await run('http://127.0.0.1:' + address.port); }
  finally { await new Promise((resolve) => app.server.close(resolve)); }
}

test('GitHub gateway requires ADMIN_TOKEN and exposes sanitized connection status', async () => {
  let probes = 0;
  const app = createApp({
    cfg: { adminToken: 'test-admin-token', trustedProxyHops: 0, corsOrigin: '' },
    state: { tokens: [], fundamentals: {}, vol10m: {}, alerts: [], news: [], unlocks: [] },
    githubAppClient: { async checkConnection() { probes++; return { connected: true, repository: 'owner/repo', default_branch: 'main', access: { read: true, write: true, admin: false } }; } }
  });
  await withServer(app, async (base) => {
    const denied = await fetch(base + '/api/github/status');
    assert.equal(denied.status, 403);
    assert.equal(probes, 0);
    const allowed = await fetch(base + '/api/github/status', { headers: { 'x-admin-token': 'test-admin-token' } });
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.github_app.connected, true);
    assert.equal(body.github_app.repository, 'owner/repo');
    assert.equal(JSON.stringify(body).includes('test-admin-token'), false);
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    assert.equal(probes, 1);
  });
});

test('GitHub gateway restricts file reads to approved paths and enforces 64 KiB', async () => {
  const reads = [];
  const app = createApp({
    cfg: { adminToken: 'test-admin-token', trustedProxyHops: 0, corsOrigin: '' },
    state: { tokens: [], fundamentals: {}, vol10m: {}, alerts: [], news: [], unlocks: [] },
    githubAppClient: {
      async checkConnection() { return { connected: true }; },
      async getFile(path) {
        if (!['public/', 'lib/ai/', 'test/'].some((prefix) => path.startsWith(prefix)) || path.split('/').includes('..')) throw new Error('Path not allowed');
        reads.push(path);
        const value = path === 'test/large.js' ? 'x'.repeat(65537) : 'safe source';
        return { type: 'file', encoding: 'base64', path, sha: 'blob-sha', content: Buffer.from(value).toString('base64') };
      }
    }
  });
  await withServer(app, async (base) => {
    const headers = { 'x-admin-token': 'test-admin-token' };
    const denied = await fetch(base + '/api/github/file?path=server.js', { headers });
    assert.equal(denied.status, 400);
    const allowed = await fetch(base + '/api/github/file?path=lib%2Fai%2Fworkspace.js', { headers });
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.equal(body.file.content, 'safe source');
    const tooLarge = await fetch(base + '/api/github/file?path=test%2Flarge.js', { headers });
    assert.equal(tooLarge.status, 413);
    assert.deepEqual(reads, ['lib/ai/workspace.js', 'test/large.js']);
  });
});
