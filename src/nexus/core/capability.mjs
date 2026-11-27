/** RADAR-issued capability checks. Deny by default; no self-expansion. */
import { GRANT_SCHEMA, ContractError, validateGrant } from './contracts.mts';

export const POLICY_REVISION = 'radar-policy-v1';
const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/+=._-]{12,})/gi;
const ELEVATED = new Set(['knowledge.approve', 'repo.patch.propose']);
const STAGE_MIN = { 'knowledge.read': 0, 'repo.read': 0, 'knowledge.propose': 1, 'knowledge.approve': 2, 'repo.patch.propose': 1 };
const MAX_AUDIT = 100;

export function redact(value) {
  return String(value ?? '').replace(SECRET_RE, '[redacted]');
}

export class CapabilityDenied extends Error {
  constructor(reason) { super(`CAPABILITY_DENIED: ${reason}`); this.name = 'CapabilityDenied'; this.reason = reason; }
}

function safeResource(value) {
  const text = String(value ?? '');
  if (!text || text.length > 160 || text.includes('..') || text.includes('\0') || /[\\]/.test(text)) return null;
  return text;
}

function resourceAllowed(resource, allowed) {
  if (resource === allowed) return true;
  if (allowed.endsWith('*')) return resource.startsWith(allowed.slice(0, -1));
  return resource.startsWith(allowed + ':');
}

/** RADAR issues a short-lived scoped grant. Never callable by NEXUS itself. */
export function issueGrant(input, { now = new Date(), policyRevision = POLICY_REVISION } = {}) {
  const grant = validateGrant(input);
  if (grant.schema_version !== GRANT_SCHEMA) throw new ContractError('INVALID_GRANT', 'schema_version tidak cocok');
  if (Date.parse(grant.expiresAt) <= now.getTime()) throw new ContractError('EXPIRED_GRANT', 'grant sudah kedaluwarsa');
  if (grant.policyRevision !== policyRevision) throw new ContractError('POLICY_REVISION_MISMATCH', 'policy revision tidak cocok');
  for (const resource of grant.resources) if (!safeResource(resource)) throw new ContractError('INVALID_RESOURCE', 'resource tidak aman');
  if (ELEVATED.size && grant.actions.some((a) => ELEVATED.has(a)) && grant.approvalRequired !== true) {
    throw new ContractError('APPROVAL_REQUIRED', 'action elevated wajib approvalRequired=true');
  }
  return Object.freeze({ ...grant, actions: Object.freeze([...grant.actions]), resources: Object.freeze([...grant.resources]) });
}

export function checkCapability(grant, { action, resource, now = new Date(), correlationId, approved = false, policyRevision = POLICY_REVISION } = {}) {
  const deny = (reason) => ({ allowed: false, reason });
  try { validateGrant(grant); } catch (error) { return deny(`invalid_grant:${error.code ?? 'unknown'}`); }
  if (grant.schema_version !== GRANT_SCHEMA) return deny('schema_mismatch');
  if (grant.policyRevision !== policyRevision) return deny('policy_revision_mismatch');
  const expires = Date.parse(grant.expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime()) return deny('expired');
  if (typeof action !== 'string' || !grant.actions.includes(action)) return deny('action_not_granted');
  const target = safeResource(resource);
  if (!target) return deny('invalid_resource');
  if (!grant.resources.some((allowed) => resourceAllowed(target, allowed))) return deny('resource_out_of_scope');
  const minimum = STAGE_MIN[action];
  if (minimum === undefined || grant.autonomyStage < minimum) return deny('autonomy_stage_insufficient');
  if (correlationId && String(correlationId) !== grant.correlationId) return deny('correlation_mismatch');
  if (ELEVATED.has(action) && (!grant.approvalRequired || approved !== true)) return deny('approval_required');
  return { allowed: true, reason: 'granted' };
}

export function assertCapability(grant, context) {
  const decision = checkCapability(grant, context);
  if (!decision.allowed) throw new CapabilityDenied(decision.reason);
  return decision;
}

export function createAuditor() {
  const events = [];
  return {
    record(decision, meta = {}) {
      events.push({
        at: new Date().toISOString(),
        action: redact(meta.action ?? 'unknown').slice(0, 80),
        resource: redact(meta.resource ?? 'unknown').slice(0, 160),
        allowed: Boolean(decision.allowed),
        reason: redact(decision.reason).slice(0, 120),
        correlationId: redact(meta.correlationId ?? '').slice(0, 96),
      });
      if (events.length > MAX_AUDIT) events.shift();
      return decision;
    },
    list() { return events.map((event) => ({ ...event })); },
  };
}
