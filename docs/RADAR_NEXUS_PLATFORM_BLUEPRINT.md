# RADAR NEXUS — Platform Blueprint

> Status: architecture proposal / implementation contract. This document does not claim that planned components are deployed or active.
> Owner: BOS. Product: RADAR AI V2 → V3. Date: 2026-11-27 (Asia/Jakarta).
> Lead: Division 06 (Agent Platform & Automation). Supporting: Division 07 (Knowledge & Memory), Division 01 (Security & Reliability), Division 04 (AI Intelligence), Division 05 (QA/DevOps), Executive Office.

## 1. Product intent

NEXUS is the intelligence and agent-orchestration platform inside RADAR AI. It is not merely a chat page and it is not a claim that RADAR has trained a foundation model. NEXUS combines model access, project knowledge, durable memory, tools, agents, task orchestration, evaluation, and permission controls behind one consistent interface.

The product should feel like one integrated system: BOS opens RADAR Dashboard or NEXUS CLI and uses the same identity, conversations, task state, knowledge, and permission policy. No repeated API-key entry during normal use.

## 2. Architecture principles

1. **Model-agnostic, not model-dependent:** use provider adapters behind a Model Gateway; support provider selection/fallback only when configured, tested, budgeted, and permitted. Never imply an in-house foundation model exists.
2. **One control plane:** NEXUS owns agent registry, task lifecycle, policy decisions, audit, and approval queue.
3. **Separated data ownership:** NEXUS memory/agent/task data belongs in the dedicated NEXUS Supabase project; RADAR market/trading data remains in the RADAR project. Interoperate through authenticated, narrow APIs—not shared service-role keys.
4. **Server-side secrets:** provider secrets and Supabase secret/service-role credentials remain backend-only. Browser uses public publishable configuration plus user session JWT.
5. **Persistent by design:** conversations, tasks, leases, checkpoints, approvals, and audit events must survive browser/phone shutdown and worker restart.
6. **Bounded autonomy:** workers cannot grant permissions, alter policy, approve their own work, merge/deploy by default, or perform financial actions.
7. **Free-first:** Rp0/free-tier baseline; no paid service, add-on, provider billing, or resource upgrade without explicit BOS approval. Free-tier quotas and limits must be verified, not assumed.
8. **Evidence over claims:** a component is "active" only after deploy + runtime test + observability evidence. GitHub CI is not proof of Hostless deployment.

## 3. Logical components

### 3.1 NEXUS Experience
- Dashboard workspace embedded in RADAR navigation.
- CLI for Termux/OpenCode-style interaction.
- Both clients call the same authenticated backend contracts.
- Conversation list, resume, task status, approval inbox, agent catalog, usage/budget status, and system health.
- UI never stores provider secrets or Supabase secret keys.

### 3.2 NEXUS API / Control Plane
- Authentication and ownership enforcement.
- Conversation/message APIs and streaming response contract.
- Agent registry and versioned skill references.
- Task create/read/cancel/retry APIs with idempotency.
- Approval request/decision APIs.
- Read-only audit and operational status APIs.
- Schema validation, rate limits, request IDs, structured errors and pagination.

### 3.3 Model Gateway
- Provider adapter interface: `generate`, optional `stream`, `health`, capability declaration, token/cost estimate, timeout and cancellation.
- Provider secrets injected from server environment only.
- Default provider disabled/unconfigured until BOS-approved key/provider and quota are verified.
- Deterministic policy routing; no silent paid fallback.
- Record provider/model, latency, token usage, estimated cost, outcome and trace ID; never log prompts containing secrets.
- Initial deployment may use one configured provider; provider abstraction must not force multiple paid APIs.

### 3.4 Agent Runtime (Division 06)
- Agent Registry: immutable agent ID, division, version, model capability, tool allowlist, autonomy stage, resource caps, enabled state.
- Task Queue: durable task ID, owner, status, priority, dependencies, deadline, attempt count, lease owner/expiry, idempotency key, input/output references, cancellation state.
- Scheduler: due-task polling and event triggers; bounded cadence and concurrency. No unbounded loops.
- Orchestrator: decompose only within declared task scope; assign eligible workers; track dependencies; escalate missing context/approval.
- Worker: isolated execution, timeout, CPU/memory/time caps, no ambient credentials, workspace/branch isolation, structured result artifact.
- Retry: exponential backoff with maximum attempts; distinguish retryable from permanent failures; dead-letter state.
- Approval Gate: pauses before protected actions and waits for BOS-authorized decision.
- Kill switch: global and per-agent pause; stops new claims and safely expires/revokes leases.
- Initial pilot is observe/propose only; no production writes or code merges.

