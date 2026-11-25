/**
 * Disabled-by-default market-data ingestion pilot.
 *
 * This module is deliberately not imported by server.js or any production route.
 * Callers must explicitly pass enabled: true and inject server-only PostgREST
 * credentials. CI exercises it with a mocked fetch; no production writes occur.
 */
export type AssetKind = 'token' | 'coin' | 'contract' | 'pool' | 'pair' | 'index' | 'other';

export interface MarketAssetInput {
  asset_id: string;
  asset_kind: AssetKind;
  symbol: string;
  name: string;
  chain?: string | null;
  contract_address?: string | null;
  decimals?: number | null;
  provider_ids?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface MarketObservationInput {
  asset: MarketAssetInput;
  observed_at: string;
  source_updated_at?: string | null;
  payload: Record<string, unknown>;
}

export interface IngestionBatch {
  source: string;
  stream: string;
  observations: MarketObservationInput[];
  cursor?: Record<string, unknown>;
}

export interface IngestionResult {
  status: 'disabled' | 'succeeded';
  received: number;
  inserted: number;
  run_id?: string;
}

export interface WorkerOptions {
  enabled?: boolean;
  baseUrl?: string;
  serviceRoleKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  maxBatchSize?: number;
}

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

const ASSET_KINDS = new Set<AssetKind>(['token', 'coin', 'contract', 'pool', 'pair', 'index', 'other']);
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const record = value as JsonRecord;
  return '{' + Object.keys(record).sort().map((key) =>
    JSON.stringify(key) + ':' + canonicalJson(record[key])).join(',') + '}';
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isoTimestamp(value: string, field: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(field + ' must be a valid timestamp');
  return date.toISOString();
}

function validateAsset(asset: MarketAssetInput): void {
  if (!asset || typeof asset !== 'object') throw new TypeError('asset is required');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(asset.asset_id)) throw new TypeError('asset_id is invalid');
  if (!ASSET_KINDS.has(asset.asset_kind)) throw new TypeError('asset_kind is invalid');
  if (typeof asset.symbol !== 'string' || asset.symbol.length < 1 || asset.symbol.length > 32) throw new TypeError('symbol is invalid');
  if (typeof asset.name !== 'string' || asset.name.length < 1 || asset.name.length > 160) throw new TypeError('name is invalid');
  if ((asset.chain == null) !== (asset.contract_address == null)) throw new TypeError('chain and contract_address must be supplied together');
  if (asset.chain != null && (asset.chain.length > 64 || asset.contract_address!.length > 160)) throw new TypeError('chain or contract_address is too long');
  if (asset.decimals != null && (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 36)) throw new TypeError('decimals is invalid');
  if (asset.provider_ids != null && !isRecord(asset.provider_ids)) throw new TypeError('provider_ids must be an object');
  if (asset.metadata != null && !isRecord(asset.metadata)) throw new TypeError('metadata must be an object');
}

function safeJsonObject(value: Record<string, unknown>, field: string, maxBytes: number): string {
  if (!isRecord(value)) throw new TypeError(field + ' must be an object');
  const json = canonicalJson(value);
  if (new TextEncoder().encode(json).byteLength > maxBytes) throw new RangeError(field + ' exceeds the ' + maxBytes + ' byte limit');
  return json;
}

export function isMarketIngestionEnabled(value: unknown): value is true {
  return value === true;
}

