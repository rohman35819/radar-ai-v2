'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runGithubReadAgent } = require('../lib/ai/github-agent');

test('Gemini Function Calling can read an allowed GitHub file and summarize it', async () => {
  const requests = [];
  let fileReads = 0;
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) {
      return { ok: true, json: async () => ({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'github_read_file', args: { path: 'lib/ai/workspace.js' } } }] } }] }) };
    }
    const body = JSON.parse(options.body);
    const toolResponse = body.contents[2].parts[0].functionResponse.response;
    assert.equal(toolResponse.ok, true);
    assert.equal(toolResponse.path, 'lib/ai/workspace.js');
    assert.match(toolResponse.content, /project strategy source/);
    return { ok: true, json: async () => ({ candidates: [{ content: { role: 'model', parts: [{ text: 'Saya sudah membaca lib/ai/workspace.js dan menemukan alur review AI.' }] } }] }) };
  };
  const githubClient = {
    async checkConnection() { return { connected: true }; },
    async getFile(path) {
      fileReads++;
      assert.equal(path, 'lib/ai/workspace.js');
      return { type: 'file', encoding: 'base64', path, sha: 'blob-sha', content: Buffer.from('// project strategy source').toString('base64') };
    }
  };
  const result = await runGithubReadAgent({ instruction: 'Periksa alur AI workspace', githubClient, apiKey: 'test-gemini-key', model: 'gemini-test', fetchImpl });
  assert.match(result.answer, /sudah membaca/);
  assert.equal(result.mode, 'read-only');
  assert.deepEqual(result.tool_calls, [{ name: 'github_read_file', status: 'success', path: 'lib/ai/workspace.js' }]);
  assert.equal(fileReads, 1);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers['x-goog-api-key'], 'test-gemini-key');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(JSON.stringify(result).includes('test-gemini-key'), false);
});

test('Gemini GitHub agent rejects unknown tools without executing them', async () => {
  let fileReads = 0;
  const fetchImpl = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'github_delete_repository', args: { repository: 'owner/repo' } } }] } }] }) });
  const result = await runGithubReadAgent({
    instruction: 'Audit repository',
    githubClient: { async checkConnection() { return { connected: true }; }, async getFile() { fileReads++; throw new Error('must not run'); } },
    apiKey: 'test-gemini-key',
    fetchImpl,
    maxRounds: 1
  });
  assert.equal(fileReads, 0);
  assert.deepEqual(result.tool_calls, [{ name: 'github_delete_repository', status: 'rejected' }]);
  assert.equal(result.mode, 'read-only');
  assert.equal(result.stopped, 'MAX_TOOL_ROUNDS');
});
