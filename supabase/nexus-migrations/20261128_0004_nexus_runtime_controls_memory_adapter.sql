-- NEXUS P2: fail-closed runtime controls and scoped memory retrieval.
-- Additive only. Worker remains disabled, paused and kill-switched by default.
begin;

create table if not exists nexus.runtime_controls (
  id boolean primary key default true check (id = true),
  worker_enabled boolean not null default false,
  paused boolean not null default true,
  kill_switch boolean not null default true,
  daily_budget_usd numeric(12,4) not null default 0 check (daily_budget_usd = 0),
  max_concurrency smallint not null default 1 check (max_concurrency between 0 and 1),
  autonomy_stage smallint not null default 0 check (autonomy_stage in (0,1)),
  updated_by text not null default 'migration',
  reason text not null default 'fail-closed default',
  updated_at timestamptz not null default now()
);
insert into nexus.runtime_controls(id) values (true) on conflict (id) do nothing;
alter table nexus.runtime_controls enable row level security;
alter table nexus.runtime_controls force row level security;
revoke all on table nexus.runtime_controls from public, anon, authenticated, service_role;
comment on table nexus.runtime_controls is 'Private fail-closed NEXUS worker controls. Default disabled, paused, kill-switched and Rp0.';

alter table nexus.memory_records add column if not exists scope_id text;
alter table nexus.memory_records add column if not exists retention_until timestamptz;
alter table nexus.memory_records add column if not exists verified_at timestamptz;
alter table nexus.memory_records add column if not exists confidence numeric(4,3);
alter table nexus.memory_records add column if not exists provenance jsonb not null default '{}'::jsonb;
alter table nexus.memory_records add column if not exists approved_by text;
alter table nexus.memory_records add column if not exists approved_at timestamptz;
alter table nexus.memory_records drop constraint if exists memory_records_scope_check;
alter table nexus.memory_records add constraint memory_records_scope_check
  check (scope = any(array['user','project','division','agent','task']::text[]));
alter table nexus.memory_records drop constraint if exists memory_records_confidence_check;
alter table nexus.memory_records add constraint memory_records_confidence_check
  check (confidence is null or confidence between 0 and 1);
alter table nexus.memory_records drop constraint if exists memory_records_provenance_check;
alter table nexus.memory_records add constraint memory_records_provenance_check
  check (jsonb_typeof(provenance) = 'object');
alter table nexus.memory_records drop constraint if exists memory_records_approved_metadata_check;
alter table nexus.memory_records add constraint memory_records_approved_metadata_check
  check (approval_status <> 'approved' or (approved_by is not null and approved_at is not null and verified_at is not null));
create index if not exists memory_owner_scope_id_active_idx
  on nexus.memory_records(owner_subject,scope,scope_id,valid_from desc)
  where approval_status='approved';
create index if not exists memory_retention_idx
  on nexus.memory_records(retention_until)
  where retention_until is not null;
create index if not exists memory_source_revision_idx
  on nexus.memory_records(source_ref,source_revision);
create index if not exists memory_content_fts_idx
  on nexus.memory_records using gin (to_tsvector('simple',content))
  where approval_status='approved';

create or replace function public.nexus_claim_task(p_worker text,p_lease_seconds integer default 60)
returns setof nexus.tasks
language plpgsql
security definer
set search_path=pg_catalog,nexus
as $function$
declare
  v_controls nexus.runtime_controls%rowtype;
  v_active integer;
begin
  if p_worker is null or length(trim(p_worker))=0 then raise exception 'worker id required'; end if;
  select * into v_controls from nexus.runtime_controls where id=true for update;
  if not found then return; end if;
  if not v_controls.worker_enabled or v_controls.paused or v_controls.kill_switch
     or v_controls.daily_budget_usd is distinct from 0::numeric
     or v_controls.max_concurrency < 1
     or v_controls.autonomy_stage not in (0,1) then
    return;
  end if;

  update nexus.tasks
     set status=case when attempt_count < max_attempts then 'queued' else 'dead_letter' end,
         lease_owner=null,lease_expires_at=null,available_at=now(),updated_at=now()
   where status in ('claimed','running') and lease_expires_at <= now();

  select count(*) into v_active
    from nexus.tasks
   where status in ('claimed','running') and lease_expires_at > now();
  if v_active >= v_controls.max_concurrency then return; end if;

  return query
  with picked as (
    select t.id
      from nexus.tasks t
     where t.status='queued'
       and t.available_at<=now()
       and t.attempt_count<t.max_attempts
       and (
         (v_controls.autonomy_stage=0 and t.task_type='system.healthcheck' and t.autonomy_stage='observe')
         or
         (v_controls.autonomy_stage=1 and t.task_type in ('system.healthcheck','knowledge.ingest')
          and t.autonomy_stage in ('observe','propose'))
       )
     order by t.priority desc,t.available_at,t.created_at
     for update skip locked
     limit 1
  )
  update nexus.tasks t
     set status='claimed',
         lease_owner=p_worker,
         lease_expires_at=now()+make_interval(secs=>greatest(15,least(coalesce(p_lease_seconds,60),300))),
         fencing_token=t.fencing_token+1,
         attempt_count=t.attempt_count+1,
         updated_at=now()
    from picked
   where t.id=picked.id
  returning t.*;
