begin;
set local role service_role;
do $$
declare v_id uuid; v_seq bigint; v_prior jsonb; v_ok boolean; v_count integer; v_list integer;
begin
 select conversation_id,user_sequence_no,prior_messages into v_id,v_seq,v_prior from public.nexus_prepare_chat('history-test-owner',null,'history test','first message');
 v_ok:=public.nexus_complete_chat('history-test-owner',v_id,v_seq,'first answer');
 if not v_ok then raise exception 'seed conversation failed'; end if;
 select count(*) into v_list from public.nexus_list_conversations('history-test-owner',20);
 if v_list<>1 then raise exception 'conversation list ownership failed'; end if;
 select count(*) into v_count from public.nexus_list_messages('history-test-owner',v_id,100);
 if v_count<>2 then raise exception 'message history count failed'; end if;
 begin perform * from public.nexus_list_messages('other-owner',v_id,100); raise exception 'history ownership guard failed';
 exception when sqlstate 'P0002' then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.nexus_list_conversations(text,integer)','EXECUTE') then raise exception 'anon can list conversations'; end if;
 if has_function_privilege('authenticated','public.nexus_list_messages(text,uuid,integer)','EXECUTE') then raise exception 'authenticated can read history'; end if;
end $$;
rollback;
