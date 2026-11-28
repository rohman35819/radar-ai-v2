begin;
create or replace function public.nexus_ingest_knowledge(p_namespace text,p_title text,p_body text,p_source_uri text,p_source_revision text default null,p_provenance jsonb default '{}'::jsonb,p_sensitivity text default 'internal')
returns uuid language plpgsql security definer set search_path=pg_catalog,nexus as $$
declare v_id uuid;
begin
 if p_namespace is null or length(trim(p_namespace))=0 or length(p_namespace)>120 then raise exception 'invalid namespace'; end if;
 if p_title is null or length(trim(p_title))=0 or length(p_title)>500 then raise exception 'invalid title'; end if;
 if p_body is null or length(p_body)=0 or length(p_body)>200000 then raise exception 'invalid body'; end if;
 if p_source_uri is null or length(trim(p_source_uri))=0 or length(p_source_uri)>2048 then raise exception 'source_uri required'; end if;
 if p_sensitivity not in ('public','internal','confidential') then raise exception 'invalid sensitivity'; end if;
 if jsonb_typeof(coalesce(p_provenance,'{}'::jsonb))<>'object' then raise exception 'provenance must be object'; end if;
 insert into nexus.knowledge_documents(namespace,title,body,source_uri,source_revision,provenance,sensitivity,approval_status)
 values(p_namespace,p_title,p_body,p_source_uri,p_source_revision,coalesce(p_provenance,'{}'::jsonb),p_sensitivity,'proposed') returning id into v_id;
 return v_id;
end $$;
revoke all on function public.nexus_ingest_knowledge(text,text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.nexus_ingest_knowledge(text,text,text,text,text,jsonb,text) to service_role;
create or replace function public.nexus_retrieve_knowledge(p_namespace text,p_query text,p_limit integer default 5)
returns table(id uuid,title text,body text,source_uri text,source_revision text,provenance jsonb,sensitivity text,published_at timestamptz)
language sql stable security definer set search_path=pg_catalog,nexus as $$
 select d.id,d.title,d.body,d.source_uri,d.source_revision,d.provenance,d.sensitivity,d.published_at
 from nexus.knowledge_documents d where d.namespace=p_namespace and d.approval_status='approved'
 and (d.expires_at is null or d.expires_at>now())
 and (p_query is null or p_query='' or d.title ilike '%'||p_query||'%' or d.body ilike '%'||p_query||'%')
 order by d.published_at desc nulls last,d.created_at desc limit greatest(1,least(coalesce(p_limit,5),20))
$$;
revoke all on function public.nexus_retrieve_knowledge(text,text,integer) from public,anon,authenticated;
grant execute on function public.nexus_retrieve_knowledge(text,text,integer) to service_role;
create or replace function public.nexus_approve_knowledge(p_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,nexus as $$
begin update nexus.knowledge_documents set approval_status='approved',published_at=now(),updated_at=now() where id=p_id and approval_status='proposed'; return found; end $$;
revoke all on function public.nexus_approve_knowledge(uuid) from public,anon,authenticated;
grant execute on function public.nexus_approve_knowledge(uuid) to service_role;
create or replace function public.nexus_enqueue_task(p_task_type text,p_requested_by text,p_idempotency_key text,p_input_ref text default null,p_priority smallint default 0)
returns uuid language plpgsql security definer set search_path=pg_catalog,nexus as $$
declare v_id uuid;
begin
 if p_task_type not in ('knowledge.ingest','knowledge.approve','system.healthcheck') then raise exception 'task type not allowlisted'; end if;
 if p_requested_by is null or p_idempotency_key is null then raise exception 'requester and idempotency key required'; end if;
 insert into nexus.tasks(task_type,requested_by,idempotency_key,input_ref,priority)
 values(p_task_type,p_requested_by,p_idempotency_key,p_input_ref,greatest(-100,least(100,coalesce(p_priority,0))))
 on conflict(requested_by,idempotency_key) do update set updated_at=now() returning id into v_id;
 return v_id;
end $$;
revoke all on function public.nexus_enqueue_task(text,text,text,text,smallint) from public,anon,authenticated;
grant execute on function public.nexus_enqueue_task(text,text,text,text,smallint) to service_role;
commit;
