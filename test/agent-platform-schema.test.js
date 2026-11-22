'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'db/migrations/001_agent_platform.sql'), 'utf8');

test('agent platform migration defines registry, queue, dependencies and audit schema', () => {
  for (const table of ['agent_registry', 'task_queue', 'task_dependencies', 'audit_events']) {
    assert.match(migration, new RegExp('CREATE TABLE radar_agent\\.' + table + '\\b'));
  }
});

test('agent registry defaults to paused and restricts autonomy to Stage 0/1', () => {
  assert.match(migration, /status text NOT NULL DEFAULT 'paused'/);
  assert.match(migration, /autonomy_stage BETWEEN 0 AND 1/);
  assert.match(migration, /allowed_tools jsonb NOT NULL DEFAULT '\\[\\]'::jsonb/);
});

test('task queue has idempotency, bounded retries, leases and dispatch indexes', () => {
  assert.match(migration, /idempotency_key text UNIQUE/);
  assert.match(migration, /max_attempts BETWEEN 1 AND 10/);
  assert.match(migration, /lease_token uuid/);
  assert.match(migration, /task_queue_dispatch_idx/);
  assert.match(migration, /task_queue_lease_expiry_idx/);
});

test('task dependencies reject self-dependencies and use restrictive foreign keys', () => {
  assert.match(migration, /CHECK \\(task_id <> depends_on_task_id\\)/);
  assert.match(migration, /REFERENCES radar_agent\\.task_queue\\(task_id\\) ON DELETE RESTRICT/);
});

test('audit events reject update and delete and constrain actor/outcome', () => {
  assert.match(migration, /audit_events_no_update_or_delete/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON radar_agent\\.audit_events/);
  assert.match(migration, /actor_type IN \\('owner', 'director', 'agent', 'worker', 'system', 'service'\\)/);
  assert.match(migration, /outcome IN \\('recorded', 'allowed', 'denied', 'success', 'failure', 'pending'\\)/);
});
