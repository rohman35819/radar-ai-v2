-- Disposable PostgreSQL smoke test for the NEXUS private foundation.
-- Run as database owner after applying 20261127_0001_nexus_private_foundation.sql.
do $$
declare
  table_count integer;
  bad_rls integer;
  policy_count integer;
begin
  select count(*) into table_count
  from information_schema.tables
  where table_schema = 'nexus' and table_type = 'BASE TABLE';
  if table_count <> 10 then
    raise exception 'expected 10 nexus tables, found %', table_count;
  end if;

  select count(*) into bad_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'nexus' and c.relkind = 'r'
    and (not c.relrowsecurity or not c.relforcerowsecurity);
  if bad_rls <> 0 then
    raise exception 'RLS is not enabled+forced on % table(s)', bad_rls;
  end if;

  select count(*) into policy_count
  from pg_policies where schemaname = 'nexus';
  if policy_count <> 0 then
    raise exception 'expected default-deny with zero policies; found %', policy_count;
  end if;

  if has_schema_privilege('anon', 'nexus', 'USAGE')
     or has_schema_privilege('authenticated', 'nexus', 'USAGE') then
    raise exception 'anon/authenticated unexpectedly have nexus schema USAGE';
  end if;

  if has_table_privilege('anon', 'nexus.conversations', 'SELECT')
     or has_table_privilege('authenticated', 'nexus.conversations', 'SELECT')
     or has_table_privilege('anon', 'nexus.messages', 'INSERT')
     or has_table_privilege('authenticated', 'nexus.messages', 'INSERT') then
    raise exception 'anon/authenticated unexpectedly have table privileges';
  end if;

  if not has_table_privilege(current_user, 'nexus.conversations', 'SELECT') then
    raise exception 'migration owner should retain owner access for verification';
  end if;
end
$$;

-- Check the intended lifecycle and key uniqueness constraints exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'nexus.tasks'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%fencing_token%'
  ) then
    raise exception 'task fencing-token constraint missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'nexus.messages'::regclass and contype = 'u'
  ) then
    raise exception 'message uniqueness constraint missing';
  end if;
end
$$;
