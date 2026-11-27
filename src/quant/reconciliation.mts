/**
 * Design-only reconciliation comparison for shadow readiness.
 * Pure comparison of expected vs observed fill records. It does not own a
 * ledger, does not submit orders, and is NOT an active paper trading system.
 */

export interface FillRecord {
  readonly id: string;
  readonly symbol: string;
  readonly side: 'enter' | 'exit';
  readonly price: number;
  readonly quantity: number;
}

export interface ReconciliationResult {
  readonly matched: readonly string[];
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
  readonly mismatched: readonly { id: string; fields: readonly string[] }[];
  readonly errors: readonly string[];
  readonly balanced: boolean;
  readonly note: string;
}

function validFill(value: unknown): value is FillRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && /^[A-Za-z0-9._:-]{1,96}$/.test(row.id)
    && typeof row.symbol === 'string' && row.symbol.length > 0 && row.symbol.length <= 40
    && (row.side === 'enter' || row.side === 'exit')
    && typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0
    && typeof row.quantity === 'number' && Number.isFinite(row.quantity) && row.quantity > 0;
}

/** Bounded, deterministic comparison; never mutates its inputs. */
export function reconcileFills(
  expected: readonly unknown[],
  observed: readonly unknown[],
): ReconciliationResult {
  const errors: string[] = [];
  if (!Array.isArray(expected) || !Array.isArray(observed)) {
    return { matched: [], missing: [], unexpected: [], mismatched: [], errors: ['INVALID_INPUT'],
      balanced: false, note: 'Design-only comparison; not an active paper ledger.' };
  }
  if (expected.length > 200 || observed.length > 200) {
    return { matched: [], missing: [], unexpected: [], mismatched: [], errors: ['BOUNDED_INPUT'],
      balanced: false, note: 'Design-only comparison; not an active paper ledger.' };
  }
  if (!expected.every(validFill) || !observed.every(validFill)) {
    return { matched: [], missing: [], unexpected: [], mismatched: [], errors: ['INVALID_FILL'],
      balanced: false, note: 'Design-only comparison; not an active paper ledger.' };
  }
  const expectedById = new Map((expected as FillRecord[]).map((fill) => [fill.id, fill]));
  const observedById = new Map((observed as FillRecord[]).map((fill) => [fill.id, fill]));
  const matched: string[] = [];
  const missing: string[] = [];
  const mismatched: { id: string; fields: string[] }[] = [];
  for (const [id, wanted] of expectedById) {
    const actual = observedById.get(id);
    if (!actual) { missing.push(id); continue; }
    const fields: string[] = [];
    if (actual.symbol !== wanted.symbol) fields.push('symbol');
    if (actual.side !== wanted.side) fields.push('side');
    if (actual.price !== wanted.price) fields.push('price');
    if (actual.quantity !== wanted.quantity) fields.push('quantity');
    if (fields.length > 0) mismatched.push({ id, fields });
    else matched.push(id);
  }
  const unexpected = [...observedById.keys()].filter((id) => !expectedById.has(id));
  const balanced = missing.length === 0 && unexpected.length === 0 && mismatched.length === 0;
  return {
    matched: matched.sort(),
    missing: missing.sort(),
    unexpected: unexpected.sort(),
    mismatched,
    errors,
    balanced,
    note: 'Design-only comparison; not an active paper ledger.',
  };
}
