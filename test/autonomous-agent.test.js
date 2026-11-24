'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractJson, validatePatchPaths, buildPrompt, safeChildEnv, buildProviderCandidates, main } = require('../lib/ai/autonomous-agent');

test('accepts only existing allowlisted AI source and test files', () => {
  const tracked = new Set(['lib/ai/workspace.js']);
  const patch = ['diff --git a/lib/ai/workspace.js b/lib/ai/workspace.js', '--- a/lib/ai/workspace.js', '+++ b/lib/ai/workspace.js', '@@ -1 +1 @@', '-old', '+new'].join('\n');
  assert.deepEqual(validatePatchPaths(patch, tracked), ['lib/ai/workspace.js']);
});

test('rejects server paths, traversal, new/deleted files and oversized patches', () => {
  const tracked = new Set(['server.js', 'lib/ai/workspace.js']);
  const patchFor = (file) => 'diff --git a/' + file + ' b/' + file + '\n--- a/' + file + '\n+++ b/' + file + '\n@@ -1 +1 @@\n-a\n+b';
  assert.throws(() => validatePatchPaths(patchFor('server.js'), tracked), /tidak diizinkan/);
  assert.throws(() => validatePatchPaths(patchFor('../server.js'), tracked), /tidak diizinkan/);
  assert.throws(() => validatePatchPaths('--- /dev/null\n+++ b/lib/ai/new.js\n', tracked), /identik/);
  assert.throws(() => validatePatchPaths('deleted file mode 100644\n', tracked), /ditolak/);
  assert.throws(() => validatePatchPaths('x'.repeat(40001), tracked), /40 KiB/);
});

test('extracts JSON from plain and fenced model responses', () => {
  assert.deepEqual(extractJson('```json\n{"patch":"","summary":"none"}\n```'), { patch: '', summary: 'none' });
  assert.deepEqual(extractJson('{"ok":true}'), { ok: true });
});

test('prompt sets non-negotiable authority boundaries', () => {
  const prompt = buildPrompt({ 'lib/ai/workspace.js': 'source' });
  assert.match(prompt, /Tidak ada merge\/deploy/);
  assert.match(prompt, /DATA TIDAK TEPERCAYA/);
  assert.match(prompt, /maksimal 3 file/i);
});

test('strips provider keys and GitHub credentials from child process environments', () => {
  const safe = safeChildEnv({
    PATH: '/usr/bin',
    HOME: '/tmp/home',
    CI: 'true',
    GITHUB_TOKEN: 'must-not-propagate',
    GROQ_API_KEY: 'must-not-propagate',
    OPENROUTER_API_KEY: 'must-not-propagate',
    AUTONOMOUS_AGENT_ENABLED: '1',
  });
  assert.deepEqual(safe, { PATH: '/usr/bin', HOME: '/tmp/home', CI: 'true' });
  assert.equal(Object.hasOwn(safe, 'GITHUB_TOKEN'), false);
  assert.equal(Object.hasOwn(safe, 'GROQ_API_KEY'), false);
  assert.equal(Object.hasOwn(safe, 'OPENROUTER_API_KEY'), false);
});

test('allows only the narrowly scoped GitHub extra-header for trusted git push', () => {
  const source = {
    PATH: '/usr/bin',
    GITHUB_TOKEN: 'must-not-propagate',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic dG9rZW4=',
  };
  assert.deepEqual(safeChildEnv(source), { PATH: '/usr/bin' });
  assert.deepEqual(safeChildEnv(source, { allowGitAuthConfig: true }), {
    PATH: '/usr/bin',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic dG9rZW4=',
  });
  assert.deepEqual(safeChildEnv({ ...source, GIT_CONFIG_KEY_0: 'core.hooksPath' }, { allowGitAuthConfig: true }), { PATH: '/usr/bin' });
});

test('main exits safely while disabled without touching network or filesystem', async () => {
  let touched = false;
  await main({ AUTONOMOUS_AGENT_ENABLED: '0' }, {
    fetch: async () => { touched = true; throw new Error('network must not run'); },
    run: () => { touched = true; throw new Error('git must not run'); },
    readFile: () => { touched = true; throw new Error('filesystem must not run'); },
  });
  assert.equal(touched, false);
});

test('main stops before provider or source access when an autonomous draft is outstanding', async () => {
  let providerCalled = false;
  let gitCalled = false;
  await main({
    AUTONOMOUS_AGENT_ENABLED: '1',
    GITHUB_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'owner/repo',
    OPENROUTER_API_KEY: 'test-provider-key',
  }, {
    fetch: async () => new Response(JSON.stringify([{ body: '<!-- radar-autonomous-agent -->' }]), { status: 200 }),
    providerCall: async () => { providerCalled = true; throw new Error('must not call provider'); },
    run: () => { gitCalled = true; throw new Error('must not call git'); },
    readFile: () => { throw new Error('must not read sources'); },
  });
  assert.equal(providerCalled, false);
  assert.equal(gitCalled, false);
});