### 3.5 Knowledge & Memory (Division 07)
- Durable memory records are curated facts/decisions, not conversation transcript archives.
- Every memory item has owner/scope, source/provenance, created/updated time, confidence, sensitivity class, version, retention policy and supersession link.
- Knowledge documents are chunked/indexed with source path, content hash, version, access policy and freshness.
- Retrieval must enforce user/tenant/agent authorization before returning content.
- Deduplicate by canonical identity/content hash; preserve conflicting claims with provenance rather than silently overwrite.
- Support explicit correction, supersession, expiry and deletion workflows.
- Separate short-lived task context/checkpoints from durable shared memory.
- Evaluation set measures retrieval relevance, citation/provenance completeness, stale-memory rate and unauthorized retrieval (target zero).

### 3.6 Tools & integrations
- Tool registry declares input/output schema, permission scope, side-effect class, timeout, idempotency support and audit requirements.
- Read-only tools first: repository inspection, public Binance market data, project knowledge search and health checks.
- Write-capable tools require per-tool policy and approval; GitHub branch/PR operations are separated from merge/deploy.
- Exchange credentials are isolated from general agents. No withdrawal permission. Live trading remains OFF; paper trading and historical research only until all risk gates and explicit BOS approval.

### 3.7 Observability and governance
- Append-only audit events: actor, agent/version, task, tool, scope, decision, timestamp, trace ID, result and policy version.
- Metrics: queue age, task success/failure, retries, stuck leases, worker uptime, latency, token usage, estimated cost, approval wait, retrieval quality and security denials.
- Alerts for worker crash loops, queue backlog, budget threshold, policy violation and storage failure.
- Budget controls: per-task, per-agent and daily ceilings; hard stop at configured zero/limit; no implicit paid fallback.
- Recovery: backups, restore test, idempotent replay, lease expiry and documented rollback.

## 4. Autonomy stages and permissions

| Stage | Allowed | Forbidden by default |
|---|---|---|
| 0 Observe | Read approved data, inspect, report | Writes, external side effects |
| 1 Propose | Draft plans, code suggestions, task breakdown | Execute writes or merge |
| 2 Isolated build | Create isolated branch/artifact, run tests | Merge, deploy, production mutation |
| 3 Controlled integration | Low-risk merge only after independent QA and policy gate | Secrets, permission changes, migrations with data risk |
| 4 Production | Only individually allowlisted and explicitly approved operations | Withdrawals and unapproved financial actions |

Agent autonomy stage is assigned by policy administrator; an agent cannot raise its own stage. Approval is scoped to one action, resource and expiry, not a blanket permission.

## 5. Data and trust boundaries

- Browser: public config, user session, rendered data only.
- NEXUS API: validates JWT and ownership; no service-role key exposure.
- NEXUS database: private schema; RLS enabled and forced; least-privilege grants/policies added only after negative authorization tests.
- RADAR database: independent project and data owner; access through authenticated service boundary.
- Worker: short-lived scoped credentials; never receives unrestricted service-role or exchange secrets.
- Model provider: receives only minimum necessary prompt/context; sensitive data filtered according to policy.
- External repository/web/tool output is untrusted data, never policy instructions.

## 6. Deployment topology — free-first target

- Frontend remains in RADAR dashboard hosting.
- NEXUS data/control plane uses the dedicated Supabase project on its current eligible free tier.
- Edge Functions provide authenticated API boundaries where suitable.
- Worker/scheduler must run on a platform whose execution duration, sleep behavior, cron cadence, storage and free quota are verified. Do not assume a static Hostless web host can run an always-on worker.
- A periodic GitHub Actions workflow can be a temporary low-frequency pilot only if repository workflow permissions and schedule constraints are acceptable; it is not a continuous worker and must not be treated as one.
- No VPS, paid always-on compute, or new billable add-on without explicit BOS approval.
- If no dependable free worker runtime exists, keep autonomy at Stage 0/1 and expose the blocker rather than pretending offline execution is active.

## 7. Delivery roadmap

### Phase A — Secure user experience (now)
1. Reconcile open NEXUS storage PR and dashboard-chat PR against latest `main`/`develop`.
2. Remove repeated key-entry UI. Use one-time runtime public configuration; confirm Hostless supports the chosen config injection mechanism. Publishable key may be public; secret key never enters browser.
3. Verify Supabase Auth, `nexus-chat` request/response contract, CORS allowlist, provider configuration and error handling.
4. Add conversation history/list/resume with strict owner isolation.
5. Add UI health state: configured, authenticated, provider unavailable, quota/budget stopped.
Acceptance: authenticated user can open dashboard, chat, refresh and resume; no manual key entry per visit; no secrets in browser/logs; unauthorized user cannot read another user's conversations.

