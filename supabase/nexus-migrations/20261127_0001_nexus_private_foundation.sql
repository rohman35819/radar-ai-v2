-- RADAR NEXUS private database foundation.
-- Source of truth for the NEXUS project; CI applies this only to disposable PostgreSQL.
begin;
create schema if not exists nexus;
revoke all on schema nexus from public, anon, authenticated;
comment on schema nexus is 'Private RADAR NEXUS application data; not exposed through the public Data API.';
create table nexus.conversations (
 id uuid primary key default gen_random_uuid(), owner_subject text not null, title text,
 status text not null default 'active' check (status in ('active','archived','deleted')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 check ((status='archived')=(archived_at is not null))
);
create table nexus.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references nexus.conversations(id) on delete cascade,
 sequence_no bigint not null check(sequence_no>0), role text not null check(role in ('system','user','assistant','tool')),
 content text not null, content_format text not null default 'text' check(content_format in ('text','json','markdown')),
 idempotency_key text, created_at timestamptz not null default now(),
 unique(conversation_id,sequence_no), unique(conversation_id,idempotency_key)
);
create table nexus.memory_records (
 id uuid primary key default gen_random_uuid(), owner_subject text not null, memory_type text not null, content text not null,
 scope text not null check(scope in ('user','project','division','task')),
 sensitivity text not null default 'internal' check(sensitivity in ('public','internal','confidential')),
 approval_status text not null default 'proposed' check(approval_status in ('proposed','approved','rejected','superseded')),
 source_ref text not null, source_revision text, valid_from timestamptz not null default now(), valid_until timestamptz,
 supersedes_id uuid references nexus.memory_records(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(valid_until is null or valid_until>valid_from), check(supersedes_id is null or supersedes_id<>id)
);
create table nexus.knowledge_documents (
 id uuid primary key default gen_random_uuid(), namespace text not null, title text not null, body text not null, source_uri text not null,
 source_revision text, provenance jsonb not null default '{}'::jsonb check(jsonb_typeof(provenance)='object'),
 approval_status text not null default 'proposed' check(approval_status in ('proposed','approved','rejected','superseded')),
 sensitivity text not null default 'internal' check(sensitivity in ('public','internal','confidential')),
 published_at timestamptz, expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(expires_at is null or published_at is null or expires_at>published_at)
);
create table nexus.skills (
 id uuid primary key default gen_random_uuid(), name text not null, version text not null, description text not null default '',
 source_revision text not null, status text not null default 'proposed' check(status in ('proposed','approved','disabled','deprecated')),
 permission_profile_id text, created_at timestamptz not null default now(), unique(name,version)
);
create table nexus.agents (
 id uuid primary key default gen_random_uuid(), division_code text not null check(division_code ~ '^0[1-8]$'), name text not null,
 version text not null, status text not null default 'disabled' check(status in ('proposed','approved','disabled','retired')),
 capability_manifest jsonb not null default '{}'::jsonb check(jsonb_typeof(capability_manifest)='object'),
 permission_profile_id text, prompt_revision text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(division_code,name,version)
);
create table nexus.tasks (
 id uuid primary key default gen_random_uuid(), task_type text not null, requested_by text not null,
 assigned_agent_id uuid references nexus.agents(id) on delete restrict,
 status text not null default 'queued' check(status in ('queued','claimed','running','succeeded','failed','cancelled','dead_letter')),
 priority smallint not null default 0 check(priority between -100 and 100),
 autonomy_stage text not null default 'observe' check(autonomy_stage in ('observe','propose','approved_execute')),
 input_ref text, output_ref text, idempotency_key text not null, attempt_count integer not null default 0 check(attempt_count>=0),
 max_attempts integer not null default 1 check(max_attempts between 1 and 10), available_at timestamptz not null default now(),
 deadline_at timestamptz, lease_owner text, lease_expires_at timestamptz, fencing_token bigint not null default 0 check(fencing_token>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(requested_by,idempotency_key), check(deadline_at is null or deadline_at>created_at),
 check((status in ('claimed','running'))=(lease_owner is not null and lease_expires_at is not null))
);
create table nexus.task_dependencies (
 task_id uuid not null references nexus.tasks(id) on delete cascade, depends_on_task_id uuid not null references nexus.tasks(id) on delete restrict,
 created_at timestamptz not null default now(), primary key(task_id,depends_on_task_id), check(task_id<>depends_on_task_id)
);
create table nexus.evaluations (
 id uuid primary key default gen_random_uuid(), agent_id uuid references nexus.agents(id) on delete set null,
 task_id uuid references nexus.tasks(id) on delete set null, evaluator text not null, rubric_version text not null,
 score jsonb not null default '{}'::jsonb check(jsonb_typeof(score)='object'),
 verdict text not null check(verdict in ('pass','fail','inconclusive')), evidence_ref text not null,
 created_at timestamptz not null default now(), check(agent_id is not null or task_id is not null)
);
create table nexus.audit_events (
 id uuid primary key default gen_random_uuid(), actor_type text not null, actor_id text not null, action text not null,
 entity_type text not null, entity_id text, outcome text not null check(outcome in ('success','denied','failure')),
 correlation_id text not null, metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'), created_at timestamptz not null default now()
);
create index conversations_owner_updated_idx on nexus.conversations(owner_subject,updated_at desc);
create index messages_conversation_created_idx on nexus.messages(conversation_id,created_at);
create index memory_owner_scope_status_idx on nexus.memory_records(owner_subject,scope,approval_status,valid_until);
create index knowledge_namespace_status_idx on nexus.knowledge_documents(namespace,approval_status,sensitivity,published_at desc);
create index tasks_runnable_idx on nexus.tasks(available_at,priority desc) where status='queued';
create index tasks_agent_status_idx on nexus.tasks(assigned_agent_id,status);
create index audit_created_idx on nexus.audit_events(created_at desc);
create index audit_correlation_idx on nexus.audit_events(correlation_id);
do $$ declare t text; begin foreach t in array array['conversations','messages','memory_records','knowledge_documents','skills','agents','tasks','task_dependencies','evaluations','audit_events'] loop
 execute format('alter table nexus.%I enable row level security',t);
 execute format('alter table nexus.%I force row level security',t);
 execute format('revoke all on table nexus.%I from public,anon,authenticated',t);
end loop; end $$;
commit;