/** PostgREST adapter; credentials are supplied at runtime and never persisted. */
export function createPostgrestMarketDataStore(options: {
  baseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}) {
  const base = options.baseUrl.replace(/\/+$/, '');
  const key = options.serviceRoleKey;
  const fetcher = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!/^https:\/\//i.test(base) && !/^http:\/\/localhost(?::\d+)?$/i.test(base)) throw new TypeError('PostgREST URL must use HTTPS');
  if (!key || key.length < 16) throw new TypeError('service role key is required');
  if (typeof fetcher !== 'function') throw new TypeError('fetch implementation is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw new RangeError('timeoutMs must be 100..60000');

  async function request(table: string, query: string, method: string, body?: unknown, prefer?: string): Promise<unknown> {
    const response = await fetcher(base + '/rest/v1/' + table + query, {
      method,
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      // Do not include response bodies: providers may echo sensitive request data.
      throw new Error('PostgREST ' + table + ' request failed (HTTP ' + response.status + ')');
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) as unknown : null;
  }

  return {
    async startRun(source: string, stream: string, startedAt: string): Promise<string> {
      const result = await request('ingestion_runs', '?select=run_id', 'POST',
        { source, stream, status: 'running', started_at: startedAt, records_received: 0 },
        'return=representation');
      const runId = Array.isArray(result) && isRecord(result[0]) ? result[0].run_id : undefined;
      if (typeof runId !== 'string') throw new Error('PostgREST did not return an ingestion run ID');
      return runId;
    },
    async upsertAssets(assets: JsonRecord[]): Promise<void> {
      if (!assets.length) return;
      await request('assets', '?on_conflict=asset_id', 'POST', assets, 'resolution=merge-duplicates,return=minimal');
    },
    async insertObservations(rows: JsonRecord[]): Promise<number> {
      if (!rows.length) return 0;
      const result = await request(
        'market_observations',
        '?on_conflict=source%2Centity_type%2Centity_id%2Cobserved_at%2Cpayload_hash',
        'POST',
        rows,
        'resolution=ignore-duplicates,return=representation',
      );
      return Array.isArray(result) ? result.length : 0;
    },
    async finishRun(runId: string, status: 'succeeded' | 'failed', counts: { received: number; inserted: number }, completedAt: string, errorCode?: string): Promise<void> {
      await request('ingestion_runs', '?run_id=eq.' + encodeURIComponent(runId), 'PATCH', {
        status, completed_at: completedAt, records_received: counts.received,
        records_inserted: counts.inserted, records_rejected: status === 'failed' ? counts.received - counts.inserted : 0,
        ...(errorCode ? { error_code: errorCode } : {}),
      }, 'return=minimal');
    },
    async saveCheckpoint(source: string, stream: string, cursor: JsonRecord, status: 'succeeded' | 'failed', at: string): Promise<void> {
      await request('ingestion_checkpoints?on_conflict=source%2Cstream', '', 'POST', {
        source, stream, cursor, status, last_attempt_at: at,
        ...(status === 'succeeded' ? { last_success_at: at, consecutive_failures: 0 } : {}),
        ...(status === 'failed' ? { consecutive_failures: 1 } : {}),
        updated_at: at,
      }, 'resolution=merge-duplicates,return=minimal');
    },
  };
}

export function createMarketDataIngestionWorker(options: WorkerOptions) {
  const maxBatchSize = options.maxBatchSize ?? 100;
  const now = options.now ?? (() => new Date());
  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1 || maxBatchSize > 100) throw new RangeError('maxBatchSize must be 1..100');

  return {
    async ingest(batch: IngestionBatch): Promise<IngestionResult> {
      if (!isMarketIngestionEnabled(options.enabled)) return { status: 'disabled', received: 0, inserted: 0 };
      if (!batch || typeof batch !== 'object') throw new TypeError('batch is required');
      if (typeof batch.source !== 'string' || !batch.source.trim() || batch.source.length > 80) throw new TypeError('source is invalid');
      if (typeof batch.stream !== 'string' || !batch.stream.trim() || batch.stream.length > 80) throw new TypeError('stream is invalid');
      if (!Array.isArray(batch.observations) || batch.observations.length > maxBatchSize) throw new RangeError('observations must contain 0..' + maxBatchSize + ' records');
      const cursor = batch.cursor ?? {};
      const cursorJson = safeJsonObject(cursor, 'cursor', 8192);
      const observedAt = batch.observations.map((item) => {
        validateAsset(item.asset);
        if (!isRecord(item.payload)) throw new TypeError('payload must be an object');
        safeJsonObject(item.payload, 'payload', 65_536);
        return isoTimestamp(item.observed_at, 'observed_at');
      });
      const sourceUpdatedAt = batch.observations.map((item) =>
        item.source_updated_at == null ? null : isoTimestamp(item.source_updated_at, 'source_updated_at'));
      const assets = batch.observations.map((item) => ({
        asset_id: item.asset.asset_id, asset_kind: item.asset.asset_kind, symbol: item.asset.symbol,
        name: item.asset.name, chain: item.asset.chain ?? null,
        contract_address: item.asset.contract_address ?? null, decimals: item.asset.decimals ?? null,
        provider_ids: item.asset.provider_ids ?? {}, metadata: item.asset.metadata ?? {},
      }));
      const hashes = await Promise.all(batch.observations.map((item) => sha256(canonicalJson(item.payload))));
      const startedAt = now().toISOString();
      const store = createPostgrestMarketDataStore({
        baseUrl: options.baseUrl ?? '', serviceRoleKey: options.serviceRoleKey ?? '',
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      });
      const runId = await store.startRun(batch.source, batch.stream, startedAt);
      let inserted = 0;
      try {
        await store.upsertAssets(assets);
        const rows = batch.observations.map((item, index) => ({
          source: batch.source, entity_type: 'asset', entity_id: item.asset.asset_id,
          observed_at: observedAt[index], source_updated_at: sourceUpdatedAt[index],
          schema_version: 1, payload: item.payload, payload_hash: hashes[index], ingestion_run_id: runId,
        }));
        inserted = await store.insertObservations(rows);
        const completedAt = now().toISOString();
        await store.finishRun(runId, 'succeeded', { received: batch.observations.length, inserted }, completedAt);
        await store.saveCheckpoint(batch.source, batch.stream, JSON.parse(cursorJson) as JsonRecord, 'succeeded', completedAt);
        return { status: 'succeeded', received: batch.observations.length, inserted, run_id: runId };
      } catch (error) {
        const completedAt = now().toISOString();
        const errorCode = error instanceof Error && /HTTP \d+/.test(error.message) ? 'POSTGREST_REQUEST_FAILED' : 'INGESTION_FAILED';
        try { await store.finishRun(runId, 'failed', { received: batch.observations.length, inserted }, completedAt, errorCode); } catch {}
        try { await store.saveCheckpoint(batch.source, batch.stream, JSON.parse(cursorJson) as JsonRecord, 'failed', completedAt); } catch {}
        throw error;
      }
    },
  };
}
