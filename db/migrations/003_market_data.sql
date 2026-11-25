-- RADAR AI market-data storage foundation v1.
-- Additive schema only. No production migration or backfill is performed by CI.
BEGIN;
CREATE SCHEMA IF NOT EXISTS radar_market;

CREATE TABLE radar_market.assets (
  asset_id text PRIMARY KEY CHECK (asset_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
  asset_kind text NOT NULL CHECK (asset_kind IN ('token', 'coin', 'contract', 'pool', 'pair', 'index', 'other')),
  symbol text NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 32),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  chain text CHECK (chain IS NULL OR char_length(chain) BETWEEN 1 AND 64),
  contract_address text CHECK (contract_address IS NULL OR char_length(contract_address) BETWEEN 1 AND 160),
  decimals smallint CHECK (decimals IS NULL OR decimals BETWEEN 0 AND 36),
  provider_ids jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_ids) = 'object' AND octet_length(provider_ids::text) <= 8192),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((chain IS NULL) = (contract_address IS NULL))
);
CREATE UNIQUE INDEX assets_chain_contract_unique_idx ON radar_market.assets (chain, lower(contract_address)) WHERE chain IS NOT NULL AND contract_address IS NOT NULL;
CREATE INDEX assets_symbol_idx ON radar_market.assets (upper(symbol), asset_id);

CREATE TABLE radar_market.ingestion_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 80),
  stream text NOT NULL CHECK (char_length(stream) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  records_received bigint NOT NULL DEFAULT 0 CHECK (records_received >= 0),
  records_inserted bigint NOT NULL DEFAULT 0 CHECK (records_inserted >= 0),
  records_updated bigint NOT NULL DEFAULT 0 CHECK (records_updated >= 0),
  records_rejected bigint NOT NULL DEFAULT 0 CHECK (records_rejected >= 0),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) <= 100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 8192),
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  CHECK (records_inserted + records_updated + records_rejected <= records_received)
);
CREATE INDEX ingestion_runs_source_timeline_idx ON radar_market.ingestion_runs (source, stream, started_at DESC);
CREATE INDEX ingestion_runs_status_idx ON radar_market.ingestion_runs (status, started_at DESC) WHERE status IN ('running', 'failed', 'partial');

CREATE TABLE radar_market.market_observations (
  observation_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 80),
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 1 AND 48),
  entity_id text NOT NULL CHECK (char_length(entity_id) BETWEEN 1 AND 160),
  observed_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version BETWEEN 1 AND 100),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 65536),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  ingestion_run_id uuid REFERENCES radar_market.ingestion_runs(run_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, entity_type, entity_id, observed_at, payload_hash)
);
CREATE INDEX market_observations_entity_timeline_idx ON radar_market.market_observations (entity_type, entity_id, observed_at DESC);
CREATE INDEX market_observations_source_timeline_idx ON radar_market.market_observations (source, observed_at DESC);
CREATE INDEX market_observations_run_idx ON radar_market.market_observations (ingestion_run_id) WHERE ingestion_run_id IS NOT NULL;

CREATE TABLE radar_market.market_candles (
  asset_id text NOT NULL REFERENCES radar_market.assets(asset_id) ON DELETE RESTRICT,
  symbol text NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 48),
  interval_code text NOT NULL CHECK (interval_code ~ '^[1-9][0-9]*[smhdw]$'),
  bucket_at timestamptz NOT NULL,
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 80),
  open numeric(30,12) NOT NULL CHECK (open > 0),
  high numeric(30,12) NOT NULL CHECK (high > 0),
  low numeric(30,12) NOT NULL CHECK (low > 0),
  close numeric(30,12) NOT NULL CHECK (close > 0),
  volume numeric(38,12) NOT NULL DEFAULT 0 CHECK (volume >= 0),
  trades bigint CHECK (trades IS NULL OR trades >= 0),
  source_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  ingestion_run_id uuid REFERENCES radar_market.ingestion_runs(run_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, interval_code, bucket_at, source),
  CHECK (high >= low AND high >= open AND high >= close AND low <= open AND low <= close)
) PARTITION BY RANGE (bucket_at);
CREATE INDEX market_candles_lookup_idx ON radar_market.market_candles (asset_id, interval_code, bucket_at DESC);
CREATE INDEX market_candles_source_idx ON radar_market.market_candles (source, bucket_at DESC);

CREATE TABLE radar_market.ingestion_checkpoints (
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 80),
  stream text NOT NULL CHECK (char_length(stream) BETWEEN 1 AND 80),
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(cursor) = 'object' AND octet_length(cursor::text) <= 8192),
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'succeeded', 'partial', 'failed', 'paused')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_run_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, stream),
  CHECK (last_success_at IS NULL OR last_attempt_at IS NULL OR last_success_at <= last_attempt_at)
);
CREATE INDEX ingestion_checkpoints_due_idx ON radar_market.ingestion_checkpoints (next_run_at, source, stream) WHERE status NOT IN ('paused', 'running');

-- RLS is enabled with no client policies. Only the server-side service role receives access.
ALTER TABLE radar_market.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_market.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_market.market_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_market.market_candles ENABLE ROW LEVEL SECURITY;
ALTER TABLE radar_market.ingestion_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA radar_market FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA radar_market TO service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA radar_market FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON radar_market.assets, radar_market.ingestion_runs, radar_market.market_candles, radar_market.ingestion_checkpoints TO service_role;
GRANT SELECT, INSERT ON radar_market.market_observations TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON radar_market.market_observations FROM service_role;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA radar_market FROM service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA radar_market FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA radar_market TO service_role;

COMMENT ON SCHEMA radar_market IS 'RADAR normalized market data, source provenance, OHLCV partitions and ingestion checkpoints; no production data is populated by migration.';
COMMENT ON TABLE radar_market.market_observations IS 'Append-only provider observations. Idempotency key is source/entity/time/payload hash; payloads are bounded JSON objects.';
COMMENT ON TABLE radar_market.market_candles IS 'Time-partitioned OHLCV table. Operators must create future monthly partitions before ingestion; no default partition is created.';
COMMENT ON TABLE radar_market.ingestion_checkpoints IS 'Durable source cursor and scheduling checkpoint. Workers must use idempotent writes and bounded provider quotas.';
COMMIT;
