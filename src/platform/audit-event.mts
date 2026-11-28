/**
 * Divisi 06/01 foundation — sanitized audit-event builder.
 *
 * Produces append-oriented event objects for agent lifecycle transitions.
 * Never accepts secrets, raw provider payloads or unbounded text. Pure module:
 * no transport, no storage, no side effect.
 */

export interface AuditEvent {
  readonly event_id: string;
  readonly occurred_at: string;
  readonly actor: string;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly outcome: 'success' | 'failure' | 'denied';
  readonly correlation_id: string;
  readonly detail: string;
}

const ACTIONS: ReadonlySet<string> = new Set([
  'task.enqueue', 'task.claim', 'task.heartbeat', 'task.complete', 'task.fail',
  'task.retry', 'approval.request', 'approval.resolve', 'platform.pause',
  'platform.kill_switch', 'memory.propose', 'memory.retrieve', 'risk.decision',
]);

const ENTITIES: ReadonlySet<string> = new Set(['task', 'agent', 'approval', 'memory', 'strategy', 'platform']);
const ID_RE = /^[A-Za-z0-9._:-]{1,96}$/;
const CORRELATION_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/+=._-]{12,})/i;

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) return null;
  return value;
}

/** Returns null for any invalid or secret-bearing input; never throws on untrusted data. */
export function buildAuditEvent(input: unknown): AuditEvent | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  const actor = boundedText(obj.actor, 96);
  const action = boundedText(obj.action, 64);
  const entityType = boundedText(obj.entity_type, 32);
  const entityId = boundedText(obj.entity_id, 96);
  const correlationId = boundedText(obj.correlation_id, 128);
  const detail = boundedText(obj.detail, 500);
  const occurredAt = boundedText(obj.occurred_at, 40);
  const eventId = boundedText(obj.event_id, 96);
  if (!actor || !action || !entityType || !entityId || !correlationId || !detail || !occurredAt || !eventId) return null;
  if (!ID_RE.test(actor) || !ID_RE.test(entityId) || !ID_RE.test(eventId)) return null;
  if (!CORRELATION_RE.test(correlationId)) return null;
  if (!ACTIONS.has(action) || !ENTITIES.has(entityType)) return null;
  const outcome = obj.outcome;
  if (outcome !== 'success' && outcome !== 'failure' && outcome !== 'denied') return null;
  if (Number.isNaN(Date.parse(occurredAt))) return null;
  const combined = [actor, action, entityType, entityId, detail].join('\n');
  if (SECRET_RE.test(combined)) return null;
  return {
    event_id: eventId,
    occurred_at: occurredAt,
    actor,
    action,
    entity_type: entityType,
    entity_id: entityId,
    outcome,
    correlation_id: correlationId,
    detail: detail.replace(/[\r\n]+/g, ' '),
  };
}
