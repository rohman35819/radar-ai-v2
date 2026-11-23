# RADAR AI — Free-First Infrastructure Policy

Date: 2026-11-22 (Asia/Jakarta)
Status: **Owner-approved policy — strict Rp0 budget**
Scope: RADAR AI V2 and Agent Platform pilot

## 1. Binding decision
- Monthly and one-off infrastructure budget is **Rp0** until the Owner explicitly changes this policy.
- Hostless existing account is the primary deployment candidate. Reuse current app/account only; do not create another paid resource or assume spare quota exists.
- No new VPS, paid database, paid domain, paid AI API, subscription, card/payment method, or paid upgrade.
- No provisioning or deployment that can create charges. If a free allowance is shared account-wide or overage-billed, stop before provisioning until actual remaining quota and overage behavior are verified.
- Preserve current RADAR AI V2 app and data. Do not change production DATA_DIR, mount, database, or secrets as a trial.

## 2. Free-first service allocation
| Capability | First choice | Allowed use | Guardrail |
|---|---|---|---|
| Source control and CI | Existing GitHub repository + GitHub Actions Free allowance | Tests, lint/syntax, migration checks, bounded CI | Monitor minutes; no unbounded scheduled polling or production secrets in fork/untrusted PRs |
| Existing app/API | Existing Hostless deployment | Keep current V2 app running | No additional worker/database until account quota and zero-overage risk are confirmed |
| Durable database for tests | Disposable free PostgreSQL provider plan, e.g. Neon Free | Migration/integration tests only | Separate from production; verify current limits, scale-to-zero, storage and inactivity policies before use |
| Worker runtime | Existing Hostless only if a no-cost worker allowance is explicitly available | One isolated Stage 0/1 worker after all gates | If worker consumes shared/overage resources, do not provision; defer runtime |
| Scheduled trigger | GitHub Actions scheduled workflow or a free edge cron only for lightweight enqueue/health tasks | Bounded trigger, not a durable queue consumer | Schedule may be delayed; protect concurrency; no assumption of always-on uptime |
| AI inference | Local deterministic logic first; free model tiers only for non-sensitive experiments | Summaries/proposals with strict rate and token caps | No private RADAR data, credentials, exchange payloads, or production decisions to providers whose data terms are not approved |

## 3. Candidate service constraints
- **Hostless:** account already exists, but remaining allowance, plan grandfathering, app/worker/database consumption, and overage billing are not visible through repository access. Treat capacity as unknown. Hostless root filesystems are not durable; keep state in verified mounted storage or a database.
- **GitHub Actions:** use the repository's existing CI first. Public repository workflows can run without purchasing a separate runner, subject to current fair-use and concurrency limits. Never use Actions as a permanent always-on worker.
- **Neon Free (test-only candidate):** suitable for disposable PostgreSQL migration and concurrency testing if current free allowance is available. It may scale to zero and impose usage/storage/transfer limits; do not connect production or treat it as an always-on low-latency queue without testing.
- **Cloudflare Workers Free (optional trigger only):** request/CPU limits make it unsuitable as a long-running Node worker. Consider only for a small stateless HTTP/cron trigger if the existing free account is available and workload fits current limits.
- **Free LLM tiers:** optional non-sensitive prototyping only. Rate limits, model availability, provider retention/training terms, and no guaranteed SLA make them unsuitable as a required production dependency. Never make the task queue depend on a free model being available.

Official references to re-check before provisioning:
- Hostless workers: https://docs.hostless.cloud/app/workers
- Hostless plans/limits: https://docs.hostless.cloud/plans/limits
- Hostless filesystem: https://docs.hostless.cloud/app/filesystem
- GitHub Actions billing: https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions
- Neon pricing: https://neon.com/pricing
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/

## 4. Provisioning gate (mandatory)
No service may be created or enabled until all checks below are evidenced:
1. Free plan and remaining allowance are visible in the Owner's existing account.
2. Expected compute, storage, database, egress, build and idle usage fit remaining allowance.
3. No card/payment method or paid upgrade is required.
4. Overage behavior is disabled or workload is technically capped to prevent charges.
5. Owner explicitly approves the specific provisioning action if it changes the account or production environment.
6. Credentials are stored in provider secret manager, scoped least-privilege, and never copied into chat/Git/logs.
7. Rollback/deletion plan and data backup are documented.
If any item is unknown, status is **NOT APPROVED TO PROVISION**.

## 5. Zero-cost execution sequence
1. Reuse GitHub Actions CI to validate repository-only work.
2. Build a disposable PostgreSQL test harness using an available free test database only after the provisioning gate; otherwise keep schema tests static and mark DB validation blocked.
3. Implement DB adapter and queue service behind a disabled feature flag; do not add runtime dependency or deploy it yet.
4. Complete Divisi 01 security review and Divisi 05 independent PostgreSQL/concurrency QA.
5. Inspect actual Hostless quota and overage settings; only then consider a standalone worker using existing no-cost capacity.
6. If no safe free worker/database capacity exists, stop at tested code and wait. No paid fallback is allowed.

## 6. Success metrics and stop conditions
- Spend: Rp0 (hard ceiling); new paid resources: 0; production data migrations: 0 during pilot; unauthorized actions: 0.
- Worker concurrency: 1; autonomy Stage 0/1; default paused.
- Stop immediately on unexpected charge, quota exhaustion, unbounded retry/polling, missing audit event, permission escalation, secret exposure, or unclear task ownership.

## 7. Superseded cost assumption
The earlier architecture note estimated approximately USD 2.74/month for a small always-on Hostless worker before allowance/database charges. That estimate is **not an approved budget** and is superseded by this Owner-approved Rp0 policy. Do not provision that worker unless the existing account proves sufficient no-cost allowance and overage protection.

## 8. Current blockers
- Hostless account usage, remaining free pool, overage toggle, and worker/database availability are not accessible from the GitHub connector.
- No Hostless provisioning, Neon database, Cloudflare worker, or paid AI provider has been created in this task.
- Migration 001 and audit-role smoke test now run on an ephemeral PostgreSQL 16 service inside GitHub Actions; run #381 passed. No external database was provisioned.
- Agent Platform remains schema foundation only; no queue runtime or worker is active.
