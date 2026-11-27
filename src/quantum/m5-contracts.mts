/**
 * Typed boundary contract for the M5 quantum engine.
 * Pure validation/serialization helpers only: no network, no orders, no secrets.
 * Python produces JSON; TypeScript validates it before any downstream use.
 */

export const M5_SCHEMA = 'quantum-m5.v1' as const;
export const M5_TIMEFRAME = '5m' as const;
export const INSTRUMENTS = ['SPOT', 'FUTURES'] as const;
export const STRATEGIES = ['SCALP', 'MOMENTUM', 'HOLD', 'NO_TRADE'] as const;
export const EXECUTION_STATUSES = ['PENDING', 'FILLED', 'REJECTED', 'EXPIRED', 'CANCELLED'] as const;

export type InstrumentType = (typeof INSTRUMENTS)[number];
export type StrategyName = (typeof STRATEGIES)[number];
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
export type TargetPosition = -1 | 0 | 1;

export interface M5Provenance {
  readonly schema_version: typeof M5_SCHEMA;
  readonly source: string;
  readonly symbol: string;
  readonly interval: typeof M5_TIMEFRAME;
  readonly retrieved_at: string;
  readonly data_kind: 'public_api';
  readonly start: string;
  readonly end: string;
  readonly rows: number;
  readonly checksum_sha256: string;
}

export interface M5Candle {
  readonly timestamp: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export interface M5MarketData {
  readonly schema_version: typeof M5_SCHEMA;
  readonly instrument: InstrumentType;
  readonly provenance: M5Provenance;
  readonly candles: readonly M5Candle[];
}

export interface M5StrategySignal {
  readonly schema_version: typeof M5_SCHEMA;
  readonly signal_id: string;
  readonly symbol: string;
  readonly timeframe: typeof M5_TIMEFRAME;
  readonly instrument: InstrumentType;
  readonly bar_index: number;
  readonly timestamp: string;
  readonly target: TargetPosition;
  readonly strategy: StrategyName;
  readonly stop_pct: number;
  readonly take_profit_pct: number;
  readonly expires_at: number;
  readonly confidence: number;
  readonly provenance_ref: string;
}

export interface EntryExitPlan {
  readonly schema_version: typeof M5_SCHEMA;
  readonly signal_id: string;
  readonly entry_price: number;
  readonly stop_loss: number;
  readonly take_profit: number;
  readonly position_fraction: number;
  readonly instrument: InstrumentType;
}

export interface RiskAssessment {
  readonly schema_version: typeof M5_SCHEMA;
  readonly signal_id: string;
  readonly approved: boolean;
  readonly reasons: readonly string[];
  readonly max_drawdown_pct: number;
  readonly daily_loss_pct: number;
  readonly kill_switch: boolean;
  readonly leverage: number;
}

export interface SignalExecution {
  readonly schema_version: typeof M5_SCHEMA;
  readonly signal_id: string;
  readonly status: ExecutionStatus;
  readonly idempotency_key: string;
  readonly audited_at: string;
  readonly correlation_id: string;
}

export interface M5AuditEvent {
  readonly event_id: string;
  readonly occurred_at: string;
  readonly actor: string;
  readonly action: string;
  readonly entity_id: string;
  readonly outcome: 'allowed' | 'denied' | 'success' | 'failure';
  readonly correlation_id: string;
}

export class M5ContractError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'M5ContractError';
    this.code = code;
  }
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ID_RE = /^[A-Za-z0-9._:-]{1,96}$/;
const SYMBOL_RE = /^[A-Z][A-Z0-9]{3,19}$/;
const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/+=._-]{12,})/i;

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function iso(value: unknown): value is string {
  return typeof value === 'string' && ISO_RE.test(value) && !Number.isNaN(Date.parse(value));
}

export function isInstrument(value: unknown): value is InstrumentType {
  return typeof value === 'string' && (INSTRUMENTS as readonly string[]).includes(value);
}

export function isStrategy(value: unknown): value is StrategyName {
  return typeof value === 'string' && (STRATEGIES as readonly string[]).includes(value);
}

