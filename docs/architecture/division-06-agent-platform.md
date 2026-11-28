# Division 06 — Agent Platform & Automation

- Date: 28 November 2026 (Asia/Jakarta)
- Owner: RADAR AI V2 / BOS
- Operating lead: Chief Strategy Advisor, coordinated through Direktur Utama
- Status: Architecture and staged backlog defined; P1 pure foundation in this branch; production worker OFF
- Cost boundary: Rp0 / free-tier only

## 1. Mission
Build the safe execution substrate that lets NEXUS coordinate specialist agents and complete bounded work while BOS is offline. Division 06 owns orchestration and execution mechanics—not business policy, knowledge truth, security approval, or final authority.

Every report must distinguish code exists, CI passes, service deployed, and live operation verified. A deployed Edge Function is not a scheduled worker; a scheduled workflow is not a continuous 24/7 runtime.

## 2. Organization and staffing
| Role | Responsibility | Collaboration |
|---|---|---|
| Director / Platform Owner | Architecture, backlog, interfaces, release coordination and service health | Direktur Utama; BOS |
| Agent Platform Architect | Agent registry, capability manifests, typed contracts and versioning | Divisi 01, 07 |
| Orchestrator & Queue Engineer | Task admission, dependency graph, claim/lease/fencing, retries and dead letters | Divisi 05 |
| Worker Runtime Engineer | Isolated execution, bounded tools, timeouts, output validation and recovery | Divisi 01, 07 |
| Scheduler & Reliability Engineer | Periodic triggers, concurrency, heartbeat, readiness and quota monitoring | Divisi 05, 08 |
| Permission & Audit Engineer | Least privilege, scoped grants, approval gates, immutable audit and kill switch | Divisi 01 |
| QA / Observability Engineer | Contract, integration, recovery tests and evidence dashboard | Divisi 05 |

These are functional roles, not a claim that named staff are assigned. One technical lead may cover architecture and orchestration; separate security and QA review remains mandatory for runtime activation. AI agents may implement within registered capabilities only.

## 3. Accountability and interfaces
- BOS is accountable for policy, risk acceptance, paid spend and irreversible production actions.
- Direktur Utama coordinates cross-division delivery and priority conflicts.
- Divisi 06 owns runtime, task lifecycle and execution controls.
- Divisi 01 owns security policy and independent threat review.
- Divisi 05 owns test strategy, release gates and deployment evidence.
- Divisi 07 owns memory/knowledge records and retrieval semantics.
- Divisi 04 supplies market/quant research tasks; it does not own the worker platform.
- Divisi 08 coordinates Rp0 capacity and organizational reporting.

## 4. Logical architecture
1. Intake: approved internal API, bounded GitHub issue/work item or explicit BOS instruction. Public issues never contain credentials, account data or confidential memory.
2. Task contract: task ID, division, objective, acceptance criteria, priority, dependencies, input provenance, allowed tools, deadline, maximum attempts, autonomy stage and idempotency key.
3. Admission policy: deny by default; validate actor, task type, permission profile, control snapshot, concurrency, budget and autonomy stage.
4. Durable queue: PostgreSQL state machine with transactional claim, lease expiry, fencing token, idempotent completion, bounded retry and dead-letter handling.
5. Orchestrator: resolves dependencies and chooses only registered agents and allowlisted capabilities.
6. Worker: stateless/ephemeral, isolated per task, bounded runtime, explicit timeout and structured output schema. No arbitrary shell or unrestricted network.
7. Output validation: schema, provenance, freshness, secret scan, policy and acceptance criteria.
8. Audit and evaluation: append-only event, correlation ID, evaluator/rubric and evidence reference.
9. Approval/delivery: Stage 0 observes; Stage 1 proposes. Integration/deploy or financial action is a separate control plane.

## 5. Mandatory runtime controls
All controls are fail-closed and enforced server-side, not merely in prompts or UI.

| Control | Initial value | Rule |
|---|---:|---|
| worker_enabled | false | No task claim when disabled |
| platform_paused | true | Pause overrides schedule |
| kill_switch | true | Highest-priority deny |
| daily_budget_usd | 0 | Hard Rp0; reject non-zero or malformed value |
| max_concurrency | 1 | One task maximum in pilot |
| autonomy_stage | 0 | Observe only by default; Stage 1 proposal requires policy enablement |
| max_attempts | 1–3 | Bounded; dead-letter after limit |
| task timeout | bounded per type | Never unbounded execution |
| tool grants | explicit allowlist | No privilege inheritance or self-escalation |

