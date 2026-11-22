# RADAR AI Agent Platform — Schema Foundation and Runtime Gate

Date: 2026-11-22 (Asia/Jakarta)
Status: SCHEMA-ONLY foundation. No production DB, queue service, scheduler, or worker is active.
Budget: Rp0 hard ceiling until BOS explicitly changes the policy.

## Decision
- Keep the existing Hostless V2 dashboard/API unchanged.
- Store provider-neutral Agent Registry, Task Queue, dependencies and Audit Events schema in this repository.
- Use only an ephemeral PostgreSQL 16 service container inside GitHub Actions to validate the migration and role boundary.
- Do not provision Hostless managed PostgreSQL, a worker, Neon, Redis, or any other external resource until the existing account proves a zero-cost allowance and no-overage protection. That information is not available from repository access.
- GitHub Actions remains CI only; it is not an always-on task consumer.
- No production migration is run by this PR. The SQL migration is applied only to the disposable CI database.

## Schema contract (migration 001)
- radar_agent.agent_registry: stable identity, division 01–08, version, status, capabilities, tool allowlist, permission policy and autonomy stage.
- radar_agent.task_queue: durable task envelope, priority, schedule/deadline, idempotency, bounded attempts, lease/heartbeat and result/error metadata.
- radar_agent.task_dependencies: prerequisite edges. Cycle detection is deferred to the future transactional queue service.
- radar_agent.audit_events: append-only event history with a trigger rejecting UPDATE/DELETE. No cryptographic hash chain is claimed or implemented.

## Hard limits for the Rp0 Stage 0/1 pilot
- Agents default to paused; autonomy stage is limited to 0–1.
- division_code accepts 01–08.
- max_concurrency = 1; daily_budget_usd = 0; max_attempts is capped at 3.
- Task input/result payloads are capped at 64 KiB; audit metadata at 16 KiB; descriptions and policy metadata are bounded.
- IDs are supplied by application code; no PostgreSQL extension is required.
- Never put API keys, authorization headers, raw exchange payloads, or secrets in task/audit metadata.

## CI-only runtime role smoke test
The ephemeral radar_agent_runtime role is deliberately read-only observer-only:
- USAGE on schema and SELECT on registry.
- No INSERT/UPDATE/DELETE/TRUNCATE on audit events; only the database owner/service can record audit until a trusted actor-bound SECURITY DEFINER function is implemented.
- No SELECT/INSERT/UPDATE/DELETE on task_queue or dependencies.
- No UPDATE/DELETE on audit events; the append-only trigger is also tested under the table owner.

This is not a production worker role and cannot claim, execute, or write audit events. Direct audit INSERT is withheld to prevent forged actor_type/actor_id. A later queue service must use trusted actor-bound SECURITY DEFINER functions and transactional claim/lease operations; do not grant blanket UPDATE on task_queue.

## Deferred runtime components
- DB adapter/connection pool and TLS configuration
- Transactional enqueue/claim/heartbeat/complete/retry/dead-letter API
- FOR UPDATE SKIP LOCKED, lease fencing and stale-lease recovery
- Dependency cycle detection
- Scheduler, orchestrator, worker process, monitoring and resource manager
- Human approval queue, kill switch and budget enforcement
- Shared knowledge/decision memory and retention
- Hostless deployment or persistent production database

## Acceptance gates before any worker
1. Confirm a genuinely no-cost database/worker allowance and overage protection in the existing account; otherwise stop.
2. Add DB adapter behind a disabled feature flag; validate TLS, bounded pool, graceful shutdown and connection limits.
3. Implement atomic task claim/lease fencing/idempotency/retry/dead-letter and cycle-safe dependencies.
4. Ensure worker cannot read arbitrary tasks or update policy; use RLS or security-definer functions with fixed search_path and narrow EXECUTE grants.
5. Prove task state transitions and audit writes occur in the same transaction; audit remains immutable for runtime role.
6. Implement approval queue, kill switch, task/token/time caps and safe recovery.
7. Test concurrent double-claim, crash/restart, stale leases, retries, dependencies, secret redaction and failure injection.
8. Divisi 01 security review and Divisi 05 independent QA pass.
9. One Stage 0/1 read-only/propose-only pilot completes with actual cost still Rp0.
10. BOS explicitly approves any production provisioning or migration.

## Current evidence
- CI uses an ephemeral PostgreSQL 16 container and runs migration 001 plus db/tests/001_agent_platform_smoke.sql.
- No external database or worker has been provisioned.
- No production database migration has been applied.
- No queue runtime or background worker exists.
- Hostless quota, billing, Build and LIVE SHA remain unverified.