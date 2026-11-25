/**
 * TypeScript boundary contracts for the existing RADAR snapshot API.
 *
 * These contracts are the first typed boundary for the incremental TypeScript migration.
 * Production JavaScript remains unchanged until each module has parity tests and a
 * reviewed deployment path. Runtime guards validate untrusted provider/API JSON.
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

export interface RadarCandle {
  timestamp: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close: number;
  volume?: number | null;
  source: string;
  symbol: string;
  interval: string;
  observed_at: string;
}

export interface MarketObservation {
  source: string;
  entity_id: string;
  observed_at: string;
  source_updated_at?: string | null;
  payload: Record<string, unknown>;
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

export function isRadarCandle(value: unknown): value is RadarCandle {
  if (!isRecord(value)) return false;
  if (typeof value.timestamp !== 'string' || typeof value.source !== 'string' ||
      typeof value.symbol !== 'string' || typeof value.interval !== 'string' ||
      typeof value.observed_at !== 'string') return false;
  if (typeof value.close !== 'number' || !Number.isFinite(value.close) || value.close <= 0) return false;
  for (const field of ['open', 'high', 'low', 'volume']) {
    if (!isOptionalFiniteNumber(value[field])) return false;
    if (typeof value[field] === 'number' && (value[field] as number) < 0) return false;
  }
  return true;
}

export function isMarketObservation(value: unknown): value is MarketObservation {
  return isRecord(value) && typeof value.source === 'string' && value.source.length > 0 &&
    typeof value.entity_id === 'string' && value.entity_id.length > 0 &&
    typeof value.observed_at === 'string' && isOptionalString(value.source_updated_at) &&
    isRecord(value.payload);
}

export function isRadarSnapshot(value: unknown): value is RadarSnapshot {
  if (!isRecord(value) || value.status !== 'success' || !Array.isArray(value.tokens)) return false;
  if (!value.tokens.every(isRadarToken)) return false;
  if (value.server_time !== undefined && typeof value.server_time !== 'string') return false;
  if (!isOptionalString(value.last_ok)) return false;
  if (value.stale !== undefined && typeof value.stale !== 'boolean') return false;
  return true;
}
