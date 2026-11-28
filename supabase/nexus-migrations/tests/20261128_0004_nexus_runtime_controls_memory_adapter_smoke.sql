-- Disposable PostgreSQL smoke for NEXUS runtime controls and memory adapter.
begin;
do $$
declare
  c nexus.runtime_controls%rowtype;
  t nexus.tasks%rowtype;
  v_id uuid;
  n integer;
begin
  select * into c from nexus.runtime_controls where id=true;
  if not found or c.worker_enabled or not c.paused or not c.kill_switch or c.daily_budget_usd<>0 or c.max_concurrency<>1 or c.autonomy_stage<>0 then
    raise exception 'runtime controls must default disabled/paused/kill-switched/Rp0';
  end if;

  insert into nexus.tasks(task_type,requested_by,status,priority,autonomy_stage,idempotency_key,max_attempts)
  values
    ('system.healthcheck','nexus-p2-smoke','queued',100,'observe','p2-healthcheck',1),
    ('knowledge.ingest','nexus-p2-smoke','queued',90,'propose','p2-ingest',1),
    ('knowledge.approve','nexus-p2-smoke','queued',80,'propose','p2-approve',1);

  select * into t from public.nexus_claim_task('smoke-disabled',60);
  if found then raise exception 'disabled worker claimed a task'; end if;

  perform public.nexus_set_runtime_controls(true,false,false,0::smallint,1::smallint,0::numeric,'smoke-operator','stage 0 smoke');
  select * into t from public.nexus_claim_task('smoke-stage0',60);
  if not found or t.task_type<>'system.healthcheck' then raise exception 'stage 0 must claim healthcheck only'; end if;
  select count(*) into n from public.nexus_claim_task('smoke-concurrency',60);
  if n<>0 then raise exception 'max concurrency 1 was not enforced'; end if;
  perform public.nexus_finish_task(t.id,'smoke-stage0',t.fencing_token,true,'ok',null);

  select * into t from public.nexus_claim_task('smoke-stage0-after',60);
  if found then raise exception 'stage 0 claimed ingest or approval task'; end if;

  perform public.nexus_set_runtime_controls(true,false,false,1::smallint,1::smallint,0::numeric,'smoke-operator','stage 1 smoke');
  select * into t from public.nexus_claim_task('smoke-stage1',60);
  if not found or t.task_type<>'knowledge.ingest' then raise exception 'stage 1 must claim proposal-only ingest'; end if;
  perform public.nexus_finish_task(t.id,'smoke-stage1',t.fencing_token,true,'proposed:smoke',null);
  select * into t from public.nexus_claim_task('smoke-no-approval',60);
  if found then raise exception 'worker claimed knowledge approval task'; end if;

  perform public.nexus_set_runtime_controls(false,true,true,0::smallint,1::smallint,0::numeric,'smoke-operator','restore fail-closed defaults');
  select count(*) into n from public.nexus_claim_task('smoke-killswitch',60);
  if n<>0 then raise exception 'kill switch failed to deny task claims'; end if;

  v_id := public.nexus_propose_memory('project:radar-ai-v2','project_policy',
    'RADAR AI V2 uses free-tier services only with a hard Rp0 budget.','project','radar-ai-v2','internal',
    'https://github.com/rohman35819/radar-ai-v2/blob/main/AGENTS.md','smoke-r1',
    jsonb_build_object('test',true),now(),null,null,0.99);
  select count(*) into n from public.nexus_retrieve_memory('project:radar-ai-v2','project','radar-ai-v2','Rp0',5,false);
  if n<>0 then raise exception 'proposed memory must not be retrievable'; end if;
  if not public.nexus_approve_memory(v_id,'chief-strategy-advisor') then raise exception 'memory approval failed'; end if;
  select count(*) into n from public.nexus_retrieve_memory('project:radar-ai-v2','project','radar-ai-v2','Rp0',5,false);
  if n<>1 then raise exception 'approved project memory not retrievable'; end if;
  select count(*) into n from public.nexus_retrieve_memory('other-project','project','radar-ai-v2','Rp0',5,false);
  if n<>0 then raise exception 'memory owner isolation failed'; end if;

  v_id := public.nexus_propose_memory('user-smoke','private_preference',
    'Smoke-only confidential memory.','user','user-smoke','confidential',
    'https://example.invalid/smoke','smoke-user-r1','{}'::jsonb,now(),null,null,0.9);
  perform public.nexus_approve_memory(v_id,'chief-strategy-advisor');
  select count(*) into n from public.nexus_retrieve_memory('user-smoke','user','user-smoke','confidential',5,false);
  if n<>0 then raise exception 'confidential memory leaked without owner-scoped opt-in'; end if;
  select count(*) into n from public.nexus_retrieve_memory('user-smoke','user','user-smoke','confidential',5,true);
  if n<>1 then raise exception 'owner-scoped confidential memory not retrievable'; end if;
  update nexus.memory_records set retention_until=now()-interval '1 second' where id=v_id;
  select count(*) into n from public.nexus_retrieve_memory('user-smoke','user','user-smoke','confidential',5,true);
  if n<>0 then raise exception 'expired memory remained retrievable'; end if;

  if has_function_privilege('anon','public.nexus_retrieve_memory(text,text,text,text,integer,boolean)','EXECUTE')
     or has_function_privilege('authenticated','public.nexus_retrieve_memory(text,text,text,text,integer,boolean)','EXECUTE')
     or has_function_privilege('anon','public.nexus_set_runtime_controls(boolean,boolean,boolean,smallint,smallint,numeric,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.nexus_set_runtime_controls(boolean,boolean,boolean,smallint,smallint,numeric,text,text)','EXECUTE') then
    raise exception 'private NEXUS RPC executable by browser roles';
  end if;
  if has_table_privilege('anon','nexus.runtime_controls','SELECT') or has_table_privilege('authenticated','nexus.runtime_controls','SELECT') then
    raise exception 'runtime controls table accessible to browser roles';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='nexus.runtime_controls'::regclass) then
    raise exception 'runtime controls RLS is not forced';
  end if;
end
$$;
rollback;
