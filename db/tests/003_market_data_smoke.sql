-- Disposable PostgreSQL 16 smoke tests for RADAR market-data storage v1.
-- This file is executed only against the ephemeral CI database.
BEGIN;

DO $$
BEGIN
  IF to_regclass('radar_market.assets') IS NULL OR
     to_regclass('radar_market.ingestion_runs') IS NULL OR
     to_regclass('radar_market.market_observations') IS NULL OR
     to_regclass('radar_market.market_candles') IS NULL OR
     to_regclass('radar_market.ingestion_checkpoints') IS NULL THEN
    RAISE EXCEPTION 'Market-data migration is incomplete';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='radar_market' AND c.relrowsecurity) <> 5 THEN
    RAISE EXCEPTION 'RLS must be enabled on every market-data table';
  END IF;
  IF has_schema_privilege('anon', 'radar_market', 'USAGE') OR has_schema_privilege('authenticated', 'radar_market', 'USAGE') THEN
    RAISE EXCEPTION 'Client roles unexpectedly have market-data schema access';
  END IF;
  IF NOT has_schema_privilege('service_role', 'radar_market', 'USAGE') THEN
    RAISE EXCEPTION 'Service role is missing schema access';
  END IF;
  IF has_table_privilege('anon', 'radar_market.assets', 'SELECT') OR has_table_privilege('authenticated', 'radar_market.market_candles', 'SELECT') THEN
    RAISE EXCEPTION 'Client roles unexpectedly have table access';
  END IF;
  IF NOT has_table_privilege('service_role', 'radar_market.market_observations', 'INSERT') OR
     has_table_privilege('service_role', 'radar_market.market_observations', 'UPDATE') OR
     has_table_privilege('service_role', 'radar_market.market_observations', 'DELETE') OR
     has_table_privilege('service_role', 'radar_market.market_observations', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Observation permissions are not append-only';
  END IF;
  IF NOT has_table_privilege('service_role', 'radar_market.market_candles', 'UPDATE') OR
     has_table_privilege('service_role', 'radar_market.market_candles', 'DELETE') THEN
    RAISE EXCEPTION 'Candle correction permissions are not as expected';
  END IF;
END $$;

-- Create bounded monthly partitions for this disposable test dataset.
CREATE TABLE radar_market.market_candles_2026_01 PARTITION OF radar_market.market_candles
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');
CREATE TABLE radar_market.market_candles_2026_02 PARTITION OF radar_market.market_candles
  FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

SET ROLE service_role;
INSERT INTO radar_market.assets (asset_id, asset_kind, symbol, name, chain, contract_address, decimals)
VALUES ('ethereum:0x0000000000000000000000000000000000000001', 'token', 'TST', 'Test Token', 'ethereum', '0x0000000000000000000000000000000000000001', 18);
INSERT INTO radar_market.ingestion_runs (run_id, source, stream, status, records_received, records_inserted)
VALUES ('20000000-0000-4000-8000-000000000001', 'fixture', 'market', 'running', 1, 1);
INSERT INTO radar_market.market_observations (source, entity_type, entity_id, observed_at, payload, payload_hash, ingestion_run_id)
VALUES ('fixture', 'asset', 'ethereum:0x0000000000000000000000000000000000000001', '2026-01-15T00:00:00Z', '{"price":1.25}'::jsonb, repeat('a',64), '20000000-0000-4000-8000-000000000001')
ON CONFLICT (source, entity_type, entity_id, observed_at, payload_hash) DO NOTHING;
INSERT INTO radar_market.market_observations (source, entity_type, entity_id, observed_at, payload, payload_hash, ingestion_run_id)
VALUES ('fixture', 'asset', 'ethereum:0x0000000000000000000000000000000000000001', '2026-01-15T00:00:00Z', '{"price":1.25}'::jsonb, repeat('a',64), '20000000-0000-4000-8000-000000000001')
ON CONFLICT (source, entity_type, entity_id, observed_at, payload_hash) DO NOTHING;
INSERT INTO radar_market.market_candles (symbol, interval_code, bucket_at, source, open, high, low, close, volume, ingestion_run_id)
VALUES ('TSTUSDT', '1m', '2026-01-15T00:00:00Z', 'fixture', 1, 1.5, 0.9, 1.2, 100, '20000000-0000-4000-8000-000000000001');
INSERT INTO radar_market.market_candles (symbol, interval_code, bucket_at, source, open, high, low, close, volume, ingestion_run_id)
VALUES ('TSTUSDT', '1m', '2026-01-15T00:00:00Z', 'fixture', 1, 1.6, 0.95, 1.3, 120, '20000000-0000-4000-8000-000000000001')
ON CONFLICT (symbol, interval_code, bucket_at, source) DO UPDATE SET high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume;
INSERT INTO radar_market.ingestion_checkpoints (source, stream, cursor, status, last_attempt_at, last_success_at, next_run_at)
VALUES ('fixture', 'market', '{"page":2}'::jsonb, 'succeeded', now(), now(), now() + interval '5 minutes')
ON CONFLICT (source, stream) DO UPDATE SET cursor=EXCLUDED.cursor, status=EXCLUDED.status, updated_at=now();
DO $$
BEGIN
  IF (SELECT count(*) FROM radar_market.market_observations WHERE source='fixture') <> 1 THEN RAISE EXCEPTION 'Observation idempotency failed'; END IF;
  IF (SELECT count(*) FROM radar_market.market_candles WHERE symbol='TSTUSDT') <> 1 THEN RAISE EXCEPTION 'Candle upsert/idempotency failed'; END IF;
  IF (SELECT close FROM radar_market.market_candles WHERE symbol='TSTUSDT') <> 1.3 THEN RAISE EXCEPTION 'Candle correction did not update latest bar'; END IF;
  IF (SELECT cursor->>'page' FROM radar_market.ingestion_checkpoints WHERE source='fixture' AND stream='market') <> '2' THEN RAISE EXCEPTION 'Checkpoint persistence failed'; END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  BEGIN
    INSERT INTO radar_market.market_candles (symbol, interval_code, bucket_at, source, open, high, low, close)
    VALUES ('BAD', '1m', '2026-01-15T00:00:00Z', 'fixture', 1, 0.5, 0.9, 1.1);
    RAISE EXCEPTION 'Invalid OHLC candle unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO radar_market.market_observations (source, entity_type, entity_id, observed_at, payload, payload_hash)
    VALUES ('fixture', 'asset', 'bad-hash', now(), '{}'::jsonb, 'not-a-sha256');
    RAISE EXCEPTION 'Invalid payload hash unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT count(*) FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='radar_market') <> 2 THEN
    RAISE EXCEPTION 'Monthly candle partitions were not created';
  END IF;
END $$;

ROLLBACK;
