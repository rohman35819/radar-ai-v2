# RADAR AI — Rp0 Cloud Runtime Implementation Decision

Date: 2026-11-26 (Asia/Jakarta)
Owner decision: BOS approved a free-services-only implementation. No paid resources, upgrades, payment methods, paid fallbacks, or chargeable provisioning are authorized.

## Decision summary

Build the first cloud operating layer from services already available to the public repository:

- GitHub Actions is the bounded scheduler and ephemeral execution environment.
- GitHub Issues/PRs are the initial public work intake and review/evidence surface. Never place secrets, private exchange data, or personal account data in issues.
- The existing autonomous maintenance worker may propose narrowly scoped Draft PRs only. It must not merge, deploy, trade, change permissions, or provision infrastructure.
- PostgreSQL migrations and queue logic are developed and tested against disposable PostgreSQL in CI. They are not production state until an explicitly approved, verified Rp0 database exists.
- Existing Hostless app remains untouched as the dashboard/control plane. Do not provision a Hostless worker, cron, disk, or database until account-level quota, overage behavior, and remaining free allowance are proven to be Rp0.
- Railway staged resources are not accepted or deployed. No paid plan is activated.

## Important capability boundary

This design is **periodic cloud automation**, not a 24/7 always-on worker.

GitHub Actions scheduled jobs start, run for a bounded duration, and stop. A two-hour cron can execute a maintenance cycle without the owner's phone or browser being open, but it cannot provide a 60-second scheduler tick, continuous queue polling, or guaranteed real-time alerts. Cron execution can also be delayed by GitHub.

A true always-on queue consumer needs a continuously running compute process and durable storage. No qualifying free, no-card, no-overage compute/database combination has been verified for this RADAR account. Therefore the project must not claim 24/7 autonomy yet.

## Current verified repository state

- Repository: `rohman35819/radar-ai-v2`.
- `main` and `develop` are divergent: at this audit, `develop` is 23 commits ahead and 3 commits behind `main`. Do not merge the whole branch without a separate release review.
- `.github/workflows/autonomous-development.yml` exists on `main`; it runs on a two-hour schedule and manual dispatch, checks out `develop`, and invokes `lib/ai/autonomous-agent.js`.
- The worker is constrained to a small allowlist of existing AI source/test files, runs `npm test`, and creates a Draft PR only. It stops when an earlier autonomous Draft PR remains open.
- OpenRouter is pinned to `openrouter/free`. Groq is opt-in and defaults OFF; keep it OFF unless BOS separately approves account quota/billing review.
- Agent Platform schema/queue and market-data storage migrations exist on `develop` and are exercised against disposable PostgreSQL by the `develop` test workflow. This is CI test evidence, not a production database.
- The one-shot typed ingestion worker is disabled by default and has no production caller/scheduler/queue integration.
- No production PostgreSQL service has been provisioned or attached.
- Railway has staged environment changes, but they have not been accepted or deployed. Leave them staged.
- No live cloud worker, durable production queue, or continuous heartbeat has been verified.

## Rp0 architecture — staged rollout

### Stage A — safe periodic worker (current pilot)

1. Keep the existing two-hour GitHub Actions trigger.
2. Keep the workflow's execution bounded by its job timeout and concurrency group.
3. Keep provider access optional. No provider key means a clean skip, not an automatic paid fallback.
4. Keep OpenRouter fixed to `openrouter/free`; keep Groq disabled.
5. Keep the worker proposal-only: tests, branch, Draft PR, human review.
6. Record workflow run URL, commit SHA, provider selection (never key values), duration, outcome, and any Draft PR.
7. Add a manual run only for controlled tests; never treat a manual run as proof of scheduled reliability.

### Stage B — public task intake and orchestration contracts

1. Use GitHub Issues with explicit labels/status as the first queue surface for non-sensitive tasks.
2. Define task fields: task ID, division, objective, acceptance criteria, priority, dependencies, allowed actions, status, created/updated timestamps, evidence URL, and reviewer.
3. Limit the worker to one task per run initially; enforce idempotency using issue ID plus task version.
4. Worker output is a proposal or Draft PR. Human approval is required for integration.
5. Do not use public Issues for private data, secrets, exchange account information, or internal customer data.

