'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const page = fs.readFileSync(require.resolve('../public/nexus.html'), 'utf8');

test('NEXUS dashboard reads the canonical answer field returned by nexus-chat', () => {
  assert.match(page, /body\.answer/);
  assert.match(page, /body\.conversation_id/);
  assert.match(page, /action:'list_conversations'/);
  assert.match(page, /action:'history'/);
  assert.match(page, /nexus-conversation-id/);
});

test('NEXUS browser client uses a user JWT and contains no privileged/provider secret', () => {
  assert.match(page, /session\.access_token/);
  assert.doesNotMatch(page, /service_role|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|XAI_API_KEY|GEMINI_API_KEY|ANTHROPIC_API_KEY/);
});

test('NEXUS does not fabricate replies on failed or malformed API responses', () => {
  assert.match(page, /if\(!res\.ok\)\{const error=new Error/);
  assert.match(page, /if\(!body\.answer\)throw Error/);
  assert.match(page, /error\.payload=body/);
});
