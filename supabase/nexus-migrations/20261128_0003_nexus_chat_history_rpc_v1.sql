create or replace function public.nexus_list_conversations(p_owner_subject text,p_limit integer default 20)
returns table(conversation_id uuid,title text,updated_at timestamptz)
language sql stable security definer set search_path=pg_catalog,nexus
as $$ select c.id,c.title,c.updated_at from nexus.conversations c where c.owner_subject=p_owner_subject and c.status='active' order by c.updated_at desc,c.created_at desc limit greatest(1,least(coalesce(p_limit,20),50)) $$;
revoke all on function public.nexus_list_conversations(text,integer) from public,anon,authenticated;
grant execute on function public.nexus_list_conversations(text,integer) to service_role;
create or replace function public.nexus_list_messages(p_owner_subject text,p_conversation_id uuid,p_limit integer default 100)
returns table(sequence_no bigint,role text,content text,created_at timestamptz)
language plpgsql stable security definer set search_path=pg_catalog,nexus
as $$
begin
 if p_owner_subject is null or length(trim(p_owner_subject))=0 or p_conversation_id is null then raise exception using errcode='22023',message='history_arguments_invalid'; end if;
 if not exists(select 1 from nexus.conversations c where c.id=p_conversation_id and c.owner_subject=p_owner_subject and c.status<>'deleted') then raise exception using errcode='P0002',message='conversation_not_found'; end if;
 return query select recent.sequence_no,recent.role,recent.content,recent.created_at
 from (select m.sequence_no,m.role,m.content,m.created_at from nexus.messages m where m.conversation_id=p_conversation_id order by m.sequence_no desc limit greatest(1,least(coalesce(p_limit,100),200))) recent
 order by recent.sequence_no asc;
end; $$;
revoke all on function public.nexus_list_messages(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.nexus_list_messages(text,uuid,integer) to service_role;
