-- NEXUS private worker token registry for authenticated scheduled invocation.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists nexus.worker_tokens (
  id boolean primary key default true check (id=true),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  enabled boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table nexus.worker_tokens enable row level security;
alter table nexus.worker_tokens force row level security;
revoke all on table nexus.worker_tokens from public,anon,authenticated,service_role;
comment on table nexus.worker_tokens is 'Private hash-only allowlist for the NEXUS scheduled worker bearer token. Plain token lives only in Supabase Vault.';

create or replace function public.nexus_set_worker_token(p_token text,p_actor text)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,nexus,extensions
as $function$
begin
  if p_token is null or length(p_token)<>64 or p_token !~ '^[0-9a-f]{64}$'
     or p_actor is null or length(trim(p_actor)) not between 1 and 128 then
    raise exception 'invalid worker token rotation request';
  end if;
  insert into nexus.worker_tokens(id,token_hash,enabled,created_by,created_at,updated_at)
  values(true,encode(extensions.digest(p_token,'sha256'),'hex'),true,left(p_actor,128),now(),now())
  on conflict(id) do update set token_hash=excluded.token_hash,enabled=true,created_by=excluded.created_by,updated_at=now();
  insert into nexus.audit_events(actor_type,actor_id,action,entity_type,entity_id,outcome,correlation_id,metadata)
  values('operator',left(p_actor,128),'worker_token.rotate','worker_token','singleton','success',
    gen_random_uuid()::text,jsonb_build_object('hash_algorithm','sha256','enabled',true));
  return true;
end
$function$;
revoke all on function public.nexus_set_worker_token(text,text) from public,anon,authenticated;
grant execute on function public.nexus_set_worker_token(text,text) to service_role;

create or replace function public.nexus_validate_worker_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,nexus,extensions
as $function$
  select coalesce(
    p_token is not null and length(p_token)=64 and p_token ~ '^[0-9a-f]{64}$'
    and exists(
      select 1 from nexus.worker_tokens w
       where w.id=true and w.enabled
         and w.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    ),false)
$function$;
revoke all on function public.nexus_validate_worker_token(text) from public,anon,authenticated;
grant execute on function public.nexus_validate_worker_token(text) to service_role;
commit;
