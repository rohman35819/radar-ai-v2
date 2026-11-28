begin;
create or replace function public.nexus_claim_task(p_worker text,p_lease_seconds integer default 60)
returns setof nexus.tasks language plpgsql security definer set search_path=pg_catalog,nexus as $$
begin
 if p_worker is null or length(trim(p_worker))=0 then raise exception 'worker id required'; end if;
 return query with picked as (
  select t.id from nexus.tasks t where t.status='queued' and t.available_at<=now() and t.attempt_count<t.max_attempts
  order by t.priority desc,t.available_at,t.created_at for update skip locked limit 1
 )
 update nexus.tasks t set status='claimed',lease_owner=p_worker,
 lease_expires_at=now()+make_interval(secs=>greatest(15,least(coalesce(p_lease_seconds,60),300))),
 fencing_token=t.fencing_token+1,attempt_count=t.attempt_count+1,updated_at=now()
 from picked where t.id=picked.id returning t.*;
end $$;
revoke all on function public.nexus_claim_task(text,integer) from public,anon,authenticated;
grant execute on function public.nexus_claim_task(text,integer) to service_role;
create or replace function public.nexus_finish_task(p_id uuid,p_worker text,p_fencing_token bigint,p_success boolean,p_output_ref text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog,nexus as $$
begin
 update nexus.tasks set status=case when p_success then 'succeeded' else case when attempt_count<max_attempts then 'queued' else 'dead_letter' end end,
 output_ref=case when p_success then p_output_ref else left(coalesce(p_error,'worker failed'),2000) end,
 lease_owner=null,lease_expires_at=null,updated_at=now()
 where id=p_id and lease_owner=p_worker and fencing_token=p_fencing_token and status in ('claimed','running');
 return found;
end $$;
revoke all on function public.nexus_finish_task(uuid,text,bigint,boolean,text,text) from public,anon,authenticated;
grant execute on function public.nexus_finish_task(uuid,text,bigint,boolean,text,text) to service_role;
commit;
