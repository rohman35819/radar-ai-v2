-- RADAR AI V2 persistent state (Supabase Postgres)
-- Run once in Supabase SQL Editor for the existing project.
create table if not exists public.radar_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.radar_state enable row level security;
revoke all on table public.radar_state from anon, authenticated;
grant all on table public.radar_state to service_role;
