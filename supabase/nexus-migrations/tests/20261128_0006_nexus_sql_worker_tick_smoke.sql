-- Disposable smoke for NEXUS SQL worker behavior and proposal-only Stage 1.
begin;
do $$
declare
  v_id uuid;
  v_result jsonb;
  v_status text;
  v_doc uuid;
  v_approval text;
  v_input jsonb;
begin
  -- Default-off controls must prevent claims.
  v_id:=public.nexus_enqueue_task('system.healthcheck','sql-worker-smoke','disabled-healthcheck','{}',100::smallint);
  v_result:=public.nexus_sql_worker_tick();
  if v_result->>'worked'='true' then raise exception 'disabled worker processed a task'; end if;
  select status into v_status from nexus.tasks where id=v_id;
  if v_status<>'queued' then raise exception 'disabled worker changed queued task status'; end if;

  -- Stage 0: healthcheck only.
  perform public.nexus_set_runtime_controls(true,false,false,0::smallint,1::smallint,0::numeric,'smoke-operator','stage 0 healthcheck test');
  v_result:=public.nexus_sql_worker_tick();
  if v_result->>'succeeded'<>'true' or v_result->>'task_type'<>'system.healthcheck' then
    raise exception 'Stage 0 healthcheck failed: %',v_result;
  end if;
  select status into v_status from nexus.tasks where id=v_id;
  if v_status<>'succeeded' then raise exception 'healthcheck task not finalized'; end if;

  -- Stage 1: ingest creates a proposal only; no auto-approval.
  perform public.nexus_set_runtime_controls(true,false,false,1::smallint,1::smallint,0::numeric,'smoke-operator','stage 1 proposal-only test');
  v_input:=jsonb_build_object(
    'namespace','shared',
    'title','NEXUS SQL worker smoke proposal',
    'content','This deterministic worker smoke creates a proposed knowledge document and must never auto-approve it.',
    'source_uri','https://example.invalid/nexus-sql-worker-smoke',
    'source_revision','smoke-0006',
    'provenance',jsonb_build_object('source_type','smoke','test','sql-worker'),
    'sensitivity','internal'
  );
  v_id:=public.nexus_enqueue_task('knowledge.ingest','sql-worker-smoke','stage1-ingest',v_input::text,100::smallint);
  v_result:=public.nexus_sql_worker_tick();
  if v_result->>'succeeded'<>'true' or v_result->>'task_type'<>'knowledge.ingest' then
    raise exception 'Stage 1 ingest failed: %',v_result;
  end if;
  select id,approval_status into v_doc,v_approval from nexus.knowledge_documents where title='NEXUS SQL worker smoke proposal' order by created_at desc limit 1;
  if v_doc is null or v_approval<>'proposed' then raise exception 'knowledge ingest was not left proposed'; end if;

  -- knowledge.approve is never claimable, even at Stage 1.
  v_id:=public.nexus_enqueue_task('knowledge.approve','sql-worker-smoke','approval-must-stay-queued','{}',100::smallint);
  v_result:=public.nexus_sql_worker_tick();
  if v_result->>'worked'='true' then raise exception 'worker claimed forbidden knowledge.approve task'; end if;
  select status into v_status from nexus.tasks where id=v_id;
  if v_status<>'queued' then raise exception 'forbidden approval task was modified'; end if;
end
$$;
rollback;
