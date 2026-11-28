begin;
set local role service_role;
do $$
declare v_id uuid; n integer; ok boolean;
begin
 v_id:=public.nexus_ingest_knowledge('smoke','NEXUS test','approved context','test://nexus','rev-1','{"test":true}'::jsonb,'internal');
 select count(*) into n from public.nexus_retrieve_knowledge('smoke','NEXUS',5);
 if n<>0 then raise exception 'proposed knowledge leaked into retrieval'; end if;
 ok:=public.nexus_approve_knowledge(v_id);
 if not ok then raise exception 'knowledge approval failed'; end if;
 select count(*) into n from public.nexus_retrieve_knowledge('smoke','NEXUS',5);
 if n<>1 then raise exception 'approved knowledge not retrievable'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.nexus_ingest_knowledge(text,text,text,text,text,jsonb,text)','EXECUTE') then raise exception 'anon can ingest'; end if;
 if has_function_privilege('authenticated','public.nexus_approve_knowledge(uuid)','EXECUTE') then raise exception 'authenticated can approve'; end if;
end $$;
rollback;