export function validateProvenance(input: unknown): M5Provenance {
  if (!input || typeof input !== 'object') throw new M5ContractError('INVALID_PROVENANCE', 'provenance bukan objek');
  const value = input as Record<string, unknown>;
  if (value.schema_version !== M5_SCHEMA) throw new M5ContractError('BAD_SCHEMA', 'schema_version tidak dikenal');
  if (value.interval !== M5_TIMEFRAME) throw new M5ContractError('BAD_TIMEFRAME', 'hanya M5 yang didukung');
  if (typeof value.source !== 'string' || !/^https:\/\//.test(value.source)) throw new M5ContractError('BAD_SOURCE', 'source wajib HTTPS');
  if (typeof value.symbol !== 'string' || !SYMBOL_RE.test(value.symbol)) throw new M5ContractError('BAD_SYMBOL', 'symbol tidak valid');
  if (!iso(value.retrieved_at) || !iso(value.start) || !iso(value.end)) throw new M5ContractError('BAD_TIMESTAMP', 'timestamp provenance tidak valid');
  if (!finite(value.rows, 3, 1_000_000)) throw new M5ContractError('BAD_ROWS', 'rows di luar batas');
  if (typeof value.checksum_sha256 !== 'string' || !SHA256_RE.test(value.checksum_sha256)) throw new M5ContractError('BAD_CHECKSUM', 'checksum bukan SHA-256');
  if (value.data_kind !== 'public_api') throw new M5ContractError('BAD_DATA_KIND', 'data_kind wajib public_api');
  return value as unknown as M5Provenance;
}

export function validateCandle(input: unknown): M5Candle {
  if (!input || typeof input !== 'object') throw new M5ContractError('INVALID_CANDLE', 'candle bukan objek');
  const value = input as Record<string, unknown>;
  if (!iso(value.timestamp)) throw new M5ContractError('BAD_CANDLE_TIME', 'timestamp candle tidak valid');
  if (!finite(value.open, 1e-12, 1e12) || !finite(value.high, 1e-12, 1e12)
    || !finite(value.low, 1e-12, 1e12) || !finite(value.close, 1e-12, 1e12)
    || !finite(value.volume, 0, 1e15)) {
    throw new M5ContractError('BAD_CANDLE_VALUE', 'OHLCV di luar batas');
  }
  const high = value.high as number;
  const low = value.low as number;
  if (high < Math.max(value.open as number, value.close as number, low)) {
    throw new M5ContractError('BAD_CANDLE_HIGH', 'high lebih kecil dari OHLC');
  }
  if (low > Math.min(value.open as number, value.close as number, high)) {
    throw new M5ContractError('BAD_CANDLE_LOW', 'low lebih besar dari OHLC');
  }
  return value as unknown as M5Candle;
}

export function validateSignal(input: unknown, provenanceRef: string): M5StrategySignal {
  if (!input || typeof input !== 'object') throw new M5ContractError('INVALID_SIGNAL', 'signal bukan objek');
  const value = input as Record<string, unknown>;
  if (value.schema_version !== M5_SCHEMA) throw new M5ContractError('BAD_SCHEMA', 'schema_version tidak dikenal');
  if (!isInstrument(value.instrument)) throw new M5ContractError('BAD_INSTRUMENT', 'instrument tidak dikenal');
  if (!isStrategy(value.strategy)) throw new M5ContractError('BAD_STRATEGY', 'strategi tidak dikenal');
  if (value.timeframe !== M5_TIMEFRAME) throw new M5ContractError('BAD_TIMEFRAME', 'hanya M5 yang didukung');
  if (typeof value.signal_id !== 'string' || !ID_RE.test(value.signal_id)) throw new M5ContractError('BAD_ID', 'signal_id tidak valid');
  if (typeof value.symbol !== 'string' || !SYMBOL_RE.test(value.symbol)) throw new M5ContractError('BAD_SYMBOL', 'symbol tidak valid');
  if (!iso(value.timestamp)) throw new M5ContractError('BAD_TIMESTAMP', 'timestamp tidak valid');
  if (!finite(value.target, -1, 1) || !Number.isInteger(value.target)) throw new M5ContractError('BAD_TARGET', 'target harus -1/0/1');
  if (!finite(value.bar_index, 0, 1_000_000_000) || !Number.isInteger(value.bar_index)) throw new M5ContractError('BAD_INDEX', 'bar_index tidak valid');
  if (!finite(value.expires_at, 0, 1_000_000_000) || (value.expires_at as number) <= (value.bar_index as number)) {
    throw new M5ContractError('BAD_EXPIRY', 'expires_at harus setelah bar_index');
  }
  if (!finite(value.stop_pct, 0.001, 0.1) || !finite(value.take_profit_pct, 0.001, 0.5)) {
    throw new M5ContractError('BAD_RISK_PARAMS', 'stop/take profit di luar batas');
  }
  if (!finite(value.confidence, 0, 1)) throw new M5ContractError('BAD_CONFIDENCE', 'confidence di luar batas');
  if (typeof value.provenance_ref !== 'string' || !SHA256_RE.test(value.provenance_ref)) {
    throw new M5ContractError('BAD_PROVENANCE_REF', 'provenance_ref bukan SHA-256');
  }
  if (value.provenance_ref !== provenanceRef) throw new M5ContractError('PROVENANCE_MISMATCH', 'provenance_ref tidak cocok');
  if (SECRET_RE.test(JSON.stringify(value))) throw new M5ContractError('SECRET_LIKE_VALUE', 'nilai menyerupai secret ditolak');
  return value as unknown as M5StrategySignal;
}

export function validateRisk(input: unknown): RiskAssessment {
  if (!input || typeof input !== 'object') throw new M5ContractError('INVALID_RISK', 'risk bukan objek');
  const value = input as Record<string, unknown>;
  if (value.schema_version !== M5_SCHEMA || typeof value.signal_id !== 'string' || !ID_RE.test(value.signal_id)) {
    throw new M5ContractError('BAD_RISK_ID', 'risk identity tidak valid');
  }
  if (typeof value.approved !== 'boolean' || !Array.isArray(value.reasons)
    || value.reasons.some((item) => typeof item !== 'string' || item.length > 64)) {
    throw new M5ContractError('BAD_RISK_DECISION', 'keputusan risiko tidak valid');
  }
  if (!finite(value.max_drawdown_pct, 0, 100) || !finite(value.daily_loss_pct, 0, 100)) {
    throw new M5ContractError('BAD_RISK_LIMIT', 'batas risiko di luar batas');
  }
  if (typeof value.kill_switch !== 'boolean' || value.leverage !== 1) {
    throw new M5ContractError('BAD_RISK_SAFETY', 'kill switch/leverage tidak valid');
  }
  return value as unknown as RiskAssessment;
}

export function idempotencyKey(signal: M5StrategySignal): string {
  return `${signal.signal_id}:${signal.bar_index}:${signal.target}:${signal.provenance_ref.slice(0, 16)}`;
}

export function buildAuditEvent(input: {
  readonly occurred_at: string;
  readonly actor: string;
  readonly action: string;
  readonly entity_id: string;
  readonly outcome: M5AuditEvent['outcome'];
  readonly correlation_id: string;
}): M5AuditEvent {
  if (!iso(input.occurred_at)) throw new M5ContractError('BAD_AUDIT_TIME', 'occurred_at tidak valid');
  if (!ID_RE.test(input.actor) || !ID_RE.test(input.entity_id) || !ID_RE.test(input.correlation_id)) {
    throw new M5ContractError('BAD_AUDIT_ID', 'audit id tidak valid');
  }
  if (!['task.enqueue', 'signal.validate', 'risk.check', 'shadow.signal'].includes(input.action)) {
    throw new M5ContractError('BAD_AUDIT_ACTION', 'audit action tidak dikenal');
  }
  if (SECRET_RE.test(JSON.stringify(input))) throw new M5ContractError('SECRET_LIKE_VALUE', 'audit mengandung nilai secret');
  return {
    event_id: `${input.correlation_id}:${input.action}:${input.entity_id}`,
    occurred_at: input.occurred_at,
    actor: input.actor,
    action: input.action,
    entity_id: input.entity_id,
    outcome: input.outcome,
    correlation_id: input.correlation_id,
  };
}

export function validateExecution(input: unknown): SignalExecution {
  if (!input || typeof input !== 'object') throw new M5ContractError('INVALID_EXECUTION', 'execution bukan objek');
  const value = input as Record<string, unknown>;
  if (value.schema_version !== M5_SCHEMA || typeof value.signal_id !== 'string' || !ID_RE.test(value.signal_id)) {
    throw new M5ContractError('BAD_EXECUTION_ID', 'execution identity tidak valid');
  }
  if (!isExecutionStatus(value.status)) throw new M5ContractError('BAD_STATUS', 'status tidak dikenal');
  if (typeof value.idempotency_key !== 'string' || value.idempotency_key.length < 8 || value.idempotency_key.length > 256) {
    throw new M5ContractError('BAD_IDEMPOTENCY', 'idempotency key tidak valid');
  }
  if (!iso(value.audited_at) || typeof value.correlation_id !== 'string' || !ID_RE.test(value.correlation_id)) {
    throw new M5ContractError('BAD_AUDIT_FIELDS', 'audit fields tidak valid');
  }
  return value as unknown as SignalExecution;
}

function isExecutionStatus(value: unknown): value is ExecutionStatus {
  return typeof value === 'string' && (EXECUTION_STATUSES as readonly string[]).includes(value);
}

export function validateEntryExit(input: unknown): EntryExitPlan {
  if (!input || typeof input !== 'object') throw new M5ContractError('INVALID_PLAN', 'plan bukan objek');
  const value = input as Record<string, unknown>;
  if (value.schema_version !== M5_SCHEMA || typeof value.signal_id !== 'string' || !ID_RE.test(value.signal_id)) {
    throw new M5ContractError('BAD_PLAN_ID', 'plan identity tidak valid');
  }
  if (!isInstrument(value.instrument)) throw new M5ContractError('BAD_INSTRUMENT', 'instrument tidak valid');
  if (!finite(value.entry_price, 1e-12, 1e12) || !finite(value.stop_loss, 1e-12, 1e12)
    || !finite(value.take_profit, 1e-12, 1e12) || !finite(value.position_fraction, 0, 1)) {
    throw new M5ContractError('BAD_PLAN_VALUES', 'nilai plan di luar batas');
  }
  return value as unknown as EntryExitPlan;
}

export const __all__ = [
  'M5_SCHEMA', 'M5_TIMEFRAME', 'INSTRUMENTS', 'STRATEGIES', 'EXECUTION_STATUSES',
  'M5ContractError', 'buildAuditEvent', 'idempotencyKey', 'isInstrument', 'isStrategy',
  'validateCandle', 'validateEntryExit', 'validateExecution', 'validateProvenance',
  'validateRisk', 'validateSignal',
] as const;
