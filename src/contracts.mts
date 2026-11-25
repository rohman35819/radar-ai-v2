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

export interface RadarAsset {
  asset_id: string;
  asset_kind: 'token' | 'coin' | 'contract' | 'pool' | 'pair' | 'index' | 'other';
  symbol: string;
  name: string;
  chain?: string | null;
  contract_address?: string | null;
  decimals?: number | null;
  provider_ids?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface RadarCandle {
  asset_id: string;
  symbol: string;
  interval_code: string;
  bucket_at: string;
  source: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  trades?: number | null;
  source_updated_at?: string | null;
  observed_at: string;
  ingestion_run_id?: string | null;
}

export interface MarketObservation {
  source: string;
  entity_type: string;
  entity_id: string;
  observed_at: string;
  source_updated_at?: string | null;
  schema_version?: number;
  payload: Record<string, unknown>;
  payload_hash: string;
  ingestion_run_id?: string | null;
}

export interface IngestionRun {
  run_id: string;
  source: string;
  stream: string;
  status: 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';
  started_at: string;
  completed_at?: string | null;
  records_received?: number;
  records_inserted?: number;
  records_updated?: number;
  records_rejected?: number;
  error_code?: string | null;
  metadata?: Record<string, unknown>;
}

export interface IngestionCheckpoint {
  source: string;
  stream: string;
  cursor?: Record<string, unknown>;
  status: 'idle' | 'running' | 'succeeded' | 'partial' | 'failed' | 'paused';
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  next_run_at?: string | null;
  consecutive_failures?: number;
  last_error_code?: string | null;
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

const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));

const isStringRecord = (value: unknown): value is Record<string, unknown> =>
  isRecord(value);

const isNonEmptyString = (value: unknown, max = 160): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

export function isRadarAsset(value: unknown): value is RadarAsset {
  if (!isRecord(value)) return false;
  const kinds = ['token', 'coin', 'contract', 'pool', 'pair', 'index', 'other'];
  if (!isNonEmptyString(value.asset_id, 128) || !kinds.includes(String(value.asset_kind))) return false;
  if (!isNonEmptyString(value.symbol, 32) || !isNonEmptyString(value.name)) return false;
  if (!isOptionalString(value.chain) || !isOptionalString(value.contract_address)) return false;
  if ((value.chain == null) !== (value.contract_address == null)) return false;
  if (value.decimals !== undefined && value.decimals !== null &&
      (!Number.isInteger(value.decimals) || Number(value.decimals) < 0 || Number(value.decimals) > 36)) return false;
  if (value.provider_ids !== undefined && !isStringRecord(value.provider_ids)) return false;
  if (value.metadata !== undefined && !isStringRecord(value.metadata)) return false;
  return true;
}

export function isRadarCandle(value: unknown): value is RadarCandle {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.asset_id, 128) || !isNonEmptyString(value.symbol, 48) ||
      typeof value.interval_code !== 'string' || !/^[1-9][0-9]*[smhdw]$/.test(value.interval_code) ||
      !isIsoTimestamp(value.bucket_at) || !isNonEmptyString(value.source, 80) ||
      !isIsoTimestamp(value.observed_at)) return false;
  for (const field of ['open', 'high', 'low', 'close']) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]) || Number(value[field]) <= 0) return false;
  }
  if (Number(value.high) < Math.max(Number(value.open), Number(value.close), Number(value.low))) return false;
  if (Number(value.low) > Math.min(Number(value.open), Number(value.close), Number(value.high))) return false;
  if (value.volume !== undefined && (typeof value.volume !== 'number' || !Number.isFinite(value.volume) || value.volume < 0)) return false;
  if (value.trades !== undefined && value.trades !== null && (!Number.isInteger(value.trades) || Number(value.trades) < 0)) return false;
  if (!isOptionalString(value.source_updated_at) || !isOptionalString(value.ingestion_run_id)) return false;
  return true;
}

export function isMarketObservation(value: unknown): value is MarketObservation {
  return isRecord(value) && isNonEmptyString(value.source, 80) &&
    isNonEmptyString(value.entity_type, 48) && isNonEmptyString(value.entity_id) &&
    isIsoTimestamp(value.observed_at) && isOptionalString(value.source_updated_at) &&
    (value.schema_version === undefined || (Number.isInteger(value.schema_version) && Number(value.schema_version) >= 1 && Number(value.schema_version) <= 100)) &&
    isRecord(value.payload) && typeof value.payload_hash === 'string' && /^[a-f0-9]{64}$/.test(value.payload_hash) &&
    isOptionalString(value.ingestion_run_id);
}

export function isIngestionRun(value: unknown): value is IngestionRun {
  if (!isRecord(value)) return false;
  const statuses = ['running', 'succeeded', 'partial', 'failed', 'cancelled'];
  return isNonEmptyString(value.run_id, 64) && isNonEmptyString(value.source, 80) &&
    isNonEmptyString(value.stream, 80) && statuses.includes(String(value.status)) &&
    isIsoTimestamp(value.started_at) && isOptionalString(value.completed_at) &&
    ['records_received', 'records_inserted', 'records_updated', 'records_rejected'].every(key =>
      value[key] === undefined || (Number.isInteger(value[key]) && Number(value[key]) >= 0)) &&
    isOptionalString(value.error_code) &&
    (value.metadata === undefined || isRecord(value.metadata));
}

export function isIngestionCheckpoint(value: unknown): value is IngestionCheckpoint {
  if (!isRecord(value)) return false;
  const statuses = ['idle', 'running', 'succeeded', 'partial', 'failed', 'paused'];
  return isNonEmptyString(value.source, 80) && isNonEmptyString(value.stream, 80) &&
    statuses.includes(String(value.status)) &&
    (value.cursor === undefined || isRecord(value.cursor)) &&
    isOptionalString(value.last_attempt_at) && isOptionalString(value.last_success_at) &&
    isOptionalString(value.next_run_at) &&
    (value.consecutive_failures === undefined || (Number.isInteger(value.consecutive_failures) && Number(value.consecutive_failures) >= 0)) &&
    isOptionalString(value.last_error_code);
}

export function isRadarSnapshot(value: unknown): value is RadarSnapshot {
  if (!isRecord(value) || value.status !== 'success' || !Array.isArray(value.tokens)) return false;
  if (!value.tokens.every(isRadarToken)) return false;
  if (value.server_time !== undefined && typeof value.server_time !== 'string') return false;
  if (!isOptionalString(value.last_ok)) return false;
  if (value.stale !== undefined && typeof value.stale !== 'boolean') return false;
  return true;
}
