import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POLICY_REVISION, issueGrant } from '../src/nexus/core/capability.mjs';
import { createChangeProposal, buildPreview, submitProposal } from '../src/nexus/core/development.mjs';

const FIXED = new Date('2026-11-27T13:00:00.000Z');
const LATER = new Date('2026-11-27T13:30:00.000Z');

function grant(overrides = {}) {
  return issueGrant({
    issuer: 'RADAR', subject: 'nexus-dev', role: 'developer',
    actions: ['repo.read', 'repo.patch.propose'], resources: ['repo:*'], autonomyStage: 1,
    expiresAt: LATER.toISOString(), correlationId: 'dev-1',
    policyRevision: POLICY_REVISION, approvalRequired: true, ...overrides,
  }, { now: FIXED });
}

const base = {
  scope: 'radar-ai-v2',
  goal: 'Tambah panel status NEXUS pada dashboard tanpa mengubah menu existing.',
  files: ['public/app.js', 'lib/ai/status.js'],
  risk: 'Rendah; perubahan UI terbatas dan regression-tested.',
  acceptanceTests: ['npm test', 'npm run typecheck'],
  rollback: 'Revert commit pada branch terisolasi.',
  now: FIXED, correlationId: 'dev-1',
};

test('change proposal and preview are deterministic and side-effect free', () => {
  const g = grant();
  const a = createChangeProposal({ ...base, grant: g });
  const b = createChangeProposal({ ...base, grant: g });
  assert.equal(a.proposalId, b.proposalId);
  assert.deepEqual(buildPreview(a), buildPreview(b));
  assert.match(buildPreview(a).join('\n'), /Preview tekstual saja/);
  assert.equal(a.status, 'proposed');
  const source = readFileSync(new URL('../src/nexus/core/development.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /writeFile|execSync|spawn|fetch\(/);
});

test('approval is explicit and denies by default', () => {
  const g = grant();
  const proposal = createChangeProposal({ ...base, grant: g });
  const denied = submitProposal({ proposal, grant: g, now: FIXED, correlationId: 'dev-1' });
  assert.equal(denied.status, 'denied');
  assert.equal(denied.reason, 'approval_required');
  const approved = submitProposal({ proposal, grant: g, approved: true, now: FIXED, correlationId: 'dev-1' });
  assert.equal(approved.status, 'approved_for_isolated_work');
  assert.ok(approved.boundaries.some((line) => line.includes('Tidak ada merge')));
});

test('protected paths, traversal, secrets and shell input are rejected', () => {
  const g = grant();
  for (const bad of ['.env', '../server.js', '/etc/passwd', 'node_modules/x', '.git/config']) {
    assert.throws(() => createChangeProposal({ ...base, grant: g, files: [bad] }), /PROTECTED_PATH/);
  }
  assert.throws(() => createChangeProposal({ ...base, grant: g, goal: 'api_key=abcdefghijklmnopqrstuv' }), /SECRET_LIKE_INPUT/);
  assert.throws(() => createChangeProposal({ ...base, grant: g, acceptanceTests: ['npm test; rm -rf /'] }), /COMMAND_INJECTION/);
  assert.throws(() => createChangeProposal({ ...base, grant: g, acceptanceTests: ['curl https://example.invalid'] }), /COMMAND_INJECTION/);
});

test('expired, replayed and out-of-scope grants cannot create a proposal', () => {
  assert.throws(() => createChangeProposal({ ...base, grant: grant(), now: LATER, correlationId: 'dev-1' }), /CAPABILITY_DENIED/);
  assert.throws(() => createChangeProposal({ ...base, grant: grant(), correlationId: 'replayed' }), /CAPABILITY_DENIED/);
  const readOnly = grant({ actions: ['repo.read'] });
  const proposal = createChangeProposal({ ...base, grant: readOnly });
  assert.equal(submitProposal({ proposal, grant: readOnly, approved: true, now: FIXED, correlationId: 'dev-1' }).reason, 'action_not_granted');
  assert.throws(() => createChangeProposal({ ...base, grant: grant({ resources: ['knowledge:*'] }) }), /CAPABILITY_DENIED/);
});
