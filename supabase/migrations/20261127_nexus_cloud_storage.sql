-- RADAR NEXUS Cloud Storage foundation v1.
-- Proposal only: do not apply until BOS selects/approves the Supabase project,
-- confirms backup/retention, and reviews the authentication integration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.nexus_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_ref text NOT NULL CHECK (char_length(owner_ref) BETWEEN 1 AND 128),
  title text NOT NULL DEFAULT 'New NEXUS session' CHECK (char_length(title) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
  client_kind text NOT NULL DEFAULT 'cli' CHECK (client_kind IN ('cli', 'dashboard', 'api')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nexus_sessions_owner_activity_idx
  ON public.nexus_sessions (owner_ref, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS public.nexus_session_messages (
  message_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.nexus_sessions(session_id) ON DELETE CASCADE,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content text NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 64000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 8000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS nexus_messages_session_sequence_idx
  ON public.nexus_session_messages (session_id, sequence_no);

CREATE TABLE IF NOT EXISTS public.nexus_task_state (
  task_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_ref text NOT NULL CHECK (char_length(owner_ref) BETWEEN 1 AND 128),
  session_id uuid REFERENCES public.nexus_sessions(session_id) ON DELETE SET NULL,
  task_type text NOT NULL CHECK (char_length(task_type) BETWEEN 1 AND 96),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16000),
  result jsonb CHECK (result IS NULL OR (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 16000)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nexus_task_owner_status_idx
  ON public.nexus_task_state (owner_ref, status, created_at DESC);

ALTER TABLE public.nexus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_session_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_task_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nexus_sessions, public.nexus_session_messages, public.nexus_task_state FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.nexus_sessions TO service_role;
GRANT SELECT, INSERT ON public.nexus_session_messages TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.nexus_task_state TO service_role;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.nexus_sessions, public.nexus_session_messages, public.nexus_task_state FROM service_role;

COMMENT ON TABLE public.nexus_sessions IS 'Cloud-persisted NEXUS session metadata; accessed only by authenticated server-side service.';
COMMENT ON TABLE public.nexus_session_messages IS 'Cloud-persisted NEXUS session messages; never store provider secrets or credentials in content/metadata.';
COMMENT ON TABLE public.nexus_task_state IS 'Durable NEXUS task state only; not an enabled worker queue or authorization to execute tasks.';

COMMIT;
