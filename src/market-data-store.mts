import {
  isIngestionCheckpoint,
  isIngestionRun,
  isMarketObservation,
  isRadarAsset,
  isRadarCandle,
  type IngestionCheckpoint,
  type IngestionRun,
  type MarketObservation,
  type RadarAsset,
  type RadarCandle,
} from './contracts.mts';

const SCHEMA = 'radar_market';
const MAX_BATCH_SIZE = 250;

type StoreResult =
  | { ok: true; code: 'STORED' | 'EMPTY'; records: number; httpStatus?: number }
  | { ok: false; code: 'DISABLED' | 'CONFIG_MISSING' | 'INVALID_PAYLOAD' | 'BATCH_TOO_LARGE' | 'NETWORK_ERROR' | `HTTP_${number}`; records: 0; httpStatus?: number };

export interface MarketDataStoreConfig {
  /** Must be explicitly true; default is disabled. */
  enabled?: boolean;
  supabaseUrl?: string;
  serviceRoleKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface MarketDataStore {
  upsertAssets(rows: RadarAsset[]): Promise<StoreResult>;
  appendObservations(rows: MarketObservation[]): Promise<StoreResult>;
  upsertCandles(rows: RadarCandle[]): Promise<StoreResult>;
  recordRun(row: IngestionRun): Promise<StoreResult>;
  saveCheckpoint(row: IngestionCheckpoint): Promise<StoreResult>;
}

/**
 * Typed PostgREST adapter for the radar_market schema.
 *
 * Safety defaults: disabled unless enabled=true, server-side service-role key
 * only, HTTPS only, bounded batches, no implicit retry and no response-body
 * logging. Retries belong to a durable idempotent worker, not this HTTP client.
 */
export function createMarketDataStore(config: MarketDataStoreConfig = {}): MarketDataStore {
  const enabled = config.enabled === true;
  const baseUrl = config.supabaseUrl?.replace(/\/+$/, '') ?? '';
  const serviceRoleKey = config.serviceRoleKey ?? '';
  const timeoutMs = Math.min(30_000, Math.max(1_000, config.timeoutMs ?? 10_000));
  const fetchImpl = config.fetchImpl ?? fetch;

  const write = async <T>(
    table: string,
    rows: T[],
    valid: (row: unknown) => boolean,
    conflict: string,
    prefer: string,
  ): Promise<StoreResult> => {
    if (!enabled) return { ok: false, code: 'DISABLED', records: 0 };
    if (!baseUrl || !serviceRoleKey) return { ok: false, code: 'CONFIG_MISSING', records: 0 };
    let endpoint: URL;
    try {
      endpoint = new URL(`${baseUrl}/rest/v1/${table}`);
      if (endpoint.protocol !== 'https:') return { ok: false, code: 'CONFIG_MISSING', records: 0 };
    } catch {
      return { ok: false, code: 'CONFIG_MISSING', records: 0 };
    }
    if (!Array.isArray(rows)) return { ok: false, code: 'INVALID_PAYLOAD', records: 0 };
    if (rows.length > MAX_BATCH_SIZE) return { ok: false, code: 'BATCH_TOO_LARGE', records: 0 };
    if (!rows.every(valid)) return { ok: false, code: 'INVALID_PAYLOAD', records: 0 };
    if (rows.length === 0) return { ok: true, code: 'EMPTY', records: 0 };

    endpoint.searchParams.set('on_conflict', conflict);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Profile': SCHEMA,
          'Content-Profile': SCHEMA,
          Prefer: prefer,
        },
        body: JSON.stringify(rows),
      });
      if (!response.ok) return { ok: false, code: `HTTP_${response.status}`, records: 0, httpStatus: response.status };
      return { ok: true, code: 'STORED', records: rows.length, httpStatus: response.status };
    } catch {
      return { ok: false, code: 'NETWORK_ERROR', records: 0 };
    }
  };

  return {
    upsertAssets: rows => write('assets', rows, isRadarAsset, 'asset_id', 'resolution=merge-duplicates,return=minimal'),
    appendObservations: rows => write('market_observations', rows, isMarketObservation,
      'source,entity_type,entity_id,observed_at,payload_hash', 'resolution=ignore-duplicates,return=minimal'),
    upsertCandles: rows => write('market_candles', rows, isRadarCandle,
      'asset_id,interval_code,bucket_at,source', 'resolution=merge-duplicates,return=minimal'),
    recordRun: row => write('ingestion_runs', [row], isIngestionRun, 'run_id', 'resolution=merge-duplicates,return=minimal'),
    saveCheckpoint: row => write('ingestion_checkpoints', [row], isIngestionCheckpoint,
      'source,stream', 'resolution=merge-duplicates,return=minimal'),
  };
}
