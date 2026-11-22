-- Disposable PostgreSQL integration smoke test for migration 001.
-- Runtime role is deliberately proposal/audit-only: no task queue read/write.
-- Runs only inside the ephemeral GitHub Actions PostgreSQL service.
CREATE ROLE radar_agent_runtime NOLOGIN;
GRANT USAGE ON SCHEMA radar_agent TO radar_agent_runtime;
GRANT SELECT ON radar_agent.agent_registry TO radar_agent_runtime;
GRANT INSERT ON radar_agent.audit_events TO radar_agent_runtime;

BEGIN;

DO $body$
BEGIN
  IF to_regclass('radar_agent.agent_registry') IS NULL
     OR to_regclass('radar_agent.task_queue') IS NULL
     OR to_regclass('radar_agent.task_dependencies') IS NULL
     OR to_regclass('radar_agent.audit_events') IS NULL THEN
    RAISE EXCEPTION 'Agent Platform migration did not create all required tables';
  END IF;
END;
$body$;

INSERT INTO radar_agent.agent_registry
  (agent_id, agent_key, display_name, division_code, role_title, created_by)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'qa-smoke-agent', 'QA Smoke Agent', '06', 'Integration Test', 'ci'),
  ('00000000-0000-4000-8000-000000000004', 'qa-procurement-agent', 'QA Procurement Agent', '08', 'Integration Test', 'ci');

INSERT INTO radar_agent.task_queue
  (task_id, task_key, task_type, title, created_by)
VALUES
  ('00000000-0000-4000-8000-000000000002', 'qa-smoke-task', 'smoke', 'Migration smoke test', 'ci');

SET ROLE radar_agent_runtime;

DO $body$
BEGIN
  IF (SELECT count(*) FROM radar_agent.agent_registry WHERE division_code = '08') <> 1 THEN
    RAISE EXCEPTION 'Division 08 registry entry is not visible';
  END IF;

  BEGIN
    PERFORM 1 FROM radar_agent.task_queue;
    RAISE EXCEPTION 'Runtime role unexpectedly read task_queue';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE radar_agent.task_queue SET status = 'failed'
     WHERE task_id = '00000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'Runtime role unexpectedly updated task_queue';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$body$;

INSERT INTO radar_agent.audit_events
  (event_id, actor_type, actor_id, event_type, entity_type, entity_id, task_id)
VALUES
  ('00000000-0000-4000-8000-000000000003', 'worker', 'ci-worker', 'task.proposed', 'task', 'qa-smoke-task',
   '00000000-0000-4000-8000-000000000002');

DO $body$
BEGIN
  BEGIN
    UPDATE radar_agent.audit_events
       SET outcome = 'failure'
     WHERE event_id = '00000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'Runtime role unexpectedly updated append-only audit event';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM radar_agent.audit_events
     WHERE event_id = '00000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'Runtime role unexpectedly deleted append-only audit event';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$body$;

RESET ROLE;

DO $body$
BEGIN
  BEGIN
    UPDATE radar_agent.audit_events SET outcome = 'failure'
     WHERE event_id = '00000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'Append-only trigger did not reject UPDATE';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  BEGIN
    DELETE FROM radar_agent.audit_events
     WHERE event_id = '00000000-0000-4000-8000-000000000003';
    RAISE EXCEPTION 'Append-only trigger did not reject DELETE';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;

  IF (SELECT count(*) FROM radar_agent.audit_events
       WHERE event_id = '00000000-0000-4000-8000-000000000003') <> 1 THEN
    RAISE EXCEPTION 'Audit event was not preserved';
  END IF;
END;
$body$;

ROLLBACK;
