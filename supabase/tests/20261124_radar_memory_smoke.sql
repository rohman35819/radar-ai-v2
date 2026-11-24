-- Disposable PostgreSQL 16 smoke test for Divisi 07 memory migration.
-- Roles and migration are prepared by the GitHub Actions workflow before this file runs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'radar_memory_records' AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'RLS is not enabled'; END IF;

  IF has_table_privilege('anon', 'public.radar_memory_records', 'SELECT')
     OR has_table_privilege('authenticated', 'public.radar_memory_records', 'SELECT') THEN
    RAISE EXCEPTION 'Public roles unexpectedly have memory read access';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.radar_memory_records', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.radar_memory_records', 'INSERT')
     OR has_table_privilege('service_role', 'public.radar_memory_records', 'UPDATE')
     OR has_table_privilege('service_role', 'public.radar_memory_records', 'DELETE')
     OR has_table_privilege('service_role', 'public.radar_memory_records', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Service role memory privileges are not least-privilege';
  END IF;
END $$;

SET ROLE service_role;
INSERT INTO public.radar_memory_records
  (memory_key, memory_type, scope_type, scope_id, title, summary, content, source_type, source_ref, source_revision, created_by, retention_until)
VALUES
  ('qa-memory-provenance-01', 'decision', 'project', 'radar-ai-v2',
   'Provenance required', 'All durable records require provenance.',
   'Approved knowledge must be scoped and traceable.',
   'github', 'https://github.com/rohman35819/radar-ai-v2/issues/82',
   'test-revision-1', 'ci', now() + interval '365 days');
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.radar_memory_records WHERE memory_key = 'qa-memory-provenance-01') THEN
    RAISE EXCEPTION 'service_role cannot read its inserted proposal';
  END IF;
  BEGIN
    UPDATE public.radar_memory_records SET status = 'approved' WHERE memory_key = 'qa-memory-provenance-01';
    RAISE EXCEPTION 'service_role unexpectedly updated memory status';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.radar_memory_records
    WHERE memory_key = 'qa-memory-provenance-01'
      AND search_vector @@ plainto_tsquery('simple', 'provenance traceable')
  ) THEN RAISE EXCEPTION 'Generated full-text search vector is missing'; END IF;

  BEGIN
    INSERT INTO public.radar_memory_records
      (memory_key, memory_type, scope_type, scope_id, title, summary, content, status, source_type, source_ref, source_revision, created_by, retention_until)
    VALUES ('qa-memory-approved-02', 'fact', 'project', 'radar-ai-v2',
      'Must remain proposal', 'Direct approved insertion is forbidden.',
      'The insert trigger should reject this row.', 'approved', 'github',
      'https://github.com/rohman35819/radar-ai-v2/issues/82', 'test-revision-2', 'ci', now() + interval '365 days');
    RAISE EXCEPTION 'Approved memory insertion unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.radar_memory_records
      (memory_key, memory_type, scope_type, scope_id, title, summary, content, source_type, source_ref, created_by, retention_until)
    VALUES ('qa-memory-no-revision-03', 'fact', 'project', 'radar-ai-v2',
      'Missing revision', 'This must fail.',
      'Source revision is mandatory.', 'github',
      'https://github.com/rohman35819/radar-ai-v2/issues/82', 'ci', now() + interval '365 days');
    RAISE EXCEPTION 'Missing source revision unexpectedly succeeded';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
END $$;
