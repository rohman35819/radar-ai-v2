-- RADAR AI Agent Platform foundation
-- PostgreSQL migration 001. Schema only: no worker or production execution is enabled.
BEGIN;
CREATE SCHEMA IF NOT EXISTS radar_agent;

CREATE TABLE radar_agent.agent_registry (
  agent_id uuid PRIMARY KEY,
  agent_key text NOT NULL UNIQUE CHECK (agent_key ~ '^[a-z][a-z0-9-]{1,62}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 120),
  division_code text NOT NULL CHECK (division_code IN ('01', '02', '03', '04', '05', '06', '07', '08')),
  role_title text NOT NULL CHECK (char_length(role_title) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (octet_length(description) <= 4096),
  agent_version text NOT NULL DEFAULT '1',
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('draft', 'active', 'paused', 'retired')),
  autonomy_stage smallint NOT NULL DEFAULT 0 CHECK (autonomy_stage BETWEEN 0 AND 1),
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (CASE WHEN jsonb_typeof(capabilities) = 'array' THEN jsonb_array_length(capabilities) <= 32 ELSE false END),
  allowed_tools jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (CASE WHEN jsonb_typeof(allowed_tools) = 'array' THEN jsonb_array_length(allowed_tools) <= 32 ELSE false END),
  permission_policy jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(permission_policy) = 'object' AND octet_length(permission_policy::text) <= 16384),
  max_concurrency smallint NOT NULL DEFAULT 1 CHECK (max_concurrency = 1),
  daily_budget_usd numeric(12,4) NOT NULL DEFAULT 0 CHECK (daily_budget_usd = 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_registry_dispatch_idx ON radar_agent.agent_registry (status, division_code, agent_key);

CREATE TABLE radar_agent.task_queue (
  task_id uuid PRIMARY KEY,
  task_key text NOT NULL UNIQUE CHECK (char_length(task_key) BETWEEN 1 AND 128),
  agent_id uuid REFERENCES radar_agent.agent_registry(agent_id) ON DELETE RESTRICT,
  task_type text NOT NULL CHECK (char_length(task_type) BETWEEN 1 AND 64),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (octet_length(description) <= 4096),
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(input_payload) = 'object' AND octet_length(input_payload::text) <= 65536),
  result_payload jsonb
    CHECK (result_payload IS NULL OR (jsonb_typeof(result_payload) = 'object' AND octet_length(result_payload::text) <= 65536)),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled', 'dead_letter')),
  priority smallint NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz,
  idempotency_key text UNIQUE,
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts smallint NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 3),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  error_code text,
  error_summary text CHECK (error_summary IS NULL OR octet_length(error_summary) <= 2048),
  created_by text NOT NULL,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CHECK (deadline_at IS NULL OR deadline_at >= created_at),
  CHECK (attempt_count <= max_attempts),
  CHECK (
    (status IN ('claimed', 'running') AND lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status NOT IN ('claimed', 'running') AND lease_owner IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);
CREATE INDEX task_queue_dispatch_idx ON radar_agent.task_queue (priority DESC, scheduled_at ASC, created_at ASC) WHERE status = 'queued';
CREATE INDEX task_queue_lease_expiry_idx ON radar_agent.task_queue (lease_expires_at) WHERE status IN ('claimed', 'running');
CREATE INDEX task_queue_agent_status_idx ON radar_agent.task_queue (agent_id, status, created_at DESC);
CREATE INDEX task_queue_correlation_idx ON radar_agent.task_queue (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE radar_agent.task_dependencies (
  task_id uuid NOT NULL REFERENCES radar_agent.task_queue(task_id) ON DELETE RESTRICT,
  depends_on_task_id uuid NOT NULL REFERENCES radar_agent.task_queue(task_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE radar_agent.audit_events (
  event_id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL CHECK (actor_type IN ('owner', 'director', 'agent', 'worker', 'system', 'service')),
  actor_id text NOT NULL,
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 100),
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 1 AND 64),
  entity_id text NOT NULL CHECK (char_length(entity_id) BETWEEN 1 AND 128),
  task_id uuid REFERENCES radar_agent.task_queue(task_id) ON DELETE RESTRICT,
  correlation_id uuid,
  outcome text NOT NULL DEFAULT 'recorded' CHECK (outcome IN ('recorded', 'allowed', 'denied', 'success', 'failure', 'pending')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 16384)
);
CREATE INDEX audit_events_timeline_idx ON radar_agent.audit_events (occurred_at DESC, event_id);
CREATE INDEX audit_events_entity_idx ON radar_agent.audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_task_idx ON radar_agent.audit_events (task_id, occurred_at ASC) WHERE task_id IS NOT NULL;
CREATE INDEX audit_events_correlation_idx ON radar_agent.audit_events (correlation_id, occurred_at ASC) WHERE correlation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION radar_agent.reject_audit_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER audit_events_no_update_or_delete
  BEFORE UPDATE OR DELETE ON radar_agent.audit_events
  FOR EACH ROW EXECUTE FUNCTION radar_agent.reject_audit_event_mutation();

COMMENT ON SCHEMA radar_agent IS 'RADAR AI agent control-plane metadata; no autonomous execution enabled by this migration.';
COMMENT ON TABLE radar_agent.agent_registry IS 'Agent identity and policy metadata. Stage is intentionally capped at 1 for the initial pilot.';
COMMENT ON TABLE radar_agent.task_queue IS 'Durable task records. Claim/lease transitions must be implemented transactionally by a later worker service.';
COMMENT ON TABLE radar_agent.audit_events IS 'Append-only event history. Never store secrets, raw credentials, or unrestricted provider payloads here.';
COMMIT;
