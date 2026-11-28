-- Keep NEXUS tables private. Expose only narrow owner-scoped RPCs to the trusted Edge Function role.
create or replace function public.nexus_prepare_chat(p_owner_subject text,p_conversation_id uuid,p_title text,p_message text)
returns table(conversation_id uuid,user_sequence_no bigint,prior_messages jsonb)
language plpgsql security definer set search_path=pg_catalog,nexus
as $$
declare v_id uuid; v_seq bigint; v_prior jsonb;
begin
 if p_owner_subject is null or length(trim(p_owner_subject))=0 then raise exception using errcode='22023',message='owner_required'; end if;
 if p_message is null or length(trim(p_message))=0 or length(p_message)>12000 then raise exception using errcode='22023',message='message_invalid'; end if;
 if p_conversation_id is null then
  insert into nexus.conversations(owner_subject,title) values(p_owner_subject,left(coalesce(nullif(trim(p_title),''),'NEXUS chat'),80)) returning id into v_id;
 else
  select c.id into v_id from nexus.conversations c where c.id=p_conversation_id and c.owner_subject=p_owner_subject and c.status='active' for update;
  if v_id is null then raise exception using errcode='P0002',message='conversation_not_found'; end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('role',r.role,'content',r.content) order by r.sequence_no),'[]'::jsonb) into v_prior
 from (select m.role,m.content,m.sequence_no from nexus.messages m where m.conversation_id=v_id order by m.sequence_no desc limit 30) r;
 select coalesce(max(m.sequence_no),0)+1 into v_seq from nexus.messages m where m.conversation_id=v_id;
 insert into nexus.messages(conversation_id,sequence_no,role,content) values(v_id,v_seq,'user',p_message);
 return query select v_id,v_seq,v_prior;
end; $$;

create or replace function public.nexus_complete_chat(p_owner_subject text,p_conversation_id uuid,p_user_sequence_no bigint,p_answer text)
returns boolean language plpgsql security definer set search_path=pg_catalog,nexus
as $$
declare v_seq bigint;
begin
 if p_owner_subject is null or length(trim(p_owner_subject))=0 or p_conversation_id is null or p_user_sequence_no is null then
  raise exception using errcode='22023',message='chat_completion_arguments_invalid';
 end if;
 if p_answer is null or length(trim(p_answer))=0 or length(p_answer)>50000 then
  raise exception using errcode='22023',message='assistant_answer_invalid';
 end if;
 perform 1 from nexus.conversations c where c.id=p_conversation_id and c.owner_subject=p_owner_subject and c.status='active' for update;
 if not found then raise exception using errcode='P0002',message='conversation_not_found'; end if;
 select coalesce(max(m.sequence_no),0) into v_seq from nexus.messages m where m.conversation_id=p_conversation_id;
 if v_seq<>p_user_sequence_no then raise exception using errcode='40001',message='conversation_write_conflict'; end if;
 insert into nexus.messages(conversation_id,sequence_no,role,content) values(p_conversation_id,p_user_sequence_no+1,'assistant',p_answer);
 update nexus.conversations set updated_at=now() where id=p_conversation_id and owner_subject=p_owner_subject;
 return true;
end; $$;

revoke all on function public.nexus_prepare_chat(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.nexus_complete_chat(text,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.nexus_prepare_chat(text,uuid,text,text) to service_role;
grant execute on function public.nexus_complete_chat(text,uuid,bigint,text) to service_role;
