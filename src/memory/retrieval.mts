/**
 * Divisi 07 foundation — scope-first memory retrieval helper.
 *
 * Pure filtering/ranking over records shaped like public.radar_memory_records.
 * No database call, no service-role key, no network. Identity/scope filtering
 * happens BEFORE ranking; secrets are never read from records here.
 */

export type MemoryScopeType = 'project' | 'division' | 'agent' | 'task';
export type MemorySensitivity = 'public' | 'internal' | 'confidential';

export interface MemoryScope {
  readonly type: MemoryScopeType;
  readonly id: string;
}

export interface MemoryRecordLike {
  readonly memory_key: string;
  readonly scope_type: string;
  readonly scope_id: string;
  readonly sensitivity: string;
  readonly status: string;
  readonly valid_from: string | null;
  readonly valid_until: string | null;
  readonly retention_until: string;
  readonly created_at: string;
  readonly source_ref: string;
  readonly source_revision: string;
}

const SCOPE_TYPES: ReadonlySet<string> = new Set(['project', 'division', 'agent', 'task']);
const SENSITIVITIES: ReadonlySet<string> = new Set(['public', 'internal', 'confidential']);

function validTime(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isMemoryScope(value: unknown): value is MemoryScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.type === 'string' && SCOPE_TYPES.has(obj.type)
    && typeof obj.id === 'string' && obj.id.length >= 1 && obj.id.length <= 96;
}

export function isMemoryRecordLike(value: unknown): value is MemoryRecordLike {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.memory_key === 'string' && obj.memory_key.length >= 1 && obj.memory_key.length <= 128
    && typeof obj.scope_type === 'string' && SCOPE_TYPES.has(obj.scope_type)
    && typeof obj.scope_id === 'string' && obj.scope_id.length >= 1 && obj.scope_id.length <= 96
    && typeof obj.sensitivity === 'string' && SENSITIVITIES.has(obj.sensitivity)
    && typeof obj.status === 'string' && obj.status.length >= 1 && obj.status.length <= 32
    && validTime(obj.retention_until) !== null
    && validTime(obj.created_at) !== null
    && (obj.valid_from === null || validTime(obj.valid_from) !== null)
    && (obj.valid_until === null || validTime(obj.valid_until) !== null)
    && typeof obj.source_ref === 'string' && obj.source_ref.length >= 1 && obj.source_ref.length <= 512
    && typeof obj.source_revision === 'string' && obj.source_revision.length >= 1 && obj.source_revision.length <= 128;
}

/** Scope + sensitivity + validity checks must pass before a record is visible. */
export function isMemoryVisible(
  record: MemoryRecordLike | null | undefined,
  scope: MemoryScope,
  allowed: readonly MemorySensitivity[],
  now: string,
): boolean {
  if (!record || !isMemoryRecordLike(record) || !isMemoryScope(scope)) return false;
  if (record.scope_type !== scope.type || record.scope_id !== scope.id) return false;
  if (!allowed.includes(record.sensitivity as MemorySensitivity)) return false;
  if (record.status !== 'approved') return false;
  const nowMs = validTime(now);
  const retention = validTime(record.retention_until);
  if (nowMs === null || retention === null || retention <= nowMs) return false;
  if (record.valid_from !== null) {
    const from = validTime(record.valid_from);
    if (from === null || from > nowMs) return false;
  }
  if (record.valid_until !== null) {
    const until = validTime(record.valid_until);
    if (until === null || until <= nowMs) return false;
  }
  return true;
}

/** Approved/current records first, newest first. Provenance is preserved, not rewritten. */
export function rankVisibleMemory(
  records: readonly MemoryRecordLike[],
  scope: MemoryScope,
  allowed: readonly MemorySensitivity[],
  now: string,
): MemoryRecordLike[] {
  if (!Array.isArray(records)) return [];
  return records.filter((record) => isMemoryVisible(record, scope, allowed, now))
    .sort((a, b) => {
      const aTime = validTime(a.created_at) ?? 0;
      const bTime = validTime(b.created_at) ?? 0;
      return bTime - aTime || a.memory_key.localeCompare(b.memory_key);
    });
}
