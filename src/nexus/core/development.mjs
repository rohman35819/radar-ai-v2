/** RADAR development operator: proposal -> preview -> explicit approval.
 * No filesystem writes, no command execution, no network, no side effects. */
import { createHash } from 'node:crypto';
import { LEARNING_SCHEMA, ContractError } from './contracts.mts';
import { assertCapability, checkCapability, redact } from './capability.mjs';

const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/+=._-]{12,})/i;
const PROTECTED_RE = /\.env($|\.)|credential|secret|private[_-]?key|node_modules|(\.|^|\/)git\//i;
const MAX_FILES = 20;
const ALLOWED_TESTS = /^(npm test|npm run typecheck|node --test test\/|python3 -m unittest)/;

function field(value, code, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ContractError(code, `field wajib 1..${max} karakter`);
  return redact(value.trim());
}

export function createChangeProposal({ grant, goal, files, risk, acceptanceTests, rollback, scope, now = new Date(), correlationId }) {
  const resource = `repo:${String(scope ?? '')}`;
  assertCapability(grant, { action: 'repo.read', resource, now, correlationId });
  if (typeof scope !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,96}$/.test(scope)) throw new ContractError('INVALID_SCOPE', 'scope tidak valid');
  if (typeof goal === 'string' && SECRET_RE.test(goal)) throw new ContractError('SECRET_LIKE_INPUT', 'goal mengandung pola secret');
  const cleanGoal = field(goal, 'INVALID_GOAL', 2000);
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) throw new ContractError('INVALID_FILES', 'files wajib 1..20');
  const cleanFiles = files.map((item) => {
    if (typeof item !== 'string' || !/^[A-Za-z0-9_./-]{1,160}$/.test(item) || item.includes('..') || item.startsWith('/') || PROTECTED_RE.test(item)) {
      throw new ContractError('PROTECTED_PATH', `path ditolak: ${String(item).slice(0, 80)}`);
    }
    return item;
  });
  if (!Array.isArray(acceptanceTests) || acceptanceTests.length < 1 || acceptanceTests.length > 8) {
    throw new ContractError('INVALID_TESTS', 'acceptanceTests wajib 1..8');
  }
  const tests = acceptanceTests.map((item) => {
    if (typeof item !== 'string' || !ALLOWED_TESTS.test(item) || /[;|&<>`$]/.test(item)) {
      throw new ContractError('COMMAND_INJECTION', 'perintah uji tidak dalam allowlist');
    }
    return item;
  });
  const id = `chg_${createHash('sha256').update(`${scope}:${cleanGoal}:${cleanFiles.join(',')}`).digest('hex').slice(0, 16)}`;
  return Object.freeze({
    schema_version: LEARNING_SCHEMA,
    proposalId: id,
    scope,
    goal: cleanGoal,
    files: Object.freeze(cleanFiles),
    risk: field(risk, 'INVALID_RISK', 1000),
    acceptanceTests: Object.freeze(tests),
    rollback: field(rollback, 'INVALID_ROLLBACK', 1000),
    status: 'proposed',
    createdAt: now.toISOString(),
    issuer: grant.subject,
    policyRevision: grant.policyRevision,
  });
}

/** Deterministic text-only preview. Never reads the repository or runs a command. */
export function buildPreview(proposal) {
  if (!proposal || !Array.isArray(proposal.files)) throw new ContractError('INVALID_PROPOSAL', 'proposal tidak valid');
  return Object.freeze([
    `CHANGE PROPOSAL ${proposal.proposalId} (${proposal.status})`,
    `Tujuan: ${proposal.goal}`,
    `Scope: ${proposal.scope}`,
    `File: ${proposal.files.join(', ')}`,
    `Risiko: ${proposal.risk}`,
    `Rollback: ${proposal.rollback}`,
    `Uji: ${proposal.acceptanceTests.join(' | ')}`,
    'Preview tekstual saja. Tidak ada diff aktual, eksekusi, atau tulisan ke repository.',
  ]);
}

/** Approval is explicit; without it the proposal stays proposed and no patch is applied. */
export function submitProposal({ proposal, grant, approved = false, now = new Date(), correlationId }) {
  const decision = checkCapability(grant, {
    action: 'repo.patch.propose', resource: `repo:${proposal.scope}`, now, correlationId, approved,
  });
  return Object.freeze({
    proposalId: proposal.proposalId,
    status: decision.allowed ? 'approved_for_isolated_work' : 'denied',
    reason: decision.reason,
    boundaries: Object.freeze([
      'Hanya branch/workspace terisolasi; tidak ada direct push ke main/develop.',
      'Tidak ada merge, deploy, production secret, worker, trading, atau withdrawal.',
      'Semua perubahan harus lolos test/security/diff review sebelum approval RADAR.',
    ]),
    at: now.toISOString(),
  });
}
