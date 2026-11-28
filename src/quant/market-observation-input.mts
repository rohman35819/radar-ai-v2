/**
 * E3 — single, fail-closed boundary from public market observations into quant research.
 *
 * Accepts only validated `market-observation.v1` objects produced by the internal
 * ExchangeGateway. Emits a versioned `market-observation-input.v1` consumed by
 * Python research. No gateway reference, no private account data, no order path,
 * no OHLCV candle construction from a 24h ticker.
 */

import { hasValidObservationChecksum, isMarketObservationV1, observationChecksum, type MarketObservationV1 } from '../exchange/observation.mts';

export type QuantInputSchema = 'market-observation-input.v1';

export interface MarketObservationInputV1 {
  readonly schema_version: QuantInputSchema;
  readonly source: string;
  readonly symbol: string;
  readonly interval: string;
  readonly observed_at: string;
  readonly received_at: string;
  readonly accepted_at: string;
  readonly provenance_ref: string;
  readonly checksum: string;
  readonly kind: 'market_ticker';
  readonly is_ohlcv: false;
  readonly freshness: 'fresh';
  readonly payload: Record<string, unknown>;
  readonly limitations: readonly string[];
}

export interface QuantInputOptions {
  readonly now?: string;
  readonly maxAgeMs?: number;
}

export class QuantInputError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'QuantInputError';
    this.code = code;
  }
}

/**
 * Symbols actually admitted by the current research pipeline ( registries v1–v5 ).
 * SOL and other assets are excluded until an explicit liquidity/market-integrity
 * admission gate passes; gateway reachability is not admission.
 */
export const RESEARCH_ALLOWED_SYMBOLS: readonly string[] = Object.freeze(['BTCUSDT', 'ETHUSDT']);
const TICKER_INTERVALS: ReadonlySet<string> = new Set(['24h']);
const SOURCES: ReadonlySet<string> = new Set(['binance:ticker']);
const HEX64 = /^[a-f0-9]{64}$/;
const SYMBOL_RE = /^[A-Z0-9]{4,24}$/;
const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token|private[_-]?key)\s*[:=]?\s*["']?[A-Za-z0-9/+=._-]{12,}|(?:secret|password|token|private[_-]?key)[-_][A-Za-z0-9_-]{4,})/i;
const PRIVATE_FRAGMENTS: readonly string[] = ['balance', 'position', 'account', 'withdraw',
  'transfer', 'order', 'leverage', 'margin', 'secret', 'token', 'password', 'apikey', 'authorization', 'signature'];
const TICKER_FIELDS: readonly string[] = ['last_price', 'change_pct', 'high_24h', 'low_24h', 'quote_volume_24h'];

function forbiddenKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PRIVATE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function iso(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return false;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function checkPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new QuantInputError('SCHEMA_INVALID');
  }
  const source = payload as Record<string, unknown>;
  const serialized = JSON.stringify(source);
  if (serialized.length > 4096) throw new QuantInputError('SCHEMA_INVALID');
  if (SECRET_RE.test(serialized)) throw new QuantInputError('SECRET_REJECTED');
  for (const key of Object.keys(source)) {
    if (forbiddenKey(key)) throw new QuantInputError('PRIVATE_DATA_REJECTED');
  }
  for (const legName of ['spot', 'futures']) {
    const leg = source[legName];
    if (leg === null || leg === undefined) continue;
    if (!leg || typeof leg !== 'object' || Array.isArray(leg)) throw new QuantInputError('SCHEMA_INVALID');
    for (const key of Object.keys(leg as Record<string, unknown>)) {
      if (forbiddenKey(key)) throw new QuantInputError('PRIVATE_DATA_REJECTED');
    }
  }
  const spot = source.spot as Record<string, unknown> | null | undefined;
  if (!spot || typeof spot.last_price !== 'number' || !Number.isFinite(spot.last_price) || spot.last_price <= 0) {
    throw new QuantInputError('SCHEMA_INVALID');
  }
  const clean: Record<string, unknown> = {};
  for (const field of TICKER_FIELDS) {
    if (spot[field] !== undefined) clean[field] = spot[field];
  }
  const futures = source.futures as Record<string, unknown> | null | undefined;
  if (!futures || typeof futures !== 'object' || Array.isArray(futures)
    || typeof futures.last_price !== 'number' || !Number.isFinite(futures.last_price) || futures.last_price <= 0) {
    throw new QuantInputError('SCHEMA_INVALID');
  }
  const cleanFutures: Record<string, unknown> = {};
  for (const field of TICKER_FIELDS) {
    if (futures[field] !== undefined) cleanFutures[field] = futures[field];
  }
  clean.futures = cleanFutures;
  return clean;
}

