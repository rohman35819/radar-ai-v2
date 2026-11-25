/**
 * TypeScript boundary contracts for the existing RADAR snapshot API.
 *
 * This is an additive pilot: production JavaScript remains unchanged.
 * Node's built-in type stripping executes the runtime guards without a
 * transpilation dependency; a full tsc migration is intentionally separate.
 */
export interface RadarToken {
  id: string;
  symbol: string;
  name: string;
  price?: number | null;
  market_cap?: number | null;
  volume_24h?: number | null;
  fdv?: number | null;
  change_24h?: number | null;
  liquidity_usd?: number | null;
  source_updated_at?: string | null;
  observed_at?: string | null;
  last_ok?: string | null;
  [field: string]: unknown;
}

export interface RadarSnapshot {
  status: 'success';
  server_time?: string;
  last_ok?: string | null;
  stale?: boolean;
  tokens: RadarToken[];
  [field: string]: unknown;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOptionalFiniteNumber = (value: unknown): boolean =>
  value === undefined || value === null ||
  (typeof value === 'number' && Number.isFinite(value));

const isOptionalString = (value: unknown): boolean =>
  value === undefined || value === null || typeof value === 'string';

/** Runtime validation at an untrusted JSON/API boundary. */
export function isRadarToken(value: unknown): value is RadarToken {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.symbol !== 'string' || typeof value.name !== 'string') return false;
  for (const field of ['price', 'market_cap', 'volume_24h', 'fdv', 'change_24h', 'liquidity_usd']) {
    if (!isOptionalFiniteNumber(value[field])) return false;
  }
  for (const field of ['source_updated_at', 'observed_at', 'last_ok']) {
    if (!isOptionalString(value[field])) return false;
  }
  return true;
}

export function isRadarSnapshot(value: unknown): value is RadarSnapshot {
  if (!isRecord(value) || value.status !== 'success' || !Array.isArray(value.tokens)) return false;
  if (!value.tokens.every(isRadarToken)) return false;
  if (value.server_time !== undefined && typeof value.server_time !== 'string') return false;
  if (!isOptionalString(value.last_ok)) return false;
  if (value.stale !== undefined && typeof value.stale !== 'boolean') return false;
  return true;
}
