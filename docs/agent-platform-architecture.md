# RADAR AI Agent Platform — Architecture Decision & Pilot Foundation

Date: 2026-11-22 (Asia/Jakarta)  
Status: **Accepted design; schema foundation only. Runtime is not active.**  
Repository: rohman35819/radar-ai-v2

## Decision

Use a **separated control plane and worker plane on Hostless initially**, with managed PostgreSQL as the durable coordination store.

- Existing Hostless app remains the V2 dashboard and HTTP API. Preserve routes and behavior.
- Deploy a standalone Hostless worker from this repository on a separate process/deployment, initially one replica. It gets a dedicated start command and only the minimum environment it needs.
- Use Hostless managed PostgreSQL for Agent Registry, Task Queue, dependencies, and Audit Events. Do not use process memory or the existing JSON state file as a distributed queue.
- Use Hostless cron only for periodic enqueue/maintenance triggers; queue consumers remain long-running workers.
- Keep GitHub Actions for CI, migration checks, and bounded repository jobs. It is not the permanent worker runtime.
- Keep a provider-neutral DB and task contract so the worker can move to Railway, Render, or another provider without redesigning the queue.

Hostless documents long-running apps, standalone/embedded workers, cron jobs, and managed databases. Standalone workers have their own deployment, command, environment and resources. This gives better failure/deploy isolation than embedding the first worker in the dashboard app.

## Why this architecture

1. A dashboard restart must not erase or cancel accepted work.
2. Durable tasks and leases must survive worker restarts.
3. Multiple workers must not claim the same task; implement transactional claiming with row locks/lease tokens in a later runtime step.
4. PostgreSQL is sufficient for the first pilot; Redis is deliberately deferred.
5. Existing V2 JSON state remains separate until a migration is justified and tested. Hostless root filesystems are read-only; state paths must use a mounted disk or a database.

## Initial resource envelope

- Worker: 1 replica, 0.1 vCPU, 256 MiB RAM starting target; adjust only from observed metrics.
- Concurrency: 1 task per worker initially.
- Database: smallest available managed PostgreSQL tier; enforce connection limits and TLS.
- One free Hostless resource allowance is shared across the account and existing services. Check actual billing before provisioning.
- Initial autonomy: Stage 0/1 only. No code-writing, merge, deploy, exchange write, or financial action.
- AI provider spend: per-task and daily caps are required before any LLM task is queued.

Hostless published usage rates: $0.03/vCPU-hour and $0.003/GiB-hour for compute, plus database storage charges. At 730 hours, 0.1 vCPU + 256 MiB is approximately $2.74/month before shared free allowance and database/provider charges. This is an estimate, not an account quote.

## Schema foundation (migration 001)

File: db/migrations/001_agent_platform.sql

- radar_agent.agent_registry: stable agent identity, division, role, version, status, capabilities, tool allowlist, policy metadata, autonomy stage and budget.
- radar_agent.task_queue: durable task envelope, priority, schedule/deadline, idempotency, attempts, lease, heartbeat, result and sanitized error.
- radar_agent.task_dependencies: explicit prerequisite edges.
- radar_agent.audit_events: actor/action/entity/task/correlation/outcome and metadata. UPDATE/DELETE are rejected by trigger; runtime credentials must additionally deny those privileges.
- Stage is constrained to 0–1 for the pilot. The schema cannot grant runtime permissions by itself.
- IDs are supplied by application code to avoid requiring a PostgreSQL extension.
- Never put API keys, secrets, raw authorization headers, or private exchange payloads in metadata or errors.

## Task lifecycle contract

queued → claimed → running → succeeded | failed | awaiting_approval | cancelled

Expired leases may be reclaimed only by a later transactional queue service. Reaching max attempts moves work to dead_letter. Every transition must emit an audit event in the same DB transaction. These transition rules are not implemented by the schema alone.

## Permission policy

| Actor | Allowed in pilot | Explicitly denied |
|---|---|---|
| Owner | Approve/reject, pause/resume, kill switch | None by platform policy |
| Director | Create/assign Stage 0/1 tasks, review artifacts | Change Owner policy or raise autonomy |
| Agent | Read assigned task and allowlisted context; submit proposal | Grant itself tools, permissions or autonomy |
| Worker | Claim/heartbeat/complete leased task | Merge/deploy, production mutation, exchange writes, withdrawal |
| QA Gate | Read artifact, run tests, record review | Approve its own implementation as independent review |
| Security Gate | Inspect policy and audit metadata | Reveal secrets or bypass approval |

The initial worker must be read-only/propose-only. A later isolated code-generation pilot requires a separate approval, isolated branch/workspace, budget cap, test proof and independent QA.

## Division ownership and staged backlog

