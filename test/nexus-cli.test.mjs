import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const contracts = await import('../src/nexus/contracts.mts');
const { createNexusClient } = await import('../src/nexus/client.mts');
const { createSessionStore, redact } = await import('../src/nexus/session.mjs');
const { createRepoContext } = await import('../src/nexus/repo.mjs');
const { createPolicyGateway } = await import('../src/nexus/policy.mjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('NEXUS contract validates instruction, command id and secret-like text', () => {
  assert.equal(contracts.validateInstruction('  halo NEXUS  '), 'halo NEXUS');
  assert.throws(() => contracts.validateInstruction(''), /INVALID_LENGTH/);
  assert.throws(() => contracts.validateInstruction('api_key=abcdefghijklmnop'), /SECRET_LIKE_INPUT/);
  assert.equal(contracts.validateCommandId('meeting-123'), 'meeting-123');
  assert.throws(() => contracts.validateCommandId('../bad'), /INVALID_COMMAND_ID/);
  assert.equal(contracts.sanitizeAssistantText('a\u0000b  c'), 'a b c');
});

test('client uses dashboard contract and reports provider unavailable honestly', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (String(url).endsWith('/api/health')) return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    if (String(url).endsWith('/api/ai/command')) return new Response(JSON.stringify({ status: 'started', command_id: 'meeting-42' }), { status: 202 });
    if (String(url).endsWith('/api/ai/usage')) return new Response(JSON.stringify({ usage: { providers: {} } }), { status: 200 });
    if (String(url).endsWith('/api/ai/workspace')) return new Response(JSON.stringify({ workspace: { last: { command_id: 'meeting-42', final: { summary: 'Ringkasan uji.' } } } }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const client = createNexusClient({ baseUrl: 'http://127.0.0.1:1', adminToken: 'test-token', fetchImpl });
  const status = await client.status();
  assert.equal(status.identity, 'RADAR NEXUS');
  assert.equal(status.model_is_proprietary, false);
  const chat = await client.chat('jelaskan server.js');
  assert.equal(chat.kind, 'accepted');
  assert.equal(chat.command_id, 'meeting-42');
  assert.equal(await client.result('meeting-42'), 'Ringkasan uji.');
  const commandCall = calls.find((item) => String(item.url).endsWith('/api/ai/command'));
  assert.equal(commandCall.init.headers['x-admin-token'], 'test-token');
  const noToken = createNexusClient({ baseUrl: 'http://127.0.0.1:1', adminToken: '', fetchImpl });
  const blocked = await noToken.chat('halo');
  assert.equal(blocked.kind, 'unavailable');
  assert.equal(blocked.status, 'not_configured');
});

test('sessions are local, bounded and redacted', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-session-'));
  const store = createSessionStore(dir);
  const session = await store.create();
  await store.append(session.id, { role: 'bos', content: 'token api_key=abcdefghijklmnop', at: new Date().toISOString() });
  const loaded = await store.get(session.id);
  assert.equal(loaded.messages[0].content, 'token [redacted]');
  assert.equal(redact('password=hunter2hunter2'), '[redacted]');
  assert.ok((await store.list()).includes(session.id));
  await store.clear(session.id);
  assert.equal((await store.list()).length, 0);
});

test('repo context is read-only and rejects traversal', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-repo-'));
  fs.writeFileSync(path.join(dir, 'sample.txt'), 'halo NEXUS\nbaris dua\n');
  const repo = createRepoContext(dir);
  assert.ok((await repo.list()).includes('sample.txt'));
  assert.match(await repo.read('sample.txt'), /halo NEXUS/);
  assert.equal((await repo.search('halo nexus')).length, 1);
  await assert.rejects(() => repo.read('../package.json'), /luar repository/);
});

test('policy denies by default and requires approval for edit/run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-policy-'));
  const file = path.join(dir, 'note.txt');
  fs.writeFileSync(file, 'lama\n');
  const denied = createPolicyGateway(dir);
  const blocked = await denied.requestEdit('note.txt', 'baru\n');
  assert.equal(blocked.applied, false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'lama\n');
  const approved = createPolicyGateway(dir, () => true);
  const applied = await approved.requestEdit('note.txt', 'baru\n');
  assert.equal(applied.applied, true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'baru\n');
  const badRun = await approved.requestRun('rm -rf /');
  assert.equal(badRun.approved, false);
});

test('CLI smoke: identity, help and honest provider status in non-interactive run', () => {
  const root = path.resolve(__dirname, '..');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-home-'));
  const result = spawnSync(process.execPath, [path.join(root, 'src/nexus/cli.mjs')], {
    input: '/help\n/status\n/exit\n',
    encoding: 'utf8',
    timeout: 20000,
    env: {
      ...process.env,
      HOME: home,
      NEXUS_REPO_ROOT: root,
      NEXUS_BASE_URL: 'http://127.0.0.1:1',
      NEXUS_ADMIN_TOKEN: '',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RADAR NEXUS/);
  assert.match(result.stdout, /\/help/);
  assert.match(result.stdout, /Provider: unavailable/);
  assert.doesNotMatch(result.stdout, /test-token|api_key=/);
});
