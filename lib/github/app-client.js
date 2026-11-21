'use strict';

const crypto = require('node:crypto');

const API = 'https://api.github.com';
const ALLOWED_ROOTS = ['public/', 'lib/ai/', 'test/'];

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function createAppJwt({ appId, privateKey, now = Date.now() }) {
  if (!appId || !privateKey) throw new Error('GITHUB_APP_ID dan GITHUB_APP_PRIVATE_KEY wajib diisi');
  const key = String(privateKey).replace(/\\n/g, '\n');
  const issued = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: issued - 60, exp: issued + 540, iss: String(appId) }));
  const input = header + '.' + payload;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return input + '.' + signer.sign(key, 'base64url');
}

function validateRepoPath(filePath) {
  const value = String(filePath || '').replace(/^\/+/, '');
  if (!value || value.length > 240 || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Path file tidak valid');
  }
  if (!ALLOWED_ROOTS.some((root) => value.startsWith(root))) {
    throw new Error('AI Developer hanya boleh mengubah public/, lib/ai/, dan test/');
  }
  return value.split('/').map(encodeURIComponent).join('/');
}

function validateBranch(branch) {
  const value = String(branch || '');
  if (!/^ai-dev\/[a-z0-9][a-z0-9-]{1,50}$/.test(value)) throw new Error('Branch harus memakai format ai-dev/nama-tugas');
  return value;
}

function createGithubAppClient({ appId, privateKey, installationId, repository, fetchImpl = fetch, now = Date.now }) {
  if (!installationId || !repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('GITHUB_APP_INSTALLATION_ID dan GITHUB_REPOSITORY wajib valid');
  }
  let cachedToken = null;
  let cachedUntil = 0;

  async function installationToken() {
    if (cachedToken && now() < cachedUntil) return cachedToken;
    const jwt = createAppJwt({ appId, privateKey, now: now() });
    const response = await fetchImpl(API + '/app/installations/' + encodeURIComponent(installationId) + '/access_tokens', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + jwt, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }
    });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('GitHub App token response bukan JSON'); }
    if (!response.ok || !payload.token) throw new Error('Gagal membuat installation token: ' + String(payload.message || response.status).slice(0, 160));
    cachedToken = payload.token;
    cachedUntil = payload.expires_at ? Date.parse(payload.expires_at) - 60000 : now() + 3000000;
    return cachedToken;
  }

  async function request(path, { method = 'GET', body } = {}) {
    if (!path.startsWith('/repos/' + repository + '/') || !['GET', 'POST', 'PUT'].includes(method)) {
      throw new Error('GitHub API path atau metode tidak diizinkan');
    }
    const token = await installationToken();
    const response = await fetchImpl(API + path, {
      method,
      headers: {
        authorization: 'Bearer ' + token,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000)
    });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('GitHub API response bukan JSON'); }
    if (!response.ok) throw new Error('GitHub API: ' + String(payload.message || response.status).slice(0, 180));
    return payload;
  }

  return {
    async createBranch(taskSlug, base = 'main') {
      const branch = validateBranch('ai-dev/' + taskSlug);
      const baseRef = await request('/repos/' + repository + '/git/ref/heads/' + encodeURIComponent(base));
      await request('/repos/' + repository + '/git/refs', { method: 'POST', body: { ref: 'refs/heads/' + branch, sha: baseRef.object.sha } });
      return branch;
    },
    async getFile(filePath, ref) {
      const file = validateRepoPath(filePath);
      const query = ref ? '?ref=' + encodeURIComponent(validateBranch(ref)) : '';
      return request('/repos/' + repository + '/contents/' + file + query);
    },
    async putFile({ path: filePath, content, branch, sha, message }) {
      const file = validateRepoPath(filePath);
      const target = validateBranch(branch);
      if (typeof content !== 'string' || content.length > 150000) throw new Error('Isi file tidak valid atau terlalu besar');
      if (!message || String(message).length > 120) throw new Error('Pesan commit wajib diisi');
      return request('/repos/' + repository + '/contents/' + file, {
        method: 'PUT',
        body: { message, content: Buffer.from(content, 'utf8').toString('base64'), branch: target, ...(sha ? { sha } : {}) }
      });
    },
    async openPullRequest({ branch, title, body = '' }) {
      const head = validateBranch(branch);
      if (!title || String(title).length > 120) throw new Error('Judul Pull Request wajib diisi');
      return request('/repos/' + repository + '/pulls', {
        method: 'POST',
        body: { title, head, base: 'main', body, draft: true }
      });
    }
  };
}

module.exports = { createAppJwt, createGithubAppClient, validateRepoPath, validateBranch };
