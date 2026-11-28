begin;
set local role service_role;
do $$
declare v_id uuid; v_seq bigint; v_prior jsonb; v_ok boolean; v_count integer;
begin
 select conversation_id,user_sequence_no,prior_messages into v_id,v_seq,v_prior
 from public.nexus_prepare_chat('ci-owner',null,'smoke','hello');
 if v_id is null or v_seq<>1 or v_prior<>'[]'::jsonb then raise exception 'prepare failed'; end if;
 v_ok:=public.nexus_complete_chat('ci-owner',v_id,v_seq,'hello BOS');
 if not v_ok then raise exception 'complete failed'; end if;
 begin
  perform * from public.nexus_prepare_chat('wrong-owner',v_id,'bad','unauthorized');
  raise exception 'ownership guard failed';
 exception when sqlstate 'P0002' then null;
 end;
 select jsonb_array_length(prior_messages) into v_count from public.nexus_prepare_chat('ci-owner',v_id,'smoke','second');
 if v_count<>2 then raise exception 'conversation history context missing'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.nexus_prepare_chat(text,uuid,text,text)','EXECUTE') then raise exception 'anon can prepare'; end if;
 if has_function_privilege('authenticated','public.nexus_complete_chat(text,uuid,bigint,text)','EXECUTE') then raise exception 'authenticated can complete'; end if;
end $$;
rollback;