The current NEXUS queue migration has transactional claim/finish RPCs and fencing, but lacks the global runtime-control row used by the RADAR Agent Platform policy. Add that control table and an integration test before enabling any NEXUS scheduler/worker. Never infer NEXUS controls from the separate RADAR database.

## 6. Autonomy stages
- Stage 0 — Observe: read approved data, produce diagnostics and audit events; no external mutation.
- Stage 1 — Propose: prepare a patch, task result or recommendation for review; no merge, deploy, production write or financial action.
- Stage 2 — Approved execute: explicitly scoped reversible action after separate approval, policy check and rollback plan. Not enabled in current pilot.
- Stage 3 — Autonomous production: not designed or authorized for current project state.

No agent may approve its own output, alter its own permission profile, change budget, disable kill switch or promote its autonomy stage.

## 7. Runtime and free-tier strategy
- Start with existing GitHub Actions scheduled workflows as bounded periodic execution, not 24/7 compute. Jobs start, run for a bounded duration and stop; schedules may be delayed.
- Use existing Supabase Free only for durable NEXUS data. No paid compute, database, vector store, Redis, add-on, overage or trial that converts to paid.
- Edge Functions are stateless request handlers; ACTIVE does not imply a persistent consumer.
- Scheduler may call only a service-authenticated worker endpoint using server-side secrets. Never put service-role credentials in workflow logs, frontend code, model prompts or repository files.
- If no safe Rp0 scheduler/secret path is verified, keep the queue durable and worker disabled. Do not simulate always-on operation with an unreliable phone process.

## 8. Current implementation boundary

- P2 observation contract candidate is implemented on branch feat/nexus-observation-contract-p2: market-observation.v1, market-observation-input.v1 and OBSERVE_ONLY shadow receipt. This is pure/read-only code with deterministic freshness, timestamp, checksum, provenance and payload guards. Initial source and venue allowlist is Binance only; Bybit is excluded by BOS direction. No production caller or scheduler.
- P1 pure TypeScript modules: src/platform/agent-roles.mts, src/platform/task-policy.mts, src/platform/audit-event.mts; tests in test/quant-foundation.test.js.
- Divisi 07 pure retrieval helper: src/memory/retrieval.mts. It filters scope, sensitivity, approval, validity and retention before ranking.
- These are library contracts only. They have no production caller, scheduler, persistent worker, credentials or live task execution.
- NEXUS agent-runtime Edge Function v1 is ACTIVE and service-role protected, with bounded system.healthcheck, knowledge.ingest and knowledge.approve task types. No scheduled caller is verified. Its queue claim RPC currently has no global runtime pause/kill-switch row; do not schedule it yet.
- Existing RADAR queue controls in the separate RADAR database are not automatically applied to NEXUS.

## 9. Delivery roadmap and backlog
| ID | Priority | Work item | Acceptance evidence |
|---|---|---|---|
| D06-001 | P1 | Pure role/capability registry and deep-freeze | Tests reject forged roles and privilege escalation |
| D06-002 | P1 | Fail-closed admission policy | Tests cover disabled, pause, kill switch, concurrency, Rp0 and autonomy 0–1 |
| D06-003 | P2 | market-observation.v1 input contract | Reject malformed, stale, future, unknown-freshness and secret-bearing observations |
| D06-004 | P2 | NEXUS runtime-control schema + RPC guard | Disposable PostgreSQL proves default pause/kill switch denies claims |
| D06-005 | P3 | Queue adapter with idempotency, leases, fencing and bounded retry | Concurrent-claim, duplicate, lease-expiry and stale-worker tests |
| D06-006 | P3 | Isolated worker for allowlisted non-mutating tasks | One task/run, timeout, schema validation, audit and recovery |
| D06-007 | P4 | Bounded periodic scheduler | Verified schedule run, no secrets in logs, concurrency cap, pause/kill switch honored |
| D06-008 | P4 | Operator control/status surface | BOS can inspect state, pause, kill and review audit without secret exposure |
| D06-009 | P5 | Controlled integration with Divisi 04/07 | Only approved tasks; no trading/deploy/withdrawal capability |

## 10. Definition of done
A capability is active only after exact-head tests and security scans pass, service is deployed, scheduler is verified, a bounded end-to-end task executes, audit evidence exists, restart/lease recovery passes, budget remains Rp0, and pause/kill-switch tests prove denial. Until then label it design, code-only, CI-only or deployed-but-unscheduled.

## 11. Explicit exclusions
No paid resource, arbitrary shell, secret extraction, repository permission change, autonomous merge/deploy, live trading, order placement, transfer or withdrawal is included in the initial mandate.
