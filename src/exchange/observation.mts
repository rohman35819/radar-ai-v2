/**
 * Versioned public market observation contract for the Quantum exchange gateway.
 *
 * Internal, server-side only. Private account data is NOT part of this
 * contract and must never enter research fixtures or artifacts.
 * Runtime guards reject malformed, stale, incomplete or secret-bearing values.
 */

import { createHash } from 'node:crypto';

export type ObservationSchema = 'market-observation.v1';
export type Freshness = 'fresh' | 'stale' | 'unknown';

export interface MarketObservationV1 {
  readonly schema_version: ObservationSchema;
  readonly source: string;
  readonly symbol: string;
  readonly interval: string;
  readonly observed_at: string;
  readonly received_at: string;
  readonly is_complete: boolean;
  readonly freshness: Freshness;
  readonly provenance_ref: string;
  readonly checksum: string;
  readonly payload: Record<string, unknown>;
}

const INTERVALS: ReadonlySet<string> = new Set(['1m', '5m', '15m', '1h', '4h', '1d', '24h']);
const SOURCES: ReadonlySet<string> = new Set(['binance:ticker']);
const FRESHNESS: ReadonlySet<string> = new Set(['fresh', 'stale', 'unknown']);
const HEX64 = /^[a-f0-9]{64}$/;
const SYMBOL_RE = /^[A-Z0-9]{4,24}$/;
const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token|private[_-]?key)\s*[:=]?\s*["']?[A-Za-z0-9/+=._-]{12,}|(?:secret|password|token|private[_-]?key)[-_][A-Za-z0-9_-]{4,})/i;
const FORBIDDEN_FRAGMENTS: readonly string[] = [
  'secret', 'password', 'token', 'apikey', 'authorization', 'signature',
  'balance', 'position', 'withdraw', 'transfer', 'order', 'leverage', 'margin',
];

function forbiddenKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return FORBIDDEN_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return false;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function safePayloadValue(value: unknown, depth: number): boolean {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return true;
  if (depth > 2) return false;
  if (Array.isArray(value)) {
    return value.length <= 30 && value.every((entry) => safePayloadValue(entry, depth + 1));
  }
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.length > 30) return false;
  if (keys.some(forbiddenKey)) return false;
  return Object.values(value).every((item) => safePayloadValue(item, depth + 1));
}

function safePayload(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const serialized = JSON.stringify(value);
  if (serialized.length > 4096 || SECRET_RE.test(serialized)) return false;
  return safePayloadValue(value, 0);
}

/** Recursive key-sorted canonicalization shared with the JS gateway. */
export function canonicalJson(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        if (record[key] !== undefined) sorted[key] = canonical(record[key]);
      }
      return sorted;
    }
    return item;
  };
  return JSON.stringify(canonical(value));
}

/** SHA-256 over canonical JSON; identical to the internal gateway digest. */
export function observationChecksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Recompute integrity from the canonical observation fields; never trust a self-asserted digest. */
export function hasValidObservationChecksum(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.schema_version !== 'market-observation.v1') return false;
  if (typeof record.checksum !== 'string' || !HEX64.test(record.checksum)) return false;
  if (record.provenance_ref !== record.checksum) return false;
  const fields = ['schema_version', 'source', 'symbol', 'interval', 'observed_at',
    'received_at', 'is_complete', 'freshness', 'payload'];
  const signed: Record<string, unknown> = {};
  for (const field of fields) if (record[field] !== undefined) signed[field] = record[field];
  return observationChecksum(signed) === record.checksum;
}

/** Verify the re-signed digest of `market-observation-input.v1` at downstream boundaries. */
export function hasValidMarketInputChecksum(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.schema_version !== 'market-observation-input.v1') return false;
  if (typeof record.checksum !== 'string' || !HEX64.test(record.checksum)) return false;
  if (record.provenance_ref !== record.checksum) return false;
  const { checksum, provenance_ref, ...signed } = record;
  void checksum; void provenance_ref;
  return observationChecksum(signed) === record.checksum;
}

export function isMarketObservationV1(value: unknown): value is MarketObservationV1 {
  if (!isRecord(value) || value.schema_version !== 'market-observation.v1') return false;
  if (typeof value.source !== 'string' || !SOURCES.has(value.source)) return false;
  if (typeof value.symbol !== 'string' || !SYMBOL_RE.test(value.symbol)) return false;
  if (typeof value.interval !== 'string' || !INTERVALS.has(value.interval)) return false;
  if (!isIso(value.observed_at) || !isIso(value.received_at)) return false;
  if (Date.parse(value.received_at) < Date.parse(value.observed_at)) return false;
  if (value.is_complete !== true) return false;
  if (typeof value.freshness !== 'string' || !FRESHNESS.has(value.freshness)) return false;
  if (typeof value.provenance_ref !== 'string' || !HEX64.test(value.provenance_ref)) return false;
  if (typeof value.checksum !== 'string' || !HEX64.test(value.checksum)) return false;
  return safePayload(value.payload);
}

/** Fail-closed freshness check: unknown/malformed timestamps are stale. */
export function isObservationFresh(
  observation: MarketObservationV1 | null | undefined,
  now: string,
  maxAgeSeconds = 300,
): boolean {
  if (!observation || !isMarketObservationV1(observation)) return false;
  if (!isIso(now) || !Number.isFinite(maxAgeSeconds) || maxAgeSeconds < 0) return false;
  const ageSeconds = (Date.parse(now) - Date.parse(observation.observed_at)) / 1000;
  if (ageSeconds < 0 || ageSeconds > maxAgeSeconds) return false;
  return observation.freshness === 'fresh' && observation.is_complete === true;
}
