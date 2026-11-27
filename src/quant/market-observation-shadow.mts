/**
 * Deterministic shadow consumer for `market-observation-input.v1`.
 *
 * Boundary test only: it proves a validated observation can be consumed by the
 * next research component without activating trading. It emits an OBSERVE_ONLY
 * receipt, never an order, fill, ledger entry, reconciliation result or profit
 * claim. No network, no gateway, no storage, no worker, no clock dependency
 * other than the injected `now`.
 */

import { hasValidMarketInputChecksum } from '../exchange/observation.mts';
import {
  isMarketObservationInputV1,
  RESEARCH_ALLOWED_SYMBOLS,
  type MarketObservationInputV1,
} from './market-observation-input.mts';

export type ShadowReceiptSchema = 'market-observation-shadow.v1';

export interface ShadowReceiptV1 {
  readonly schema_version: ShadowReceiptSchema;
  readonly kind: 'observation_receipt';
  readonly decision: 'OBSERVE_ONLY';
  readonly symbol: string;
  readonly source: string;
  readonly interval: string;
  readonly observed_at: string;
  readonly received_at: string;
  readonly accepted_at: string;
  readonly consumed_at: string;
  readonly provenance_ref: string;
  readonly checksum: string;
  readonly dedupe_key: string;
  readonly duplicate: false;
  readonly reasons: readonly string[];
  readonly fields_consumed: readonly string[];
  readonly limitations: readonly string[];
}

export interface ShadowOptions {
  readonly now: string;
  readonly seen?: readonly string[];
  readonly maxAgeMs?: number;
}

export class ShadowInputError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'ShadowInputError';
    this.code = code;
  }
}

