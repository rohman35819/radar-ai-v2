-- Disposable PostgreSQL 16 integration tests for transactional Agent Platform queue operations.
BEGIN;
INSERT INTO radar_agent.agent_registry
  (agent_id, agent_key, display_name, division_code, role_title, status, autonomy_stage, created_by)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'queue-test-agent', 'Queue Test Agent', '06', 'Queue Test', 'active', 1, 'ci'),
  ('10000000-0000-4000-8000-000000000002', 'queue-dependency-agent', 'Dependency Test Agent', '07', 'Dependency Test', 'active', 1, 'ci');
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM radar_agent.platform_control
    WHERE singleton=true AND paused=true AND kill_switch=true
  ) THEN
    RAISE EXCEPTION 'Agent Platform must start paused with kill switch enabled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM radar_agent.claim_task(
      '10000000-0000-4000-8000-000000000001', 'worker-before-enable', 60
    )
  ) THEN
    RAISE EXCEPTION 'Queue claimed a task while platform defaults were disabled';
  END IF;
  IF has_function_privilege('service_role','radar_agent.set_platform_control(boolean,boolean,text,text)','EXECUTE')
     OR has_function_privilege('radar_agent_runtime','radar_agent.set_platform_control(boolean,boolean,text,text)','EXECUTE')
     OR has_table_privilege('service_role','radar_agent.platform_control','UPDATE')
     OR has_table_privilege('radar_agent_runtime','radar_agent.platform_control','UPDATE') THEN
    RAISE EXCEPTION 'Runtime role can change global pause/kill-switch controls';
  END IF;
END $;
UPDATE radar_agent.platform_control SET paused=false,kill_switch=false,reason='CI only',changed_by='ci' WHERE singleton=true;
DO $$
DECLARE e record; d record; t radar_agent.task_queue%ROWTYPE; a uuid; s text; old_token uuid; new_token uuid;
        dependent uuid:='10000000-0000-4000-8000-000000000010'; prerequisite uuid:='10000000-0000-4000-8000-000000000011';
