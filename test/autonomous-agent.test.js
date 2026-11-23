'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractJson, validatePatchPaths, buildPrompt } = require('../lib/ai/autonomous-agent');

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