const HEX64 = /^[a-f0-9]{64}$/;
const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token|private[_-]?key)\s*[:=]?\s*["']?[A-Za-z0-9/+=._-]{12,}|(?:secret|password|token|private[_-]?key)[-_][A-Za-z0-9_-]{4,})/i;
const PRIVATE_FRAGMENTS: readonly string[] = ['balance', 'position', 'account', 'withdraw',
  'transfer', 'order', 'leverage', 'margin', 'secret', 'token', 'password', 'apikey', 'authorization', 'signature'];
const SAFE_FIELDS: readonly string[] = ['last_price', 'change_pct', 'high_24h', 'low_24h', 'quote_volume_24h'];

function forbiddenKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return PRIVATE_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function iso(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return false;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

/** Stable replay key derived only from immutable provenance fields. */
export function shadowDedupeKey(input: MarketObservationInputV1): string {
  return [input.provenance_ref, input.observed_at, input.checksum].join(':');
}

/** One entry point. Throws ShadowInputError with a stable code on rejection. */
export function consumeShadowObservation(input: unknown, options: ShadowOptions): ShadowReceiptV1 {
  if (!options || !iso(options.now)) throw new ShadowInputError('INVALID_NOW');
  const maxAgeMs = options.maxAgeMs === undefined ? 300000 : options.maxAgeMs;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0 || maxAgeMs > 86400000) throw new ShadowInputError('INVALID_AGE_LIMIT');

  // Explicit pre-checks produce stable codes before the generic schema guard.
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ShadowInputError('SCHEMA_INVALID');
  const raw = input as Record<string, unknown>;
  if (raw.schema_version !== 'market-observation-input.v1') throw new ShadowInputError('SCHEMA_VERSION_INVALID');
  if (raw.kind !== 'market_ticker' || raw.is_ohlcv !== false) throw new ShadowInputError('NOT_TICKER_OBSERVATION');
  if (typeof raw.symbol !== 'string' || !RESEARCH_ALLOWED_SYMBOLS.includes(raw.symbol)) {
    throw new ShadowInputError('SYMBOL_NOT_ALLOWED');
  }
  if (raw.freshness !== 'fresh') throw new ShadowInputError('FRESHNESS_REJECTED');
  if (typeof raw.provenance_ref !== 'string' || !HEX64.test(raw.provenance_ref)
    || typeof raw.checksum !== 'string' || !HEX64.test(raw.checksum)
    || raw.provenance_ref !== raw.checksum) throw new ShadowInputError('PROVENANCE_INVALID');
  if (!hasValidMarketInputChecksum(raw)) throw new ShadowInputError('CHECKSUM_INVALID');
  if (!iso(raw.observed_at) || !iso(raw.received_at) || !iso(raw.accepted_at)) {
    throw new ShadowInputError('TIMESTAMP_MALFORMED');
  }

  const nowMs = Date.parse(options.now);
  const observedMs = Date.parse(raw.observed_at);
  const receivedMs = Date.parse(raw.received_at);
  const acceptedMs = Date.parse(raw.accepted_at);
  if (observedMs > nowMs || receivedMs > nowMs || acceptedMs > nowMs) throw new ShadowInputError('FUTURE_TIMESTAMP');
  if (receivedMs < observedMs || acceptedMs < receivedMs) throw new ShadowInputError('TIMESTAMP_ORDER');
  if (nowMs - observedMs > maxAgeMs) throw new ShadowInputError('STALE_OBSERVATION');

  const serialized = JSON.stringify(raw);
  if (!serialized || serialized.length > 8192) throw new ShadowInputError('PAYLOAD_INVALID');
  if (SECRET_RE.test(serialized)) throw new ShadowInputError('SECRET_REJECTED');
  if (!raw.payload || typeof raw.payload !== 'object' || Array.isArray(raw.payload)) {
    throw new ShadowInputError('PAYLOAD_INVALID');
  }
  const payload = raw.payload as Record<string, unknown>;
  for (const key of Object.keys(payload)) {
    if (forbiddenKey(key)) throw new ShadowInputError('PRIVATE_DATA_REJECTED');
  }
  // Adapter v1 emits normalized ticker fields at payload top level (with an
  // optional nested futures object); accept both that shape and a nested spot.
  const spot = payload.spot && typeof payload.spot === 'object' && !Array.isArray(payload.spot)
    ? payload.spot : payload;
  const spotRecord = spot as Record<string, unknown>;
  if (typeof spotRecord.last_price !== 'number' || !Number.isFinite(spotRecord.last_price) || spotRecord.last_price <= 0) {
    throw new ShadowInputError('INCOMPLETE_PAYLOAD');
  }
  if (!isMarketObservationInputV1(input)) throw new ShadowInputError('SCHEMA_INVALID');
  const observation = input as MarketObservationInputV1;
  if (observation.kind !== 'market_ticker' || observation.is_ohlcv !== false) throw new ShadowInputError('NOT_TICKER_OBSERVATION');

  const dedupeKey = shadowDedupeKey(observation);
  const seen = options.seen === undefined ? [] : options.seen;
  if (!Array.isArray(seen) || seen.length > 1000) throw new ShadowInputError('INVALID_SEEN_SET');
  if (seen.includes(dedupeKey)) throw new ShadowInputError('DUPLICATE_OBSERVATION');

  const consumedFields: string[] = [];
  for (const field of SAFE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(spotRecord, field)) consumedFields.push(field);
  }
  return Object.freeze({
    schema_version: 'market-observation-shadow.v1',
    kind: 'observation_receipt',
    decision: 'OBSERVE_ONLY',
    symbol: observation.symbol,
    source: observation.source,
    interval: observation.interval,
    observed_at: observation.observed_at,
    received_at: observation.received_at,
    accepted_at: observation.accepted_at,
    consumed_at: options.now,
    provenance_ref: observation.provenance_ref,
    checksum: observation.checksum,
    dedupe_key: dedupeKey,
    duplicate: false,
    reasons: Object.freeze(['OBSERVE_ONLY_NOT_A_TRADE_DECISION']),
    fields_consumed: Object.freeze(consumedFields),
    limitations: Object.freeze([
      'Receipt proves data consumption only; it is not a trade signal or paper fill.',
      '24h ticker is not OHLCV; no candle history is created.',
      'No ledger, reconciliation, order, transfer or withdrawal path exists.',
    ]),
  });
}