end
$function$;
revoke all on function public.nexus_claim_task(text,integer) from public,anon,authenticated;
grant execute on function public.nexus_claim_task(text,integer) to service_role;

create or replace function public.nexus_set_runtime_controls(
  p_worker_enabled boolean,
  p_paused boolean,
  p_kill_switch boolean,
  p_autonomy_stage smallint,
  p_max_concurrency smallint,
  p_daily_budget_usd numeric,
  p_actor text,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,nexus
as $function$
begin
  if p_worker_enabled is null or p_paused is null or p_kill_switch is null
     or p_daily_budget_usd is distinct from 0::numeric
     or p_autonomy_stage is null or p_autonomy_stage not in (0,1)
     or p_max_concurrency is null or p_max_concurrency not between 0 and 1
     or p_actor is null or length(trim(p_actor))=0
     or p_reason is null or length(trim(p_reason))=0 then
    raise exception 'invalid runtime control request';
  end if;
  if p_worker_enabled and (p_paused or p_kill_switch or p_max_concurrency<>1) then
    raise exception 'worker cannot be enabled while paused, kill-switched or concurrency is not one';
  end if;
  update nexus.runtime_controls
     set worker_enabled=p_worker_enabled,paused=p_paused,kill_switch=p_kill_switch,
         autonomy_stage=p_autonomy_stage,max_concurrency=p_max_concurrency,
         daily_budget_usd=0,updated_by=left(p_actor,128),reason=left(p_reason,500),updated_at=now()
   where id=true;
  if not found then raise exception 'runtime controls row missing'; end if;
  insert into nexus.audit_events(actor_type,actor_id,action,entity_type,entity_id,outcome,correlation_id,metadata)
  values('operator',left(p_actor,128),'runtime_controls.update','runtime_controls','singleton','success',
         gen_random_uuid()::text,
         jsonb_build_object('worker_enabled',p_worker_enabled,'paused',p_paused,'kill_switch',p_kill_switch,
           'autonomy_stage',p_autonomy_stage,'max_concurrency',p_max_concurrency,'daily_budget_usd',0,'reason',left(p_reason,500)));
  return true;
end
$function$;
revoke all on function public.nexus_set_runtime_controls(boolean,boolean,boolean,smallint,smallint,numeric,text,text) from public,anon,authenticated;
grant execute on function public.nexus_set_runtime_controls(boolean,boolean,boolean,smallint,smallint,numeric,text,text) to service_role;

create or replace function public.nexus_propose_memory(
  p_owner_subject text,
  p_memory_type text,
  p_content text,
  p_scope text,
  p_scope_id text,
  p_sensitivity text,
  p_source_ref text,
  p_source_revision text default null,
  p_provenance jsonb default '{}'::jsonb,
  p_valid_from timestamptz default now(),
  p_valid_until timestamptz default null,
  p_retention_until timestamptz default null,
  p_confidence numeric default null
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,nexus
as $function$
declare
  v_id uuid;
  v_valid_from timestamptz := coalesce(p_valid_from,now());
begin
  if p_owner_subject is null or length(trim(p_owner_subject)) not between 1 and 256
     or p_memory_type is null or length(trim(p_memory_type)) not between 1 and 64
     or p_content is null or length(trim(p_content)) not between 1 and 8000
     or p_scope is null or p_scope not in ('user','project','division','agent','task')
     or p_scope_id is null or length(trim(p_scope_id)) not between 1 and 128
     or p_sensitivity is null or p_sensitivity not in ('public','internal','confidential')
     or p_source_ref is null or length(trim(p_source_ref)) not between 1 and 2048
     or (p_source_revision is not null and length(p_source_revision)>128)
     or jsonb_typeof(coalesce(p_provenance,'{}'::jsonb)) <> 'object'
     or p_content ~* '(api[_ -]?key\\s*[:=]\\s*\\S+|password\\s*[:=]\\s*\\S+|secret\\s*[:=]\\s*\\S+|authorization\\s*[:=]\\s*bearer\\s+\\S+|private[_ -]?key\\s*[:=]\\s*\\S+|mnemonic\\s*[:=]\\s*\\S+|seed phrase\\s*[:=]\\s*\\S+)'
     or coalesce(p_provenance::text,'') ~* '"(api[_-]?key|password|secret|token|private[_-]?key|mnemonic|seed|authorization|cookie|credential)"\\s*:'
     or (p_valid_until is not null and p_valid_until<=v_valid_from)
     or (p_retention_until is not null and p_retention_until<=now())
     or (p_confidence is not null and p_confidence not between 0 and 1) then
    raise exception 'invalid memory proposal';
  end if;
  if p_scope='user' and p_owner_subject<>p_scope_id then raise exception 'user memory owner/scope mismatch'; end if;
  if p_scope='project' and p_owner_subject<>'project:'||p_scope_id then raise exception 'project memory owner/scope mismatch'; end if;

  insert into nexus.memory_records(owner_subject,memory_type,content,scope,sensitivity,approval_status,
    source_ref,source_revision,valid_from,valid_until,scope_id,retention_until,confidence,provenance)
  values(p_owner_subject,p_memory_type,p_content,p_scope,p_sensitivity,'proposed',p_source_ref,p_source_revision,
    v_valid_from,p_valid_until,p_scope_id,p_retention_until,p_confidence,coalesce(p_provenance,'{}'::jsonb))
  returning id into v_id;

  insert into nexus.audit_events(actor_type,actor_id,action,entity_type,entity_id,outcome,correlation_id,metadata)
  values('service','nexus-memory-ingest','memory.propose','memory_record',v_id::text,'success',
    gen_random_uuid()::text,jsonb_build_object('scope',p_scope,'scope_id',p_scope_id,'sensitivity',p_sensitivity,'source_revision',p_source_revision));
  return v_id;
end
$function$;
revoke all on function public.nexus_propose_memory(text,text,text,text,text,text,text,text,jsonb,timestamptz,timestamptz,timestamptz,numeric) from public,anon,authenticated;
grant execute on function public.nexus_propose_memory(text,text,text,text,text,text,text,text,jsonb,timestamptz,timestamptz,timestamptz,numeric) to service_role;

create or replace function public.nexus_approve_memory(p_id uuid,p_approved_by text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,nexus
as $function$
begin
  if p_id is null or p_approved_by is null or length(trim(p_approved_by)) not between 1 and 128
     or lower(p_approved_by) like 'agent:%' or lower(p_approved_by) like 'worker:%' then
    raise exception 'invalid memory approver';
  end if;
  update nexus.memory_records
     set approval_status='approved',approved_by=left(p_approved_by,128),
         approved_at=now(),verified_at=now(),updated_at=now()
   where id=p_id and approval_status='proposed'
     and (valid_until is null or valid_until>now())
     and (retention_until is null or retention_until>now());
  if not found then return false; end if;
  insert into nexus.audit_events(actor_type,actor_id,action,entity_type,entity_id,outcome,correlation_id,metadata)
  values('operator',left(p_approved_by,128),'memory.approve','memory_record',p_id::text,'success',
    gen_random_uuid()::text,'{}'::jsonb);
  return true;
end
$function$;
revoke all on function public.nexus_approve_memory(uuid,text) from public,anon,authenticated;
grant execute on function public.nexus_approve_memory(uuid,text) to service_role;

create or replace function public.nexus_retrieve_memory(
  p_owner_subject text,
  p_scope text,
  p_scope_id text,
  p_query text default '',
  p_limit integer default 5,
  p_include_confidential boolean default false
) returns table(
  id uuid,memory_type text,content text,scope text,scope_id text,sensitivity text,
  source_ref text,source_revision text,verified_at timestamptz,confidence numeric,provenance jsonb
)
language sql
stable
security definer
set search_path=pg_catalog,nexus
as $function$
  with query_terms as (
    select string_agg(plainto_tsquery('simple',token)::text,' | ') as tsquery
      from (
        select distinct token
          from regexp_split_to_table(lower(coalesce(p_query,'')),'[^[:alnum:]]+') as split(token)
         where length(token)>=3
           and token <> all(array[
             'what','when','where','which','who','whom','why','how','did','does','the','and','for','with','from','about',
             'our','your','you','we','they','them','this','that','these','those','are','was','were','is','be','been',
             'have','has','had','can','could','would','should','will','shall','not','but','if','or','as','at','by',
             'in','into','of','on','to','an','its','their','there','then','than','did','does','what','when','where',
             'yang','untuk','dengan','apa','bagaimana','kapan','dimana','kenapa','mengapa','dari','dan','atau',
             'saya','kamu','sudah','belum','ini','itu','dalam','pada','bisa','tidak','ada','kita'
           ]::text[])
      ) terms
  )
  select m.id,m.memory_type,m.content,m.scope,m.scope_id,m.sensitivity,m.source_ref,m.source_revision,
         m.verified_at,m.confidence,m.provenance
    from nexus.memory_records m
   where p_owner_subject is not null and p_scope is not null and p_scope_id is not null
     and m.owner_subject=p_owner_subject
     and m.scope=p_scope
     and m.scope_id=p_scope_id
     and m.approval_status='approved'
     and m.valid_from<=now()
     and (m.valid_until is null or m.valid_until>now())
     and (m.retention_until is null or m.retention_until>now())
     and (m.sensitivity in ('public','internal') or (p_include_confidential and p_scope='user' and m.sensitivity='confidential'))
     and (
       coalesce(p_query,'')=''
       or ((select tsquery from query_terms) is not null
           and to_tsvector('simple',m.content) @@ ((select tsquery from query_terms)::tsquery))
     )
   order by m.verified_at desc nulls last,m.confidence desc nulls last,m.updated_at desc
   limit greatest(1,least(coalesce(p_limit,5),20))
$function$;
revoke all on function public.nexus_retrieve_memory(text,text,text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.nexus_retrieve_memory(text,text,text,text,integer,boolean) to service_role;

commit;