/** One entry point. Throws QuantInputError with a stable code on every rejection. */
export function createQuantMarketInput(observation: unknown, options: QuantInputOptions = {}): MarketObservationInputV1 {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    throw new QuantInputError('SCHEMA_INVALID');
  }
  const raw = observation as Record<string, unknown>;
  if (raw.schema_version !== 'market-observation.v1') throw new QuantInputError('SCHEMA_INVALID');
  if (typeof raw.source !== 'string' || !SOURCES.has(raw.source)) throw new QuantInputError('SOURCE_NOT_ALLOWED');

  const pair = typeof raw.symbol === 'string' ? raw.symbol.trim().toUpperCase() : '';
  if (!SYMBOL_RE.test(pair)) throw new QuantInputError('SYMBOL_INVALID');
  // Fixed boundary: callers cannot extend or replace the official allowlist.
  if (!RESEARCH_ALLOWED_SYMBOLS.includes(pair)) throw new QuantInputError('SYMBOL_NOT_ALLOWED');

  if (typeof raw.interval !== 'string' || !TICKER_INTERVALS.has(raw.interval)) {
    throw new QuantInputError('INTERVAL_UNSUPPORTED');
  }
  if (!iso(raw.observed_at) || !iso(raw.received_at)) throw new QuantInputError('TIMESTAMP_MALFORMED');
  const now = options.now === undefined ? new Date().toISOString() : options.now;
  if (!iso(now)) throw new QuantInputError('TIMESTAMP_MALFORMED');
  const observedMs = Date.parse(raw.observed_at);
  const receivedMs = Date.parse(raw.received_at);
  const nowMs = Date.parse(now);
  if (observedMs > nowMs || receivedMs > nowMs) throw new QuantInputError('FUTURE_TIMESTAMP');
  if (receivedMs < observedMs) throw new QuantInputError('TIMESTAMP_ORDER');
  const maxAgeMs = options.maxAgeMs === undefined ? 300000 : options.maxAgeMs;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0 || maxAgeMs > 86400000) {
    throw new QuantInputError('INVALID_AGE_LIMIT');
  }
  if (nowMs - observedMs > maxAgeMs) throw new QuantInputError('STALE_OBSERVATION');

  if (raw.freshness === 'unknown') throw new QuantInputError('FRESHNESS_UNKNOWN');
  if (raw.freshness === 'stale') throw new QuantInputError('FRESHNESS_STALE');
  if (raw.freshness !== 'fresh') throw new QuantInputError('FRESHNESS_UNKNOWN');
  if (raw.is_complete !== true) throw new QuantInputError('INCOMPLETE_OBSERVATION');

  if (typeof raw.provenance_ref !== 'string' || !HEX64.test(raw.provenance_ref)) {
    throw new QuantInputError('PROVENANCE_INVALID');
  }
  if (typeof raw.checksum !== 'string' || !HEX64.test(raw.checksum)) throw new QuantInputError('CHECKSUM_INVALID');
  if (raw.provenance_ref !== raw.checksum) throw new QuantInputError('PROVENANCE_INVALID');
  if (!hasValidObservationChecksum(raw)) throw new QuantInputError('CHECKSUM_INVALID');

  const payload = checkPayload(raw.payload);
  // Normalization is applied consistently across gateway, TypeScript and Python.
  if (!isMarketObservationV1({ ...raw, symbol: pair })) throw new QuantInputError('SCHEMA_INVALID');

  type WritableInput = { -readonly [K in keyof MarketObservationInputV1]: MarketObservationInputV1[K] };
  const result: WritableInput = {
    schema_version: 'market-observation-input.v1',
    source: raw.source,
    symbol: pair,
    interval: raw.interval,
    observed_at: raw.observed_at,
    received_at: raw.received_at,
    accepted_at: now,
    provenance_ref: '',
    checksum: '',
    kind: 'market_ticker',
    is_ohlcv: false,
    freshness: 'fresh',
    payload,
    limitations: Object.freeze([
      '24h ticker statistics are NOT OHLCV candles; do not use for candle-based indicators.',
      'No private account data is part of this research input.',
      'Historical backtests are unchanged; this input is for live/shadow observation only.',
    ]),
  };
  // Re-sign the sanitized research input so downstream consumers can verify it.
  const { provenance_ref, checksum, ...unsigned } = result;
  void provenance_ref; void checksum;
  const signed = observationChecksum(unsigned);
  result.provenance_ref = signed;
  result.checksum = signed;
  return Object.freeze({ ...result, payload: Object.freeze(payload) });
}

export function isMarketObservationInputV1(value: unknown): value is MarketObservationInputV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return obj.schema_version === 'market-observation-input.v1'
    && obj.kind === 'market_ticker' && obj.is_ohlcv === false && obj.freshness === 'fresh'
    && typeof obj.symbol === 'string' && RESEARCH_ALLOWED_SYMBOLS.includes(obj.symbol)
    && iso(obj.observed_at) && iso(obj.received_at) && iso(obj.accepted_at)
    && typeof obj.provenance_ref === 'string' && HEX64.test(obj.provenance_ref)
    && obj.provenance_ref === obj.checksum
    && Boolean(obj.payload) && !Array.isArray(obj.payload);
}