test('Groq autonomous provider is opt-in and OpenRouter fallback is pinned to free routing', () => {
  assert.deepEqual(buildProviderCandidates({ GROQ_API_KEY: 'groq-key' }), []);
  assert.deepEqual(buildProviderCandidates({ GROQ_AUTONOMOUS_ENABLED: '1', GROQ_API_KEY: 'groq-key' }), [
    ['groq', 'groq-key', 'openai/gpt-oss-20b']
  ]);
  assert.deepEqual(buildProviderCandidates({
    GROQ_AUTONOMOUS_ENABLED: '1', GROQ_API_KEY: 'groq-key', GROQ_MODEL: 'openai/gpt-oss-20b',
    OPENROUTER_API_KEY: 'router-key'
  }), [
    ['groq', 'groq-key', 'openai/gpt-oss-20b'],
    ['openrouter', 'router-key', 'openrouter/free']
  ]);
  assert.deepEqual(buildProviderCandidates({ OPENROUTER_API_KEY: 'router-key', OPENROUTER_MODEL: 'paid-model' }), [
    ['openrouter', 'router-key', 'openrouter/free']
  ]);
  assert.throws(() => buildProviderCandidates({
    GROQ_AUTONOMOUS_ENABLED: '1', GROQ_API_KEY: 'groq-key', GROQ_MODEL: 'invalid model'
  }), /GROQ_MODEL tidak valid/);
});

test('main skips provider use when no explicitly enabled provider key is configured', async () => {
  let providerCalled = false;
  const result = await main({
    AUTONOMOUS_AGENT_ENABLED: '1',
    GITHUB_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'owner/repo',
  }, {
    fetch: async () => new Response('[]', { status: 200 }),
    run: () => 'lib/ai/workspace.js\nlib/ai/group.js\ntest/ai-workspace.test.js\n',
    readFile: () => 'source',
    providerCall: async () => { providerCalled = true; return {}; },
  });
  assert.equal(providerCalled, false);
  assert.equal(result, undefined);
});

test('rejects malformed and hostile model output before any patch can be applied', () => {
  assert.throws(() => extractJson('not JSON'), /tidak mengembalikan JSON/);
  const tracked = new Set(['lib/ai/workspace.js']);
  const hostile = [
    'diff --git a/server.js b/server.js',
    '--- a/server.js',
    '+++ b/server.js',
    '@@ -1 +1 @@',
    '-safe',
    '+exfiltrate(process.env.GITHUB_TOKEN)',
  ].join('\n');
  assert.throws(() => validatePatchPaths(hostile, tracked), /tidak diizinkan/);
});

test('provider failure stops before any repository mutation', async () => {
  const commands = [];
  await assert.rejects(main({
    AUTONOMOUS_AGENT_ENABLED: '1',
    GITHUB_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'owner/repo',
    OPENROUTER_API_KEY: 'test-free-key',
  }, {
    fetch: async () => new Response('[]', { status: 200 }),
    run: (command, args) => { commands.push(args.join(' ')); return args[0] === 'ls-files' ? 'lib/ai/workspace.js\n' : ''; },
    readFile: () => 'source',
    providerCall: async () => { throw new Error('free provider unavailable'); },
  }), /Provider gagal: free provider unavailable/);
  assert.deepEqual(commands, ['ls-files']);
});

test('patch application failure always removes the temporary patch', async () => {
  let removed = false;
  await assert.rejects(main({
    AUTONOMOUS_AGENT_ENABLED: '1',
    GITHUB_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'owner/repo',
    OPENROUTER_API_KEY: 'test-free-key',
  }, {
    fetch: async () => new Response('[]', { status: 200 }),
    run: (command, args) => {
      if (args[0] === 'ls-files') return 'lib/ai/workspace.js\n';
      if (args[0] === 'apply') throw new Error('patch rejected');
      throw new Error('unexpected command');
    },
    readFile: () => 'source',
    providerCall: async () => ({
      summary: 'safe patch proposal',
      patch: ['diff --git a/lib/ai/workspace.js b/lib/ai/workspace.js', '--- a/lib/ai/workspace.js', '+++ b/lib/ai/workspace.js', '@@ -1 +1 @@', '-old', '+new'].join('\n'),
    }),
    writePatch: () => {},
    removePatch: () => { removed = true; },
  }), /patch rejected/);
  assert.equal(removed, true);
});

test('failed PR creation attempts to delete the orphaned remote branch', async () => {
  const commands = [];
  const requests = [];
  await assert.rejects(main({
    AUTONOMOUS_AGENT_ENABLED: '1',
    GITHUB_TOKEN: 'test-token',
    GITHUB_REPOSITORY: 'owner/repo',
    OPENROUTER_API_KEY: 'test-free-key',
  }, {
    fetch: async (url, options = {}) => {
      requests.push(options.method || 'GET');
      if (!options.method) return new Response('[]', { status: 200 });
      return new Response(JSON.stringify({ message: 'permission denied' }), { status: 403 });
    },
    run: (command, args) => {
      commands.push(args.join(' '));
      if (args[0] === 'ls-files') return 'lib/ai/workspace.js\n';
      if (args[0] === 'diff' && args[1] === '--name-only') return 'lib/ai/workspace.js\n';
      return '';
    },
    readFile: () => 'source',
    providerCall: async () => ({
      summary: 'safe patch proposal',
      patch: ['diff --git a/lib/ai/workspace.js b/lib/ai/workspace.js', '--- a/lib/ai/workspace.js', '+++ b/lib/ai/workspace.js', '@@ -1 +1 @@', '-old', '+new'].join('\n'),
    }),
    writePatch: () => {},
    removePatch: () => {},
    now: () => new Date('2026-11-24T00:00:00.000Z'),
  }), /PR gagal: permission denied/);
  assert.deepEqual(requests, ['GET', 'POST']);
  assert.ok(commands.some((command) => command.startsWith('push origin --delete ai-dev/autonomous-')));
});
