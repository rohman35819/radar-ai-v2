'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('AI Research Council has exactly six fail-closed specialist roles', async () => {
  const { AGENT_ROLES, getAgentRole, canPerform, isAgentRole, isAgentRoleId } =
    await import('../src/platform/agent-roles.mts');

  assert.deepEqual(AGENT_ROLES.map((role) => role.id), [
    'market-analyst',
    'quant-researcher',
    'strategy-developer',
    'risk-analyst',
    'portfolio-manager',
    'independent-reviewer',
  ]);
  for (const role of AGENT_ROLES) {
    assert.equal(canPerform(role, 'read_market'), true);
    assert.equal(canPerform(role, 'propose_strategy'), true);
    for (const forbidden of ['write_code', 'read_private_account', 'approve', 'execute_trade', 'withdraw']) {
      assert.equal(canPerform(role, forbidden), false, `${role.id} must not have ${forbidden}`);
    }
  }
  assert.equal(isAgentRoleId('risk-analyst'), true);
  assert.equal(isAgentRoleId('super-agent'), false);
  assert.equal(getAgentRole('unknown'), null);

  const forged = {
    ...AGENT_ROLES[0],
    capabilities: { ...AGENT_ROLES[0].capabilities, write_code: true, execute_trade: true, approve: true },
  };
  assert.equal(isAgentRole(forged), false);
  assert.equal(canPerform(forged, 'read_market'), false);
  assert.equal(canPerform(null, 'read_market'), false);
});

test('task admission denies unless worker, Rp0 budget and kill-switch gates all pass', async () => {
  const { evaluateTaskAdmission, isRp0Control } = await import('../src/platform/task-policy.mts');
  const control = { paused: false, kill_switch: false, max_concurrency: 1, daily_budget_usd: 0 };
  const base = { enabled: true, control, active_tasks: 0, autonomy_stage: 1 };

  assert.deepEqual(evaluateTaskAdmission(base), { allow: true, reasons: [] });
  assert.equal(isRp0Control(control), true);
  assert.equal(evaluateTaskAdmission({ ...base, enabled: false }).reasons.includes('WORKER_DISABLED'), true);
  assert.equal(evaluateTaskAdmission({ ...base, control: { ...control, paused: true } }).reasons.includes('PLATFORM_PAUSED'), true);
  assert.equal(evaluateTaskAdmission({ ...base, control: { ...control, kill_switch: true } }).reasons.includes('KILL_SWITCH_ON'), true);
  assert.equal(evaluateTaskAdmission({ ...base, active_tasks: 1 }).reasons.includes('CONCURRENCY_LIMIT'), true);
  assert.equal(evaluateTaskAdmission({ ...base, autonomy_stage: 2 }).reasons.includes('AUTONOMY_STAGE_TOO_HIGH'), true);
  assert.equal(evaluateTaskAdmission({ ...base, control: null }).reasons.includes('INVALID_CONTROL'), true);
  const paid = { ...control, daily_budget_usd: 5 };
  assert.equal(evaluateTaskAdmission({ ...base, control: paid }).reasons.includes('BUDGET_NOT_RP0'), true);
  assert.equal(isRp0Control(paid), false);
  assert.equal(evaluateTaskAdmission({ ...base, control: paid }).allow, false);
});

test('memory retrieval applies scope and sensitivity before ranking', async () => {
  const { isMemoryVisible, rankVisibleMemory, isMemoryScope, isMemoryRecordLike } =
    await import('../src/memory/retrieval.mts');
  const now = '2026-11-27T00:00:00Z';
  const scope = { type: 'project', id: 'radar-ai-v2' };
  const allowed = ['public', 'internal'];
  const record = {
    memory_key: 'decision-01',
    scope_type: 'project',
    scope_id: 'radar-ai-v2',
    sensitivity: 'internal',
    status: 'approved',
    valid_from: '2026-01-01T00:00:00Z',
    valid_until: null,
    retention_until: '2027-01-01T00:00:00Z',
    created_at: '2026-11-01T00:00:00Z',
    source_ref: 'https://github.com/rohman35819/radar-ai-v2/issues/150',
    source_revision: 'f38d25a',
  };

  assert.equal(isMemoryScope(scope), true);
  assert.equal(isMemoryRecordLike(record), true);
  assert.equal(isMemoryVisible(record, scope, allowed, now), true);
  assert.equal(isMemoryVisible(record, { type: 'project', id: 'other' }, allowed, now), false);
  assert.equal(isMemoryVisible(record, scope, ['public'], now), false);
  assert.equal(isMemoryVisible({ ...record, status: 'proposed' }, scope, allowed, now), false);
  assert.equal(isMemoryVisible({ ...record, retention_until: '2026-01-01T00:00:00Z' }, scope, allowed, now), false);
  assert.equal(isMemoryVisible({ ...record, valid_from: '2027-01-01T00:00:00Z' }, scope, allowed, now), false);
  assert.equal(isMemoryVisible({ ...record, source_revision: '' }, scope, allowed, now), false);

  const newer = { ...record, memory_key: 'decision-02', created_at: '2026-11-20T00:00:00Z' };
  const proposed = { ...record, memory_key: 'decision-03', status: 'proposed' };
  assert.deepEqual(
    rankVisibleMemory([record, proposed, newer], scope, allowed, now).map((item) => item.memory_key),
    ['decision-02', 'decision-01'],
  );
});

test('audit event builder rejects secrets, unknown actions and unbounded input', async () => {
  const { buildAuditEvent } = await import('../src/platform/audit-event.mts');
  const base = {
    event_id: 'evt-0001',
    occurred_at: '2026-11-27T00:00:00Z',
    actor: 'grok',
    action: 'task.claim',
    entity_type: 'task',
    entity_id: 'task-0001',
    outcome: 'success',
    correlation_id: 'corr-0001',
    detail: 'claimed bounded task',
  };
  const built = buildAuditEvent(base);
  assert.ok(built);
  assert.equal(built.actor, 'grok');
  assert.equal(built.correlation_id, 'corr-0001');
  assert.equal(buildAuditEvent({ ...base, action: 'trade.execute' }), null);
  assert.equal(buildAuditEvent({ ...base, detail: 'api_key=abcdefghijklmnop' }), null);
  assert.equal(buildAuditEvent({ ...base, detail: 'x'.repeat(501) }), null);
  assert.equal(buildAuditEvent({ ...base, correlation_id: 'bad id!' }), null);
  assert.equal(buildAuditEvent({ ...base, outcome: 'maybe' }), null);
  assert.equal(buildAuditEvent(null), null);
});
