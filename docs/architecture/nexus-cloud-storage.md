# RADAR NEXUS Cloud Storage — Foundation v1

Status: **repository proposal only; not deployed, not connected to a production database**.
Owner decision (2026-11-27): permanent NEXUS data belongs in cloud, not on BOS's Android/Termux device. Phone storage must remain minimal. Rp0/free-only policy remains mandatory.

## Goal and invariants

- Termux is a thin client. It may contain the executable, minimal non-secret connection settings, and bounded disposable cache only.
- Cloud is the source of truth for sessions, message history, task state, approved knowledge/memory and audit events.
- No persistent fallback to local files. If cloud storage is unavailable, writes fail visibly; the client must not silently save locally.
- Do not download repository clones, datasets, or large artifacts to the phone when cloud execution is available.
- No service-role key, database password, provider key, or exchange secret in the CLI, browser, Git, or logs.
- A user-scoped authenticated API is mandatory before exposing session data. Never trust an owner_ref supplied by an unauthenticated client.
- GitHub remains the source of truth for source code, policy, durable engineering decisions and reviewed documentation; it is not an operational chat database.

## Existing repository capabilities found on main

- `lib/ingest.js` already has a server-side Supabase REST adapter for the single `radar_state` row using `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (legacy alias supported). When Supabase config exists, the app loads/saves remote state; without it, it falls back to `DATA_DIR/state.json`.
- That fallback is suitable for the existing RADAR dashboard only if configured deliberately; it is **not acceptable as NEXUS permanent storage** under the BOS cloud-only decision.
- `supabase/migrations/20261124_radar_memory.sql` defines proposal-only `radar_memory_records`; it is not proof the migration has been applied or a Supabase project is configured.
- No verified NEXUS session API/authentication, no confirmed Supabase project/database, and no verified cloud deployment were found in this audit.
- Railway project `RADAR AI V2 - Development` exists, but its app service and persistent volume are staged-create, with 17 staged changes and no deployment. No apply/deploy was performed. Railway resources must not be activated without checking cost/free eligibility and BOS approval.

## Target architecture

```
Termux NEXUS CLI / RADAR Dashboard Chat
             |
       HTTPS + user auth
             |
      NEXUS Core API
       /     |      \
 Session   Memory   Task State
 Store     Store    Store
       \     |      /
      Supabase/Postgres
   (existing approved free project only)
```

- CLI and Dashboard Chat are clients of the same NEXUS Core API.
- API authenticates the user, derives the owner identity server-side, validates payload sizes, rate limits requests and writes with least privilege.
- Server-side database credential only. Never ship service-role credentials to clients.
- Messages use sequence numbers per session; task records are durable state only and do not activate workers.
- Knowledge/memory uses provenance and approval state; teacher/provider output is untrusted until verified.
- Add backup/restore and retention policy before production use.

## Migration added in this branch

`supabase/migrations/20261127_nexus_cloud_storage.sql` proposes:
- `nexus_sessions`: session metadata and owner reference.
- `nexus_session_messages`: bounded, ordered message records.
- `nexus_task_state`: durable task state; not an active queue/worker.
- RLS enabled, client roles denied, service-role server access only, bounded payload sizes, no delete grant.

This migration is **not applied**. It uses owner_ref as a placeholder until the existing app authentication model is verified; API must derive it from a verified identity, not accept arbitrary client input. Review cascade retention, privacy, export/deletion and backup policy before applying.

## Delivery sequence

1. Confirm existing Supabase project, free-tier eligibility, region, ownership and backups without exposing secrets.
2. Verify current app authentication and define stable server-side owner identity.
3. Review and apply the migration only after explicit BOS approval.
4. Implement authenticated NEXUS Core session APIs and cloud-only storage adapter; no local fallback for NEXUS data.
5. Integrate both CLI and Dashboard Chat with the same API contract.
6. Add tests for cross-user isolation, auth denial, oversized payload, ordering/idempotency, timeout, unavailable DB, retry and no-local-fallback.
7. Verify recovery from a second device / clean Termux install before claiming cloud-only.
8. Only then plan deploy; no paid resource and no live worker activation.

## Acceptance gates

- No persistent NEXUS user data under Termux home, app cache, or phone filesystem.
- With cloud unavailable, the CLI clearly reports unsaved state and does not write a local copy.
- User A cannot read or write User B sessions.
- Reinstall/clean-device login restores sessions from cloud.
- Dashboard Chat and CLI show the same session state through one API.
- Secrets absent from client bundle, logs, Git and error responses.
- Tests and independent Security/QA review pass.
- Cloud provider and all resources confirmed Rp0/free before activation.

## Current blockers

- Supabase project and free-tier status not verified; no project selected/approved.
- Auth identity integration not yet audited end-to-end.
- Migration not applied.
- NEXUS Core session API and clients not yet implemented.
- Railway staged resources are untouched; no deployment is claimed.
- PR creation deferred because repository already exceeds the normal non-draft PR WIP limit.

Next: Divisi 01 verify auth + Supabase project; Divisi 07 review schema/privacy/retention; Divisi 06 define Core API contract. Keep this branch isolated until WIP capacity is freed.
