'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'db/migrations/001_agent_platform.sql'), 'utf8');

test('agent platform migration defines registry, queue, dependencies and audit schema', () => {
  for (const table of ['agent_registry', 'task_queue', 'task_dependencies', 'audit_events']) {
    assert.ok(migration.includes('CREATE TABLE radar_agent.' + table), 'missing table: ' + table);
  }
});

test('agent registry defaults to paused and restricts autonomy to Stage 0/1', () => {
  assert.ok(migration.includes("status text NOT NULL DEFAULT 'paused'"));
  assert.ok(migration.includes('autonomy_stage BETWEEN 0 AND 1'));
  assert.ok(migration.includes("allowed_tools jsonb NOT NULL DEFAULT '[]'::jsonb"));
});

test('task queue has idempotency, bounded retries, leases and dispatch indexes', () => {
  for (const fragment of ['idempotency_key text UNIQUE', 'max_attempts BETWEEN 1 AND 3',
    'lease_token uuid', 'task_queue_dispatch_idx', 'task_queue_lease_expiry_idx']) {
    assert.ok(migration.includes(fragment), 'missing queue contract: ' + fragment);
  }
});

test('task dependencies reject self-dependencies and use restrictive foreign keys', () => {
  assert.ok(migration.includes('CHECK (task_id <> depends_on_task_id)'));
  assert.ok(migration.includes('REFERENCES radar_agent.task_queue(task_id) ON DELETE RESTRICT'));
});

test('audit events reject update and delete and constrain actor/outcome', () => {
  for (const fragment of ['audit_events_no_update_or_delete',
    'BEFORE UPDATE OR DELETE ON radar_agent.audit_events',
    "actor_type IN ('owner', 'director', 'agent', 'worker', 'system', 'service')",
    "outcome IN ('recorded', 'allowed', 'denied', 'success', 'failure', 'pending')"]) {
    assert.ok(migration.includes(fragment), 'missing audit contract: ' + fragment);
  }
  assert.ok(!migration.includes('previous_hash') && !migration.includes('event_hash'), 'hash chain is deferred until implemented');
});


test('registry covers divisions 01-08 and enforces zero budget and one-worker concurrency', () => {
  assert.ok(migration.includes("division_code IN ('01', '02', '03', '04', '05', '06', '07', '08')"));
  assert.ok(migration.includes('max_concurrency = 1'));
  assert.ok(migration.includes('daily_budget_usd = 0'));
});

test('queue and audit payloads are bounded and retries cannot exceed the configured cap', () => {
  for (const fragment of [
    'max_attempts BETWEEN 1 AND 3',
    'CHECK (attempt_count <= max_attempts)',
    'octet_length(input_payload::text) <= 65536',
    'octet_length(result_payload::text) <= 65536',
    'octet_length(metadata::text) <= 16384'
  ]) assert.ok(migration.includes(fragment), 'missing bounded resource contract: ' + fragment);
});
