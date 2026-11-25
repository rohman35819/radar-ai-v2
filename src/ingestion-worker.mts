import {
  isIngestionCheckpoint,
  isMarketObservation,
  isRadarAsset,
  isRadarCandle,
  type IngestionCheckpoint,
  type IngestionRun,
  type MarketObservation,
  type RadarAsset,
  type RadarCandle,
} from './contracts.mts';
import type { MarketDataStore } from './market-data-store.mts';

const MAX_CONCURRENCY = 3;
const MAX_TASKS = 50;
const MAX_BATCH_SIZE = 250;

export interface IngestionBatch {
  assets?: RadarAsset[];
  observations?: MarketObservation[];
  candles?: RadarCandle[];
  nextCursor: Record<string, unknown>;
}

export interface IngestionTask {
  source: string;
  stream: string;
  /** Last committed cursor. It is advanced only after every write succeeds. */
  cursor: Record<string, unknown>;
  fetchBatch: (cursor: Record<string, unknown>) => Promise<IngestionBatch>;
}

export interface IngestionWorkerOptions {
  /** Explicit opt-in. The worker is inert unless this is exactly true. */
  enabled?: boolean;
  concurrency?: number;
  store: MarketDataStore;
  now?: () => Date;
  createRunId?: () => string;
}

export interface TaskResult {
  source: string;
  stream: string;
  ok: boolean;
  code: string;
  recordsReceived: number;
}

