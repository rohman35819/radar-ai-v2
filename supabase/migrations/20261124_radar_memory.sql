-- RADAR AI Divisi 07: provenance-first shared memory (proposal-only v1).
-- Apply only after BOS-approved Supabase project selection and backup.
BEGIN;

CREATE TABLE IF NOT EXISTS public.radar_memory_records (
  memory_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_key text NOT NULL UNIQUE CHECK (memory_key ~ '^[a-z0-9][a-z0-9._:-]{1,127}$'),
  memory_type text NOT NULL CHECK (memory_type IN ('decision', 'fact', 'policy', 'task_handoff', 'execution_result', 'knowledge')),
  scope_type text NOT NULL CHECK (scope_type IN ('project', 'division', 'agent', 'task')),
  scope_id text NOT NULL CHECK (char_length(scope_id) BETWEEN 1 AND 96),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 1000),
  content text NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 16000),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'reviewed', 'approved', 'rejected', 'superseded', 'archived')),
  sensitivity text NOT NULL DEFAULT 'internal' CHECK (sensitivity IN ('public', 'internal', 'confidential')),
  source_type text NOT NULL CHECK (source_type IN ('github', 'owner_instruction', 'external')),
  source_ref text NOT NULL CHECK (char_length(source_ref) BETWEEN 1 AND 512),
  source_revision text NOT NULL CHECK (char_length(source_revision) BETWEEN 1 AND 128),
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 96),
  reviewed_by text,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  valid_from timestamptz,
  valid_until timestamptz,
  retention_until timestamptz NOT NULL,
  supersedes_memory_id uuid REFERENCES public.radar_memory_records(memory_id) ON DELETE RESTRICT,
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  task_id uuid,
  artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(artifact_refs) = 'array' AND jsonb_array_length(artifact_refs) <= 20),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'C')
  ) STORED,
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CHECK (status <> 'approved' OR (reviewed_by IS NOT NULL AND approved_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS radar_memory_scope_status_idx
  ON public.radar_memory_records (scope_type, scope_id, status, sensitivity, created_at DESC);
CREATE INDEX IF NOT EXISTS radar_memory_search_idx
  ON public.radar_memory_records USING gin (search_vector);

CREATE OR REPLACE FUNCTION public.radar_memory_require_proposal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'proposed' OR NEW.reviewed_by IS NOT NULL OR NEW.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'memory records may only be created as proposals' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS radar_memory_proposal_only ON public.radar_memory_records;
CREATE TRIGGER radar_memory_proposal_only
  BEFORE INSERT ON public.radar_memory_records
  FOR EACH ROW EXECUTE FUNCTION public.radar_memory_require_proposal();

ALTER TABLE public.radar_memory_records ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO service_role;
REVOKE ALL ON TABLE public.radar_memory_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.radar_memory_records TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.radar_memory_records FROM service_role;

COMMENT ON TABLE public.radar_memory_records IS
  'Divisi 07 shared memory v1. Proposal-only; service-role backend access, no public client access, no approval/update API yet.';
COMMENT ON COLUMN public.radar_memory_records.source_revision IS
  'Exact Git commit, document revision, or dated external source revision; required for provenance.';

COMMIT;