### Division 06 — Agent Platform & Automation
1. **P0 — Runtime contract and DB access:** configuration validation, TLS connection, bounded pool, startup/shutdown and health.
2. **P0 — Queue service:** transactional enqueue/claim/heartbeat/complete/retry/dead-letter; FOR UPDATE SKIP LOCKED; lease fencing; idempotency.
3. **P0 — Audit writer:** write-once event API; actor/correlation context; redaction; same-transaction task transition events.
4. **P1 — Scheduler/orchestrator:** due-task scan, dependency checks, concurrency, timeout, retry backoff, maintenance window.
5. **P1 — Permission/budget/approval:** server-side policy evaluator, human approval state, daily spend caps, kill switch.
6. **P2 — Worker execution:** one read-only Stage 0/1 agent, heartbeat and graceful shutdown, metrics and recovery drills.

### Division 07 — Knowledge & Memory Systems
1. **P0 — Canonical records:** agent/task/decision schemas and provenance.
2. **P1 — Decision memory:** append-only decision records with source, author, timestamp, supersedes link and scope.
3. **P1 — Task memory:** outcomes, handoffs, artifacts, references and compact summaries.
4. **P2 — Retrieval:** metadata/full-text search first; embeddings only when measured need and budget justify them.
5. **P2 — Retention/versioning:** deduplication, retention policy, backup/restore and redaction workflows.

### Cross-functional gates
- Divisi 01: threat model, DB roles, secrets, permission gateway, kill switch and recovery.
- Divisi 05: migration validation, queue concurrency/retry tests, failure injection, regression and independent QA.
- Direktur Utama: assign one owner per task, avoid overlapping file ownership, integrate through PR.
- Chief Strategy Advisor: architecture, priorities, KPI, budget and policy decisions.

## Acceptance criteria before enabling a pilot worker

1. Migration applies to a disposable PostgreSQL database and can be inspected/rolled back safely.
2. Queue tests prove no double-claim under concurrent workers, stale lease rejection, idempotency, retry limits and dependency blocking.
3. Audit tests prove task transitions always have corresponding events and audit UPDATE/DELETE is rejected for the runtime role.
4. DB credentials use TLS and least privilege; secrets never enter logs or task payloads.
5. Kill switch pauses claims and prevents new task execution; in-flight work stops at a safe checkpoint.
6. Worker restart resumes queued/expired tasks without losing records.
7. One Stage 0/1 read-only pilot completes with bounded time, token and cost budgets.
8. Independent Divisi 05 QA and Divisi 01 security review pass.
9. Hostless worker health, logs, resource use and actual billing are observed.
10. No merge, deploy, production mutation, trading, transfer or withdrawal capability exists in the pilot.

## Open risks / blockers

- Hostless project/account entitlement, actual worker/database availability and billing are not visible from this GitHub session.
- Current Hostless deployment SHA and live health remain unverified.
- Existing V2 JSON state still needs the actual mounted path checked; do not change DATA_DIR or attach a disk without authorized Hostless review.
- The available GitHub connector cannot execute npm test in a local checkout. CI is the validation source after PR creation.
- Migration has not been run against PostgreSQL in this session.

## Next task

Divisi 06: add a minimal DB adapter and transactional queue service behind a feature flag, after a disposable PostgreSQL migration test harness is available. Divisi 01 reviews DB roles/secrets. Divisi 05 independently validates concurrency, lease recovery, idempotency and audit immutability. Do not deploy a worker until those gates pass.


## Free-first policy update — 2026-11-22

The Owner approved a strict **Rp0** infrastructure policy. This supersedes the earlier USD 2.74/month worker estimate as an unapproved cost assumption.

- Reuse the existing Hostless account only if actual shared free allowance and overage controls are verified. Do not provision a worker/database based on published plan descriptions alone.
- Existing GitHub Actions is the first CI resource; it is not an always-on queue consumer.
- Neon Free is a disposable integration-test candidate only, subject to account availability and current quota checks; never connect it to production.
- Cloudflare Workers Free, if considered, is only a lightweight stateless trigger—not a long-running Node worker.
- Free LLM tiers are optional non-sensitive experiments, never a required production dependency. No private RADAR data, exchange payloads, secrets, or credentials may be sent.
- If no zero-cost, overage-safe worker/database capacity is available, implementation stops at tested code. No paid fallback is allowed.
- Provisioning requires visible remaining quota, no-card/no-upgrade confirmation, overage prevention, rollback plan, least-privilege secrets, and explicit Owner approval for account-changing actions.

See docs/free-first-infrastructure-policy.md for the binding provisioning gate and service allocation.


## PostgreSQL CI harness — 2026-11-22

- GitHub Actions now starts a disposable PostgreSQL 16 service container for tests; no external account, persistent DB, or paid resource is provisioned.
- Migration 001 was applied successfully in CI. The smoke test verifies required tables and a NOLOGIN runtime role that can INSERT audit events but cannot UPDATE/DELETE them.
- Successful proof: run #381 / ID 44998478751, commit 8a7b7e9f0c6d1c7425aac111b25c49496d16d534; npm test 68/68 passed; migration and audit-role smoke test passed.
- This is not yet a transactional queue/lease/concurrency test and does not validate Hostless or production deployment.