BEGIN
  SELECT * INTO e FROM radar_agent.enqueue_task('10000000-0000-4000-8000-000000000003','queue-idem',
    '10000000-0000-4000-8000-000000000001','test','Idempotency task','{}','ci','director','queue-idem-1',80,now(),NULL,NULL);
  IF e.deduplicated OR e.task_id<>'10000000-0000-4000-8000-000000000003' THEN RAISE EXCEPTION 'initial enqueue failed'; END IF;
  SELECT * INTO d FROM radar_agent.enqueue_task('10000000-0000-4000-8000-000000000004','queue-idem-duplicate',
    '10000000-0000-4000-8000-000000000001','test','Duplicate task','{}','ci','director','queue-idem-1',50,now(),NULL,NULL);
  IF NOT d.deduplicated OR d.task_id<>e.task_id THEN RAISE EXCEPTION 'idempotency failed'; END IF;

  SELECT * INTO t FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000001','worker-a',60);
  IF t.task_id<>e.task_id OR t.attempt_count<>1 OR t.lease_token IS NULL THEN RAISE EXCEPTION 'claim failed'; END IF;
  old_token:=t.lease_token;
  IF EXISTS(SELECT 1 FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000001','worker-b',60)) THEN RAISE EXCEPTION 'concurrency limit failed'; END IF;
  IF NOT radar_agent.heartbeat_task(t.task_id,'worker-a',old_token,90) THEN RAISE EXCEPTION 'heartbeat failed'; END IF;
  s:=radar_agent.fail_task(t.task_id,'worker-a',old_token,'TEST_RETRY','first attempt',0);
  IF s<>'queued' THEN RAISE EXCEPTION 'retry requeue failed'; END IF;
  SELECT * INTO t FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000001','worker-a',60);
  IF t.attempt_count<>2 OR NOT radar_agent.complete_task(t.task_id,'worker-a',t.lease_token,'{"ok":true}') THEN RAISE EXCEPTION 'retry completion failed'; END IF;

  SELECT * INTO e FROM radar_agent.enqueue_task('10000000-0000-4000-8000-000000000005','queue-stale',
    '10000000-0000-4000-8000-000000000001','test','Stale lease','{}','ci','director','queue-stale',50,now(),NULL,NULL);
  SELECT * INTO t FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000001','worker-a',60);
  old_token:=t.lease_token;
  UPDATE radar_agent.task_queue SET lease_expires_at=now()-interval '1 second' WHERE task_id=t.task_id;
  IF radar_agent.reclaim_expired_leases('10000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'lease reclaim failed'; END IF;
  SELECT * INTO t FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000001','worker-b',60);
  new_token:=t.lease_token;
  IF new_token IS NULL OR new_token=old_token THEN RAISE EXCEPTION 'fencing token not rotated'; END IF;
  IF radar_agent.complete_task(t.task_id,'worker-a',old_token,'{"stale":true}') THEN RAISE EXCEPTION 'stale token accepted'; END IF;
  IF NOT radar_agent.complete_task(t.task_id,'worker-b',new_token,'{"recovered":true}') THEN RAISE EXCEPTION 'new token rejected'; END IF;

  SELECT * INTO e FROM radar_agent.enqueue_task('10000000-0000-4000-8000-000000000006','queue-approval',
    '10000000-0000-4000-8000-000000000001','test','Approval task','{}','ci','director','queue-approval',50,now(),NULL,NULL);
  SELECT * INTO t FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000001','worker-a',60);
  a:=radar_agent.request_approval(t.task_id,'worker-a',t.lease_token,'production-change','worker-a','{"reason":"sensitive"}',3600);
  IF a IS NULL OR (SELECT status FROM radar_agent.task_queue WHERE task_id=t.task_id)<>'awaiting_approval' THEN RAISE EXCEPTION 'approval request failed'; END IF;
  IF radar_agent.resolve_approval(a,'approved','bos-test','CI approval')<>'queued' THEN RAISE EXCEPTION 'approval resolution failed'; END IF;
  SELECT * INTO t FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000001','worker-a',60);
  IF NOT radar_agent.complete_task(t.task_id,'worker-a',t.lease_token,'{"approved":true}') THEN RAISE EXCEPTION 'approved task completion failed'; END IF;

  SELECT * INTO e FROM radar_agent.enqueue_task('10000000-0000-4000-8000-000000000007','queue-retry-cap',
    '10000000-0000-4000-8000-000000000001','test','Retry cap','{}','ci','director','queue-retry-cap',50,now(),NULL,NULL);
  UPDATE radar_agent.task_queue SET max_attempts=2 WHERE task_id=e.task_id;
  SELECT * INTO t FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000001','worker-a',60);
  s:=radar_agent.fail_task(t.task_id,'worker-a',t.lease_token,'TEST','first',0);
  IF s<>'queued' THEN RAISE EXCEPTION 'first retry failed'; END IF;
  SELECT * INTO t FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000001','worker-a',60);
  s:=radar_agent.fail_task(t.task_id,'worker-a',t.lease_token,'TEST','second',0);
  IF s<>'dead_letter' THEN RAISE EXCEPTION 'dead letter cap failed'; END IF;

  INSERT INTO radar_agent.task_queue(task_id,task_key,agent_id,task_type,title,created_by)
  VALUES(dependent,'queue-dependent','10000000-0000-4000-8000-000000000002','test','Dependent','ci'),
        (prerequisite,'queue-prerequisite','10000000-0000-4000-8000-000000000002','test','Prerequisite','ci');
  INSERT INTO radar_agent.task_dependencies(task_id,depends_on_task_id) VALUES(dependent,prerequisite);
  BEGIN
    INSERT INTO radar_agent.task_dependencies(task_id,depends_on_task_id) VALUES(prerequisite,dependent);
    RAISE EXCEPTION 'cycle unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  SELECT * INTO t FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000002','worker-dep',60);
  IF t.task_id<>prerequisite THEN RAISE EXCEPTION 'dependency was bypassed'; END IF;
  IF NOT radar_agent.complete_task(t.task_id,'worker-dep',t.lease_token,'{"done":true}') THEN RAISE EXCEPTION 'prerequisite completion failed'; END IF;
  SELECT * INTO t FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000002','worker-dep',60);
  IF t.task_id<>dependent OR NOT radar_agent.complete_task(t.task_id,'worker-dep',t.lease_token,'{"done":true}') THEN RAISE EXCEPTION 'dependent task did not unblock'; END IF;

  UPDATE radar_agent.platform_control SET kill_switch=true,paused=false,reason='kill-switch smoke' WHERE singleton=true;
  INSERT INTO radar_agent.task_queue(task_id,task_key,agent_id,task_type,title,created_by)
  VALUES('10000000-0000-4000-8000-000000000008','queue-kill-switch','10000000-0000-4000-8000-000000000001','test','Kill switch','ci');
  IF EXISTS(SELECT 1 FROM radar_agent.claim_task('10000000-0000-4000-8000-000000000001','worker-a',60)) THEN RAISE EXCEPTION 'kill switch failed'; END IF;

  IF has_function_privilege('radar_agent_runtime','radar_agent.claim_task(uuid,text,integer)','EXECUTE')
     OR has_function_privilege('service_role','radar_agent.claim_task(uuid,text,integer)','EXECUTE')
     OR has_table_privilege('radar_agent_runtime','radar_agent.task_queue','UPDATE')
     OR has_table_privilege('radar_agent_runtime','radar_agent.approval_requests','SELECT') THEN RAISE EXCEPTION 'runtime privilege leak'; END IF;
  IF (SELECT count(*) FROM radar_agent.audit_events WHERE task_id IN
    ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005',
     '10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000007'))<10 THEN
    RAISE EXCEPTION 'task transitions not audited'; END IF;
END $$;
ROLLBACK;
