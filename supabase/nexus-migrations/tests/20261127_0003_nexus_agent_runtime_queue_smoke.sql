begin;
set local role service_role;
do $$
declare v_id uuid; v_claim record; ok boolean;
begin
 v_id:=public.nexus_enqueue_task('system.healthcheck','ci-smoke','nexus-ci-smoke',null,0::smallint);
 if v_id is distinct from public.nexus_enqueue_task('system.healthcheck','ci-smoke','nexus-ci-smoke',null,0::smallint) then raise exception 'idempotency failed'; end if;
 select * into v_claim from public.nexus_claim_task('ci-worker',60);
 if v_claim.id is distinct from v_id or v_claim.fencing_token<>1 then raise exception 'claim/fencing failed'; end if;
 ok:=public.nexus_finish_task(v_id,'ci-worker',v_claim.fencing_token,true,'ok',null);
 if not ok then raise exception 'finish failed'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.nexus_claim_task(text,integer)','EXECUTE') then raise exception 'anon can claim'; end if;
 if has_function_privilege('authenticated','public.nexus_finish_task(uuid,text,bigint,boolean,text,text)','EXECUTE') then raise exception 'authenticated can finish'; end if;
end $$;
rollback;
