'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync(require.resolve('../public/nexus.html'), 'utf8');

test('NEXUS dashboard consumes the canonical nexus-chat answer field', () => {
  assert.match(page, /body\.answer\s*\|\|/);
  assert.match(page, /body\.conversation_id/);
});

test('NEXUS browser client never embeds privileged or provider secrets', () => {
  assert.doesNotMatch(page, /service_role|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|XAI_API_KEY/);
  assert.match(page, /session\.access_token/);
});

test('NEXUS chat requires authenticated requests and never fabricates a reply', () => {
  assert.match(page, /Authorization['"]\s*:\s*['"]Bearer ['"]\s*\+/);
  assert.match(page, /if\(!res\.ok\)throw Error/);
  assert.match(page, /if\(!reply\)throw Error/);
});
