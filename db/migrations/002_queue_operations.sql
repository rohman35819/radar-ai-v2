-- RADAR AI Agent Platform transactional queue operations.
-- Owner-only v1: no runtime role receives table or function access.
BEGIN;
CREATE TABLE radar_agent.platform_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  paused boolean NOT NULL DEFAULT true,
  kill_switch boolean NOT NULL DEFAULT true,
  reason text NOT NULL DEFAULT 'initially disabled' CHECK (octet_length(reason) <= 512),
  changed_by text NOT NULL DEFAULT 'migration',
  changed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO radar_agent.platform_control (singleton, paused, kill_switch, reason, changed_by)
VALUES (true, true, true, 'Workers remain disabled until Security and QA gates pass', 'migration')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE radar_agent.approval_requests (
  approval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES radar_agent.task_queue(task_id) ON DELETE RESTRICT,
  action_type text NOT NULL CHECK (char_length(action_type) BETWEEN 1 AND 80),
  requested_by text NOT NULL CHECK (char_length(requested_by) BETWEEN 1 AND 96),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 16384),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reviewed_by text, reviewed_at timestamptz,
  decision_reason text CHECK (decision_reason IS NULL OR octet_length(decision_reason) <= 2048),
  CHECK ((status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX approval_one_pending_per_task_idx ON radar_agent.approval_requests (task_id) WHERE status = 'pending';
CREATE INDEX approval_pending_expiry_idx ON radar_agent.approval_requests (expires_at) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION radar_agent.prevent_dependency_cycles()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, radar_agent AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE dependency_path(task_id) AS (
      SELECT NEW.depends_on_task_id
      UNION
      SELECT d.depends_on_task_id FROM radar_agent.task_dependencies d
      JOIN dependency_path p ON d.task_id = p.task_id
    )
    SELECT 1 FROM dependency_path WHERE task_id = NEW.task_id
  ) THEN RAISE EXCEPTION 'task dependency cycle rejected' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER task_dependencies_no_cycle BEFORE INSERT OR UPDATE ON radar_agent.task_dependencies
FOR EACH ROW EXECUTE FUNCTION radar_agent.prevent_dependency_cycles();

CREATE OR REPLACE FUNCTION radar_agent.enqueue_task(
  p_task_id uuid, p_task_key text, p_agent_id uuid, p_task_type text, p_title text,
  p_input_payload jsonb, p_created_by text,
  p_actor_type text DEFAULT 'director', p_idempotency_key text DEFAULT NULL,
  p_priority integer DEFAULT 50, p_scheduled_at timestamptz DEFAULT now(),
  p_deadline_at timestamptz DEFAULT NULL, p_correlation_id uuid DEFAULT NULL
)
RETURNS TABLE(task_id uuid, deduplicated boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, radar_agent AS $$
DECLARE v_task_id uuid;
BEGIN
  IF p_actor_type IS NULL OR p_actor_type NOT IN ('owner', 'director', 'system', 'service')
     OR p_created_by IS NULL OR char_length(p_created_by) NOT BETWEEN 1 AND 96 THEN
    RAISE EXCEPTION 'invalid trusted task actor' USING ERRCODE = '22023';
  END IF;
  INSERT INTO radar_agent.task_queue
    (task_id, task_key, agent_id, task_type, title, input_payload, created_by, idempotency_key,
     priority, scheduled_at, deadline_at, correlation_id)
  VALUES
    (p_task_id, p_task_key, p_agent_id, p_task_type, p_title, coalesce(p_input_payload, '{}'::jsonb),
     p_created_by, p_idempotency_key, p_priority, coalesce(p_scheduled_at, now()), p_deadline_at, p_correlation_id)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING radar_agent.task_queue.task_id INTO v_task_id;
  IF v_task_id IS NULL THEN
    SELECT q.task_id INTO v_task_id FROM radar_agent.task_queue q WHERE q.idempotency_key = p_idempotency_key;
    IF v_task_id IS NULL THEN RAISE EXCEPTION 'task key already exists with a different idempotency key' USING ERRCODE = '23505'; END IF;
    RETURN QUERY SELECT v_task_id, true; RETURN;
  END IF;
  INSERT INTO radar_agent.audit_events
    (event_id, actor_type, actor_id, event_type, entity_type, entity_id, task_id, correlation_id, outcome, metadata)
  VALUES (gen_random_uuid(), p_actor_type, p_created_by, 'task.queued', 'task', v_task_id::text,
    v_task_id, p_correlation_id, 'recorded', jsonb_build_object('task_key', p_task_key, 'priority', p_priority));
  RETURN QUERY SELECT v_task_id, false;
END;
$$;

CREATE OR REPLACE FUNCTION radar_agent.reclaim_expired_leases(p_agent_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, radar_agent AS $$
DECLARE v_task radar_agent.task_queue%ROWTYPE; v_next_status text; v_count integer := 0;
BEGIN
  FOR v_task IN
    SELECT q.* FROM radar_agent.task_queue q
    WHERE q.status IN ('claimed', 'running') AND q.lease_expires_at <= clock_timestamp()
      AND (p_agent_id IS NULL OR q.agent_id = p_agent_id)
    ORDER BY q.lease_expires_at, q.created_at FOR UPDATE SKIP LOCKED
  LOOP
    v_next_status := CASE WHEN v_task.attempt_count >= v_task.max_attempts
      OR (v_task.deadline_at IS NOT NULL AND v_task.deadline_at <= clock_timestamp())
      THEN 'dead_letter' ELSE 'queued' END;
    UPDATE radar_agent.task_queue SET status = v_next_status, lease_owner = NULL, lease_token = NULL,
      lease_expires_at = NULL, heartbeat_at = NULL, error_code = 'LEASE_EXPIRED',
      error_summary = 'Worker lease expired; task recovered by queue maintenance',
      scheduled_at = CASE WHEN v_next_status = 'queued' THEN clock_timestamp() ELSE scheduled_at END,
      completed_at = CASE WHEN v_next_status = 'dead_letter' THEN clock_timestamp() ELSE NULL END,
      updated_at = clock_timestamp() WHERE task_id = v_task.task_id;
    INSERT INTO radar_agent.audit_events
      (event_id, actor_type, actor_id, event_type, entity_type, entity_id, task_id, correlation_id, outcome, metadata)
    VALUES (gen_random_uuid(), 'system', 'queue-recovery', 'task.lease_expired', 'task', v_task.task_id::text,
      v_task.task_id, v_task.correlation_id, 'success',
      jsonb_build_object('new_status', v_next_status, 'attempt_count', v_task.attempt_count));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION radar_agent.claim_task(p_agent_id uuid, p_worker_id text, p_lease_seconds integer DEFAULT 120)
RETURNS SETOF radar_agent.task_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, radar_agent AS $$
DECLARE v_agent radar_agent.agent_registry%ROWTYPE; v_control radar_agent.platform_control%ROWTYPE; v_task radar_agent.task_queue%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR char_length(p_worker_id) NOT BETWEEN 1 AND 96
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 600 THEN
    RAISE EXCEPTION 'invalid worker lease request' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_agent FROM radar_agent.agent_registry WHERE agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND OR v_agent.status <> 'active' OR v_agent.autonomy_stage > 1
     OR v_agent.daily_budget_usd <> 0 OR v_agent.max_concurrency <> 1 THEN RETURN; END IF;
  SELECT * INTO v_control FROM radar_agent.platform_control WHERE singleton = true;
  IF NOT FOUND OR v_control.paused OR v_control.kill_switch THEN RETURN; END IF;
  PERFORM radar_agent.reclaim_expired_leases(p_agent_id);
  IF EXISTS (SELECT 1 FROM radar_agent.task_queue q WHERE q.agent_id = p_agent_id
      AND q.status IN ('claimed', 'running') AND q.lease_expires_at > clock_timestamp()) THEN RETURN; END IF;
  WITH candidate AS (
    SELECT q.task_id FROM radar_agent.task_queue q
    WHERE q.agent_id = p_agent_id AND q.status = 'queued'
      AND q.scheduled_at <= clock_timestamp()
      AND (q.deadline_at IS NULL OR q.deadline_at > clock_timestamp())
      AND q.attempt_count < q.max_attempts
      AND NOT EXISTS (
        SELECT 1 FROM radar_agent.task_dependencies d
        JOIN radar_agent.task_queue parent ON parent.task_id = d.depends_on_task_id
        WHERE d.task_id = q.task_id AND parent.status <> 'succeeded'
      )
    ORDER BY q.priority DESC, q.scheduled_at ASC, q.created_at ASC
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE radar_agent.task_queue q
  SET status = 'claimed', attempt_count = q.attempt_count + 1, lease_owner = p_worker_id,
      lease_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      heartbeat_at = clock_timestamp(), started_at = coalesce(q.started_at, clock_timestamp()), updated_at = clock_timestamp()
  FROM candidate c WHERE q.task_id = c.task_id RETURNING q.* INTO v_task;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO radar_agent.audit_events
    (event_id, actor_type, actor_id, event_type, entity_type, entity_id, task_id, correlation_id, outcome, metadata)
  VALUES (gen_random_uuid(), 'worker', p_worker_id, 'task.claimed', 'task', v_task.task_id::text,
    v_task.task_id, v_task.correlation_id, 'success',
    jsonb_build_object('attempt_count', v_task.attempt_count, 'lease_seconds', p_lease_seconds));
  RETURN NEXT v_task;
END;
$$;

CREATE OR REPLACE FUNCTION radar_agent.heartbeat_task(
  p_task_id uuid, p_worker_id text, p_lease_token uuid, p_lease_seconds integer DEFAULT 120
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, radar_agent AS $$
DECLARE v_task radar_agent.task_queue%ROWTYPE;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 600 THEN
    RAISE EXCEPTION 'invalid lease duration' USING ERRCODE = '22023';
  END IF;
  UPDATE radar_agent.task_queue q SET lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
    heartbeat_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE q.task_id = p_task_id AND q.status IN ('claimed', 'running') AND q.lease_owner = p_worker_id
    AND q.lease_token = p_lease_token AND q.lease_expires_at > clock_timestamp()
  RETURNING q.* INTO v_task;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO radar_agent.audit_events
    (event_id, actor_type, actor_id, event_type, entity_type, entity_id, task_id, correlation_id, outcome, metadata)
  VALUES (gen_random_uuid(), 'worker', p_worker_id, 'task.heartbeat', 'task', p_task_id::text,
    p_task_id, v_task.correlation_id, 'success', jsonb_build_object('lease_seconds', p_lease_seconds));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION radar_agent.complete_task(
  p_task_id uuid, p_worker_id text, p_lease_token uuid, p_result_payload jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, radar_agent AS $$
DECLARE v_task radar_agent.task_queue%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_result_payload) IS DISTINCT FROM 'object' OR octet_length(p_result_payload::text) > 65536 THEN
    RAISE EXCEPTION 'invalid task result payload' USING ERRCODE = '22023';
  END IF;
  UPDATE radar_agent.task_queue q SET status = 'succeeded', result_payload = p_result_payload,
    lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
    completed_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE q.task_id = p_task_id AND q.status IN ('claimed', 'running') AND q.lease_owner = p_worker_id
    AND q.lease_token = p_lease_token AND q.lease_expires_at > clock_timestamp()
  RETURNING q.* INTO v_task;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO radar_agent.audit_events
    (event_id, actor_type, actor_id, event_type, entity_type, entity_id, task_id, correlation_id, outcome, metadata)
  VALUES (gen_random_uuid(), 'worker', p_worker_id, 'task.succeeded', 'task', p_task_id::text,
    p_task_id, v_task.correlation_id, 'success', jsonb_build_object('result_bytes', octet_length(p_result_payload::text)));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION radar_agent.fail_task(
  p_task_id uuid, p_worker_id text, p_lease_token uuid, p_error_code text, p_error_summary text,
  p_retry_delay_seconds integer DEFAULT 0
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, radar_agent AS $$
DECLARE v_task radar_agent.task_queue%ROWTYPE;
BEGIN
  IF p_retry_delay_seconds IS NULL OR p_retry_delay_seconds NOT BETWEEN 0 AND 3600 THEN
    RAISE EXCEPTION 'invalid retry delay' USING ERRCODE = '22023';
  END IF;
  UPDATE radar_agent.task_queue q
  SET status = CASE WHEN q.attempt_count >= q.max_attempts
        OR (q.deadline_at IS NOT NULL AND q.deadline_at <= clock_timestamp() + make_interval(secs => p_retry_delay_seconds))
        THEN 'dead_letter' ELSE 'queued' END,
      lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
      error_code = left(coalesce(p_error_code, 'WORKER_FAILED'), 100),
      error_summary = left(coalesce(p_error_summary, 'Worker reported task failure'), 2048),
      scheduled_at = clock_timestamp() + make_interval(secs => p_retry_delay_seconds),
      completed_at = CASE WHEN q.attempt_count >= q.max_attempts
        OR (q.deadline_at IS NOT NULL AND q.deadline_at <= clock_timestamp() + make_interval(secs => p_retry_delay_seconds))
        THEN clock_timestamp() ELSE NULL END,
      updated_at = clock_timestamp()
  WHERE q.task_id = p_task_id AND q.status IN ('claimed', 'running') AND q.lease_owner = p_worker_id
    AND q.lease_token = p_lease_token AND q.lease_expires_at > clock_timestamp()
  RETURNING q.* INTO v_task;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO radar_agent.audit_events
    (event_id, actor_type, actor_id, event_type, entity_type, entity_id, task_id, correlation_id, outcome, metadata)
  VALUES (gen_random_uuid(), 'worker', p_worker_id, 'task.failed', 'task', p_task_id::text,
    p_task_id, v_task.correlation_id, 'failure',
    jsonb_build_object('new_status', v_task.status, 'attempt_count', v_task.attempt_count, 'error_code', v_task.error_code));
  RETURN v_task.status;
END;
$$;

CREATE OR REPLACE FUNCTION radar_agent.request_approval(
  p_task_id uuid, p_worker_id text, p_lease_token uuid, p_action_type text, p_requested_by text,
  p_details jsonb DEFAULT '{}'::jsonb, p_expires_seconds integer DEFAULT 86400
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, radar_agent AS $$
DECLARE v_task radar_agent.task_queue%ROWTYPE; v_approval_id uuid;
BEGIN
  IF p_expires_seconds IS NULL OR p_expires_seconds NOT BETWEEN 60 AND 604800
     OR p_action_type IS NULL OR char_length(p_action_type) NOT BETWEEN 1 AND 80
     OR p_requested_by IS NULL OR char_length(p_requested_by) NOT BETWEEN 1 AND 96
     OR jsonb_typeof(p_details) IS DISTINCT FROM 'object' OR octet_length(p_details::text) > 16384 THEN
    RAISE EXCEPTION 'invalid approval request' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_task FROM radar_agent.task_queue q
  WHERE q.task_id = p_task_id AND q.status IN ('claimed', 'running') AND q.lease_owner = p_worker_id
    AND q.lease_token = p_lease_token AND q.lease_expires_at > clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO radar_agent.approval_requests
    (approval_id, task_id, action_type, requested_by, details, expires_at)
  VALUES (gen_random_uuid(), p_task_id, p_action_type, p_requested_by, p_details,
    clock_timestamp() + make_interval(secs => p_expires_seconds))
  ON CONFLICT (task_id) WHERE status = 'pending' DO NOTHING RETURNING approval_id INTO v_approval_id;
  IF v_approval_id IS NULL THEN
    SELECT a.approval_id INTO v_approval_id FROM radar_agent.approval_requests a
    WHERE a.task_id = p_task_id AND a.status = 'pending';
  END IF;
  UPDATE radar_agent.task_queue SET status = 'awaiting_approval', lease_owner = NULL, lease_token = NULL,
    lease_expires_at = NULL, heartbeat_at = NULL, updated_at = clock_timestamp() WHERE task_id = p_task_id;
  INSERT INTO radar_agent.audit_events
    (event_id, actor_type, actor_id, event_type, entity_type, entity_id, task_id, correlation_id, outcome, metadata)
  VALUES (gen_random_uuid(), 'worker', p_worker_id, 'task.awaiting_approval', 'task', p_task_id::text,
    p_task_id, v_task.correlation_id, 'pending', jsonb_build_object('approval_id', v_approval_id, 'action_type', p_action_type));
  RETURN v_approval_id;
END;
$$;

CREATE OR REPLACE FUNCTION radar_agent.resolve_approval(
  p_approval_id uuid, p_decision text, p_actor_id text, p_reason text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, radar_agent AS $$
DECLARE v_approval radar_agent.approval_requests%ROWTYPE; v_task radar_agent.task_queue%ROWTYPE; v_task_status text;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected')
     OR p_actor_id IS NULL OR char_length(p_actor_id) NOT BETWEEN 1 AND 96 THEN
    RAISE EXCEPTION 'invalid approval decision' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_approval FROM radar_agent.approval_requests a
  WHERE a.approval_id = p_approval_id AND a.status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_task FROM radar_agent.task_queue q WHERE q.task_id = v_approval.task_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_approval.expires_at <= clock_timestamp() THEN
    UPDATE radar_agent.approval_requests SET status = 'expired', reviewed_by = p_actor_id,
      reviewed_at = clock_timestamp(), decision_reason = 'Approval expired before review' WHERE approval_id = p_approval_id;
    v_task_status := 'dead_letter';
  ELSE
    UPDATE radar_agent.approval_requests SET status = p_decision, reviewed_by = p_actor_id,
      reviewed_at = clock_timestamp(), decision_reason = left(coalesce(p_reason, ''), 2048)
    WHERE approval_id = p_approval_id;
    v_task_status := CASE WHEN p_decision = 'rejected' THEN 'cancelled'
      WHEN v_task.deadline_at IS NOT NULL AND v_task.deadline_at <= clock_timestamp() THEN 'dead_letter'
      ELSE 'queued' END;
  END IF;
  UPDATE radar_agent.task_queue SET status = v_task_status,
    scheduled_at = CASE WHEN v_task_status = 'queued' THEN clock_timestamp() ELSE scheduled_at END,
    completed_at = CASE WHEN v_task_status IN ('cancelled', 'dead_letter') THEN clock_timestamp() ELSE NULL END,
    error_code = CASE WHEN v_task_status = 'dead_letter' THEN 'APPROVAL_EXPIRED_OR_DEADLINE' ELSE error_code END,
    updated_at = clock_timestamp() WHERE task_id = v_task.task_id;
  INSERT INTO radar_agent.audit_events
    (event_id, actor_type, actor_id, event_type, entity_type, entity_id, task_id, correlation_id, outcome, metadata)
  VALUES (gen_random_uuid(), 'owner', p_actor_id, 'approval.' || v_task_status, 'approval', p_approval_id::text,
    v_task.task_id, v_task.correlation_id,
    CASE WHEN v_task_status = 'queued' THEN 'allowed' WHEN v_task_status = 'cancelled' THEN 'denied' ELSE 'failure' END,
    jsonb_build_object('decision', p_decision, 'task_status', v_task_status, 'reason', left(coalesce(p_reason, ''), 512)));
  RETURN v_task_status;
END;
$$;

CREATE OR REPLACE FUNCTION radar_agent.set_platform_control(
  p_paused boolean, p_kill_switch boolean, p_actor_id text, p_reason text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, radar_agent AS $$
BEGIN
  IF p_paused IS NULL OR p_kill_switch IS NULL OR p_actor_id IS NULL
     OR char_length(p_actor_id) NOT BETWEEN 1 AND 96 OR p_reason IS NULL OR octet_length(p_reason) > 512 THEN
    RAISE EXCEPTION 'invalid platform control actor/reason' USING ERRCODE = '22023';
  END IF;
  UPDATE radar_agent.platform_control SET paused = p_paused, kill_switch = p_kill_switch,
    reason = p_reason, changed_by = p_actor_id, changed_at = clock_timestamp() WHERE singleton = true;
  INSERT INTO radar_agent.audit_events
    (event_id, actor_type, actor_id, event_type, entity_type, entity_id, outcome, metadata)
  VALUES (gen_random_uuid(), 'owner', p_actor_id, 'platform.control_changed', 'platform', 'singleton',
    'recorded', jsonb_build_object('paused', p_paused, 'kill_switch', p_kill_switch, 'reason', p_reason));
  RETURN true;
END;
$$;

REVOKE ALL ON TABLE radar_agent.platform_control, radar_agent.approval_requests
  FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;
REVOKE ALL ON FUNCTION radar_agent.prevent_dependency_cycles() FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;
REVOKE ALL ON FUNCTION radar_agent.enqueue_task(uuid,text,uuid,text,text,jsonb,text,text,text,integer,timestamptz,timestamptz,uuid) FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;
REVOKE ALL ON FUNCTION radar_agent.reclaim_expired_leases(uuid) FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;
REVOKE ALL ON FUNCTION radar_agent.claim_task(uuid,text,integer) FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;
REVOKE ALL ON FUNCTION radar_agent.heartbeat_task(uuid,text,uuid,integer) FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;
REVOKE ALL ON FUNCTION radar_agent.complete_task(uuid,text,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;
REVOKE ALL ON FUNCTION radar_agent.fail_task(uuid,text,uuid,text,text,integer) FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;
REVOKE ALL ON FUNCTION radar_agent.request_approval(uuid,text,uuid,text,text,jsonb,integer) FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;
REVOKE ALL ON FUNCTION radar_agent.resolve_approval(uuid,text,text,text) FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;
REVOKE ALL ON FUNCTION radar_agent.set_platform_control(boolean,boolean,text,text) FROM PUBLIC, anon, authenticated, service_role, radar_agent_runtime;

COMMENT ON TABLE radar_agent.platform_control IS 'Global pause and kill switch; both default enabled.';
COMMENT ON TABLE radar_agent.approval_requests IS 'Owner approval inbox; only database owner can review in v1.';
COMMENT ON FUNCTION radar_agent.claim_task(uuid,text,integer) IS 'Atomic SKIP LOCKED claim with per-agent concurrency, dependency gating, lease fencing and hard Rp0.';
COMMENT ON FUNCTION radar_agent.reclaim_expired_leases(uuid) IS 'Recovers expired worker leases; attempts are bounded by max_attempts.';
COMMIT;