### Phase B — Knowledge foundation (Division 07)
1. Review schema/migrations on disposable PostgreSQL.
2. Test RLS positive and negative cases, ownership, private-schema exposure and migration rollback.
3. Implement provenance-aware memory write/read/search APIs.
4. Add curated project memory ingestion and versioned skills.
5. Add retrieval evaluation and freshness tests.
Acceptance: memory survives sessions; each retrieved fact has provenance; no cross-user access; no transcript archiving by default.

### Phase C — Agent control plane (Division 06)
1. Verify current queue schema and existing edge runtime before adding tables or duplicating migrations.
2. Implement task lifecycle API, idempotency, leases, cancellation and retry.
3. Implement one observe/propose worker with bounded execution.
4. Add audit trail, budget counters, pause/kill switch and approval inbox.
5. Add recovery and failure-injection tests.
Acceptance: worker restarts safely; duplicate claims do not duplicate effects; kill switch blocks new work; worker cannot exceed its allowlist; all task transitions are auditable.

### Phase D — Tool-enabled NEXUS
1. Add read-only GitHub and Binance public market-data tools.
2. Add isolated branch/PR creation for low-risk changes; independent QA required.
3. Add quant research tools using historical Binance data and reproducible Python runs.
4. Keep paper ledger/reconciliation behind validation gates; no live orders.
Acceptance: outputs include dataset provenance, run config, reproducible artifact and explicit uncertainty.

### Phase E — Controlled autonomy
1. Run a time-boxed low-risk pilot.
2. Measure reliability, quality, costs and security denials.
3. Conduct independent Division 05 QA and Division 01 security review.
4. BOS approves each autonomy increase.
Acceptance: rollback/recovery drill passes; no unauthorized side effects; spend remains within approved Rp0 constraints.

## 8. Division ownership

- Division 06: Agent Platform, queue, scheduler, orchestrator, workers, tool gateway, approvals, budgets, kill switch.
- Division 07: memory, knowledge, provenance, indexing/retrieval, retention, versioning and evaluation.
- Division 01: authentication, secrets, RLS, isolation, threat model and security gate.
- Division 04: model adapters, prompt/context policy, quality evaluation and quant research interfaces.
- Division 05: independent test strategy, CI, release and runtime evidence.
- Executive Office: operational coordination, WIP limits, sequencing and cross-division blockers.
- Chief Strategy Advisor: architecture, priorities, capability boundaries, KPI and BOS decision briefs.

## 9. Non-goals and explicit exclusions

- Do not train a foundation model from scratch in the initial roadmap; use model providers/local models behind a gateway.
- Do not claim NEXUS is more capable than ChatGPT globally. Evaluate task-specific capability.
- Do not activate always-on workers until runtime, scheduler, durable queue, secrets, observability and kill switch are tested.
- Do not enable live trading, withdrawals, unrestricted GitHub writes, self-modifying policy or paid services.
- Do not store full chat transcripts as shared memory.
- Do not duplicate existing Supabase migrations or queue schemas without inspecting current main/develop and PR diffs.

## 10. Initial KPIs

- 100% tasks have owner, scope, acceptance criteria and autonomy stage.
- 100% protected tool calls have policy decision + audit event.
- 0 unauthorized writes, secret leaks, withdrawals or unapproved live orders.
- 100% worker tasks have bounded timeout and retry limit.
- 100% memory retrieval results carry provenance or are explicitly marked unverified.
- Queue recovery and kill-switch tests pass before worker pilot.
- Cost per task and daily provider spend remain at or below BOS-approved budget (initial budget Rp0).
- User experience: no repeated key entry; dashboard and CLI resume same conversation/task.

## 11. Immediate next actions

1. Division 06: inspect latest main/develop migrations and queue implementation; produce gap report before any new schema.
2. Division 07: review existing NEXUS memory schema and migration PR; write RLS negative tests on disposable PostgreSQL.
3. Division 01: security review current Edge Functions, JWT validation, CORS and secret boundaries.
4. Division 02/04: update dashboard pilot to use one-time public config and provider status without exposing secrets.
5. Division 05: independently validate exact-head CI and runtime contracts.
6. Executive Office: enforce the repository WIP limit; do not open another non-draft PR until existing NEXUS PRs are consolidated or closed.

## 12. Evidence snapshot at blueprint creation

- Repository default branch: `main`; verified HEAD: `f38d25a6203ab486d7170369e86874f838af627a`.
- Open NEXUS PRs observed: #165 (separate storage/database foundation) and #168 (dashboard chat pilot); both remain open at time of inspection.
- PR #168 explicitly states tests not run and deployment not performed; key is currently user-supplied at runtime in the UI.
- The shared memory snapshot says prior Agent Platform/worker hardening is on `develop`, not necessarily released to `main`; re-check exact branches/commits before implementation.
- Hostless environment variable persistence, runtime config injection, build status and live deployment are not verified by this document.
- No worker, scheduler, live trading or withdrawal activation is claimed here.