### Stage C — durable queue and memory (code/CI only until Rp0 storage is proven)

1. Continue the existing PostgreSQL schema, transactional claim/lease, heartbeat, retry, dependency, audit, approval and kill-switch work.
2. Apply migrations only to disposable CI PostgreSQL during development.
3. Test concurrent claims, duplicate/idempotent delivery, lease expiry, retry/dead-letter, cancellation, append-only audit, approval denial and kill switch.
4. Do not configure production database URLs or run production migrations under this approval.
5. Keep all agents paused, autonomy stage at the approved minimum, concurrency one, daily budget USD 0, and execution OFF by default.

### Stage D — continuous runtime (blocked)

A continuous worker can be considered only after all of the following are evidenced:

- An existing account resource is genuinely within a no-card Rp0 allowance for the full billing cycle.
- No overage, automatic upgrade, paid fallback, or chargeable usage can occur.
- Durable storage/database is included at Rp0 with acceptable retention, backup and recovery.
- Resource usage leaves safe headroom for the existing dashboard.
- Security review, least-privilege credentials, health/readiness, structured logs, audit, kill switch and rollback pass.
- A one-worker pilot passes restart recovery and queue concurrency tests.
- BOS approves the exact resource and deployment action after seeing the evidence.

If any condition is unknown, provisioning remains blocked. Do not use a free trial as a permanent free service.

## Hard security and budget invariants

- Budget cap: USD 0 / Rp0. No paid services, card entry, trials that roll into paid plans, paid fallbacks, or unverified overage.
- Never expose provider, GitHub, database, or exchange secrets in source, frontend, logs, issues, PRs, or chat.
- No AI provider is required for queue correctness.
- Free AI providers receive only public, non-sensitive code context approved for that provider; never private exchange/account data or credentials.
- No agent may grant itself permissions, approve its own proposal, merge/deploy, alter production secrets, run migrations against production, or execute trading/withdrawals.
- Every action must have an actor, task/correlation ID, bounded timeout, audit evidence and an explicit policy decision.
- Global kill switch and pause state take precedence over scheduled work.

## Acceptance gates

| Gate | Required evidence | Current status |
|---|---|---|
| Scheduled trigger exists | Workflow file on default branch | Present; actual successful scheduled run not verified in this audit |
| Bounded proposal worker | Allowlist, timeout, tests, Draft PR only | Code exists on `develop`; workflow checks out `develop` |
| Free model policy | OpenRouter free route; Groq OFF | Present in worker/workflow configuration; live provider availability not verified |
| Durable queue schema | Migrations and PostgreSQL integration tests | Present on `develop`; CI-only |
| Production database | Verified Rp0 plan, credentials, backup/restore, deployment | Not provisioned / blocked |
| Always-on worker | Continuous process, heartbeat, restart recovery | Not deployed / blocked |
| Security and audit | Least privilege, append-only audit, kill switch, approval tests | Schema/code foundations exist; end-to-end production verification pending |
| 24/7 operation | Live runtime and independent uptime evidence | Not achieved |

## Next implementation sequence

1. Division 05: verify exact-head CI/security evidence for the cloud-worker and Agent Platform commits; retain PostgreSQL as disposable CI service.
2. Division 01: review GitHub workflow permissions, token scope, secrets, provider data handling, audit and kill-switch behavior.
3. Division 06: complete queue worker adapter and lifecycle tests behind OFF-by-default flags; do not connect production.
4. Division 07: finish provenance-first task/decision memory contracts and retention/access controls.
5. Executive Office: prepare a narrowly scoped release from `develop` to `main`; do not bulk-merge the divergent branch.
6. Division 08: verify no-card/free/overage conditions for any proposed runtime service before a new procurement recommendation.

## Reporting rule

Report code, CI, scheduled-run evidence, production database, deployment, and live operation as separate statuses. Never describe the platform as "cloud 24/7", "always-on", or "autonomous" until the corresponding runtime and independent checks have actually passed.
