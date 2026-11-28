-- Disposable smoke for private scheduled-worker token validation.
begin;
do $$
declare v_token text:=repeat('a',64); v_other text:=repeat('b',64);
begin
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='nexus.worker_tokens'::regclass) then
    raise exception 'worker token table RLS is not forced';
  end if;
  if has_table_privilege('anon','nexus.worker_tokens','SELECT')
     or has_table_privilege('authenticated','nexus.worker_tokens','SELECT')
     or has_table_privilege('service_role','nexus.worker_tokens','SELECT') then
    raise exception 'worker token hashes directly accessible';
  end if;
  if has_function_privilege('anon','public.nexus_validate_worker_token(text)','EXECUTE')
     or has_function_privilege('authenticated','public.nexus_validate_worker_token(text)','EXECUTE')
     or not has_function_privilege('service_role','public.nexus_validate_worker_token(text)','EXECUTE')
     or not has_function_privilege('service_role','public.nexus_set_worker_token(text,text)','EXECUTE') then
    raise exception 'worker token RPC grants incorrect';
  end if;
  if not public.nexus_set_worker_token(v_token,'smoke-operator') then raise exception 'token set failed'; end if;
  if not public.nexus_validate_worker_token(v_token) then raise exception 'valid token rejected'; end if;
  if public.nexus_validate_worker_token(v_other) then raise exception 'invalid token accepted'; end if;
  update nexus.worker_tokens set enabled=false where id=true;
  if public.nexus_validate_worker_token(v_token) then raise exception 'disabled token accepted'; end if;
end
$$;
rollback;
