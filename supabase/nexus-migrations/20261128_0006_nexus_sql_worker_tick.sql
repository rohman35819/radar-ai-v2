-- Deterministic NEXUS SQL worker. Runtime controls remain the hard admission gate.
begin;

create or replace function public.nexus_sql_worker_tick()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,nexus
as $function$
declare
  v_task nexus.tasks%rowtype;
  v_input jsonb;
  v_document_id uuid;
  v_success boolean:=false;
  v_output text:='';
  v_error text:=null;
  v_finalized boolean:=false;
begin
  select * into v_task from public.nexus_claim_task('nexus-sql-cron',60);
  if not found then
    return jsonb_build_object('worked',false,'reason','queue_empty_or_disabled');
  end if;

  begin
    if v_task.task_type='system.healthcheck' then
      v_success:=true;
      v_output:='NEXUS SQL worker healthcheck OK';
    elsif v_task.task_type='knowledge.ingest' then
      v_input:=coalesce(nullif(v_task.input_ref,''),'{}')::jsonb;
      v_document_id:=public.nexus_ingest_knowledge(
        p_namespace=>v_input->>'namespace',
        p_title=>v_input->>'title',
        p_body=>v_input->>'content',
        p_source_uri=>v_input->>'source_uri',
        p_source_revision=>v_input->>'source_revision',
        p_provenance=>coalesce(v_input->'provenance','{}'::jsonb),
        p_sensitivity=>coalesce(v_input->>'sensitivity','internal')
      );
      v_success:=true;
      v_output:='proposed:'||v_document_id::text;
    else
      raise exception 'task_type_not_allowed';
    end if;
  exception when others then
    v_success:=false;
    v_error:=left(sqlerrm,500);
    v_output:=v_error;
  end;

  v_finalized:=public.nexus_finish_task(
    p_id=>v_task.id,
    p_worker=>'nexus-sql-cron',
    p_fencing_token=>v_task.fencing_token,
    p_success=>v_success,
    p_output_ref=>case when v_success then v_output else null end,
    p_error=>case when v_success then null else v_error end
  );

  return jsonb_build_object(
    'worked',true,'task_id',v_task.id,'task_type',v_task.task_type,
    'succeeded',v_success,'finalized',v_finalized,'detail',v_output
  );
end
$function$;

revoke all on function public.nexus_sql_worker_tick() from public,anon,authenticated,service_role;
comment on function public.nexus_sql_worker_tick() is 'Cron-only deterministic worker. Processes healthcheck and proposal-only knowledge.ingest tasks; nexus_claim_task enforces runtime_controls and autonomy stage.';

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if not exists(select 1 from cron.job where jobname='nexus-sql-worker-tick') then
      perform cron.schedule('nexus-sql-worker-tick','*/5 * * * *','select public.nexus_sql_worker_tick();');
    end if;
  end if;
end
$$;

commit;
