/**
 * Deterministic, append-only-in-memory audit helper for shadow readiness.
 * No persistence, no transport, no secrets. Idempotent by content-derived id.
 */

export interface AuditEventInput {
  readonly timestamp: string;
  readonly actor: string;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly correlation_id: string;
  readonly detail: string;
}

export interface AuditEvent extends AuditEventInput {
  readonly event_id: string;
}

const ACTIONS: ReadonlySet<string> = new Set([
  'signal.received', 'signal.rejected', 'risk.approved', 'risk.denied',
  'fill.simulated', 'reconciliation.checked', 'kill_switch.engaged',
]);
const ID_RE = /^[A-Za-z0-9._:-]{1,96}$/;
const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/+=._-]{12,})/i;

function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** FNV-1a: stable content id without Node crypto or external dependency. */
export function auditEventId(input: AuditEventInput): string {
  const canonical = [input.timestamp, input.actor, input.action, input.entity_type,
    input.entity_id, input.correlation_id, input.detail].join('\u001f');
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Returns a new ledger; invalid or duplicate events leave it unchanged. */
export function appendAuditEvent(
  ledger: readonly AuditEvent[],
  input: AuditEventInput | null | undefined,
  maxEntries = 1000,
): readonly AuditEvent[] {
  if (!Array.isArray(ledger) || maxEntries < 1 || maxEntries > 10000
    || !input || typeof input !== 'object') return ledger;
  if (!bounded(input.timestamp, 40) || Number.isNaN(Date.parse(input.timestamp))) return ledger;
  if (!bounded(input.actor, 96) || !ID_RE.test(input.actor)) return ledger;
  if (!bounded(input.action, 64) || !ACTIONS.has(input.action)) return ledger;
  if (!bounded(input.entity_type, 32) || !ID_RE.test(input.entity_type)) return ledger;
  if (!bounded(input.entity_id, 96) || !ID_RE.test(input.entity_id)) return ledger;
  if (!bounded(input.correlation_id, 128) || !ID_RE.test(input.correlation_id)) return ledger;
  if (!bounded(input.detail, 500)) return ledger;
  if (SECRET_RE.test([input.actor, input.action, input.entity_id, input.detail].join('\n'))) return ledger;
  const event_id = auditEventId(input);
  if (ledger.some((event) => event.event_id === event_id)) return ledger;
  if (ledger.length >= maxEntries) return ledger;
  return [...ledger, {
    timestamp: input.timestamp,
    actor: input.actor,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    correlation_id: input.correlation_id,
    detail: input.detail.replace(/[\r\n]+/g, ' '),
    event_id,
  }];
}