export interface WorkerResult {
  ok: boolean;
  code: 'DISABLED' | 'INVALID_TASKS' | 'COMPLETED' | 'PARTIAL';
  tasks: TaskResult[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedConcurrency(value: number | undefined): number {
  if (value === undefined) return MAX_CONCURRENCY;
  if (!Number.isInteger(value) || value < 1) return 0;
  return Math.min(MAX_CONCURRENCY, value);
}

function isValidTask(task: unknown): task is IngestionTask {
  if (!isPlainObject(task)) return false;
  if (typeof task.source !== 'string' || !task.source.trim() || task.source.length > 80) return false;
  if (typeof task.stream !== 'string' || !task.stream.trim() || task.stream.length > 80) return false;
  if (!isPlainObject(task.cursor) || typeof task.fetchBatch !== 'function') return false;
  return isIngestionCheckpoint({
    source: task.source,
    stream: task.stream,
    cursor: task.cursor,
    status: 'idle',
  });
}

function isValidBatch(batch: unknown): batch is IngestionBatch {
  if (!isPlainObject(batch) || !isPlainObject(batch.nextCursor)) return false;
  const assets = batch.assets ?? [];
  const observations = batch.observations ?? [];
  const candles = batch.candles ?? [];
  if (!Array.isArray(assets) || !Array.isArray(observations) || !Array.isArray(candles)) return false;
  if (assets.length > MAX_BATCH_SIZE || observations.length > MAX_BATCH_SIZE || candles.length > MAX_BATCH_SIZE) return false;
  if (!assets.every(isRadarAsset) || !observations.every(isMarketObservation) || !candles.every(isRadarCandle)) return false;
  return isIngestionCheckpoint({
    source: 'worker',
    stream: 'cursor',
    cursor: batch.nextCursor,
    status: 'idle',
  });
}

function resultOk(result: { ok: boolean } | null): boolean {
  return result?.ok === true;
}

async function safeStoreWrite<T extends { ok: boolean }>(write: () => Promise<T>): Promise<T | null> {
  try {
    return await write();
  } catch {
    return null;
  }
}

export function createIngestionWorker(options: IngestionWorkerOptions) {
  const concurrency = boundedConcurrency(options.concurrency);
  const now = options.now ?? (() => new Date());
  const createRunId = options.createRunId ?? (() => globalThis.crypto.randomUUID());

  async function processTask(task: IngestionTask): Promise<TaskResult> {
    const startedAt = now().toISOString();
    const run: IngestionRun = {
      run_id: createRunId(),
      source: task.source,
      stream: task.stream,
      status: 'running',
      started_at: startedAt,
      records_received: 0,
      records_inserted: 0,
      records_updated: 0,
      records_rejected: 0,
    };

    const initialRun = await safeStoreWrite(() => options.store.recordRun(run));
    if (!resultOk(initialRun)) {
      return { source: task.source, stream: task.stream, ok: false, code: 'RUN_START_FAILED', recordsReceived: 0 };
    }

    const runningCheckpoint: IngestionCheckpoint = {
      source: task.source,
      stream: task.stream,
      cursor: task.cursor,
      status: 'running',
      last_attempt_at: startedAt,
    };
    const checkpointStarted = await safeStoreWrite(() => options.store.saveCheckpoint(runningCheckpoint));
    if (!resultOk(checkpointStarted)) {
      await safeStoreWrite(() => options.store.recordRun({ ...run, status: 'failed', completed_at: now().toISOString(), error_code: 'CHECKPOINT_START_FAILED' }));
      return { source: task.source, stream: task.stream, ok: false, code: 'CHECKPOINT_START_FAILED', recordsReceived: 0 };
    }

    let recordsReceived = 0;
    let wroteAny = false;
    const finishFailure = async (code: string): Promise<TaskResult> => {
      const completedAt = now().toISOString();
      await safeStoreWrite(() => options.store.recordRun({
        ...run,
        status: wroteAny ? 'partial' : 'failed',
        completed_at: completedAt,
        records_received: recordsReceived,
        error_code: code,
      }));
      await safeStoreWrite(() => options.store.saveCheckpoint({
        ...runningCheckpoint,
        status: 'failed',
        last_attempt_at: completedAt,
        last_error_code: code,
      }));
      return { source: task.source, stream: task.stream, ok: false, code, recordsReceived };
    };

    let batch: IngestionBatch;
    try {
      batch = await task.fetchBatch(task.cursor);
    } catch {
      return finishFailure('PROVIDER_FETCH_FAILED');
    }
    if (!isValidBatch(batch)) return finishFailure('INVALID_PROVIDER_BATCH');

    const assets = batch.assets ?? [];
    const observations = batch.observations ?? [];
    const candles = batch.candles ?? [];
    recordsReceived = assets.length + observations.length + candles.length;

    for (const write of [
      () => options.store.upsertAssets(assets),
      () => options.store.appendObservations(observations),
      () => options.store.upsertCandles(candles),
    ]) {
      const rows = write;
      try {
        const response = await safeStoreWrite(rows);
        if (!response || response.ok !== true) return finishFailure('STORE_WRITE_FAILED');
        if (response.records > 0) wroteAny = true;
      } catch {
        return finishFailure('STORE_WRITE_FAILED');
      }
    }

    const completedAt = now().toISOString();
    const completedRun: IngestionRun = {
      ...run,
      status: 'succeeded',
      completed_at: completedAt,
      records_received: recordsReceived,
      // PostgREST return=minimal does not distinguish inserted from updated rows.
      // Keep these counters at zero rather than reporting attempted writes as inserts.
      records_inserted: 0,
      records_updated: 0,
      records_rejected: 0,
    };
    const runFinished = await safeStoreWrite(() => options.store.recordRun(completedRun));
    if (!resultOk(runFinished)) return finishFailure('RUN_FINISH_FAILED');

    const nextCheckpoint: IngestionCheckpoint = {
      source: task.source,
      stream: task.stream,
      cursor: batch.nextCursor,
      status: 'succeeded',
      last_attempt_at: completedAt,
      last_success_at: completedAt,
      consecutive_failures: 0,
    };
    const checkpointFinished = await safeStoreWrite(() => options.store.saveCheckpoint(nextCheckpoint));
    if (!resultOk(checkpointFinished)) {
      await safeStoreWrite(() => options.store.recordRun({ ...completedRun, status: 'partial', error_code: 'CHECKPOINT_COMMIT_FAILED' }));
      await safeStoreWrite(() => options.store.saveCheckpoint({
        ...runningCheckpoint,
        status: 'failed',
        last_attempt_at: completedAt,
        last_error_code: 'CHECKPOINT_COMMIT_FAILED',
      }));
      return { source: task.source, stream: task.stream, ok: false, code: 'CHECKPOINT_COMMIT_FAILED', recordsReceived };
    }
    return { source: task.source, stream: task.stream, ok: true, code: 'SUCCEEDED', recordsReceived };
  }

  return {
    async runOnce(tasks: IngestionTask[]): Promise<WorkerResult> {
      if (options.enabled !== true) return { ok: false, code: 'DISABLED', tasks: [] };
      if (concurrency < 1 || !Array.isArray(tasks) || tasks.length > MAX_TASKS ||
          !tasks.every(isValidTask) ||
          new Set(tasks.map(task => `${task.source}\u0000${task.stream}`)).size !== tasks.length) {
        return { ok: false, code: 'INVALID_TASKS', tasks: [] };
      }
      const results = new Array<TaskResult>(tasks.length);
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
        while (cursor < tasks.length) {
          const index = cursor++;
          const task = tasks[index];
          if (task) results[index] = await processTask(task);
        }
      });
      await Promise.all(workers);
      const ok = results.every(result => result.ok);
      return { ok, code: ok ? 'COMPLETED' : 'PARTIAL', tasks: results };
    },
  };
}
