# NEXUS — 8-Hour Engineering Sprint & Executable Backlog

**Date:** 2026-11-27 (Asia/Jakarta)  
**Status:** planning artifact committed to a documentation branch; no worker, scheduler, provider spend, production migration, or autonomous execution is enabled.  
**Budget ceiling:** Rp0.  
**Scope:** turn the existing NEXUS blueprint into a safe, testable implementation sequence.

## 1. Verified starting point

Repository snapshot inspected for this plan:
- `main`: `f38d25a6203ab486d7170369e86874f838af627a`.
- `develop`: `411e7b7114c9642c0e4d567e7e666c82910d2b3c`.
- Existing blueprint branch: `docs/nexus-platform-blueprint`.
- Existing code on develop includes `lib/knowledge/memory.js`, `db/migrations/002_queue_operations.sql`, queue smoke SQL, and Division 07 architecture documents.
- NEXUS architecture describes model adapters, memory, reasoning, agent orchestration and evaluation as target boundaries, not a deployed unified runtime.
- Existing queue SQL has a conservative platform control default (paused and kill switch on), and worker claims are bounded by agent state/autonomy/budget/concurrency checks. This is a design/code fact, not evidence that a worker is running.
- Supabase NEXUS project and Edge Functions were previously inspected; this sprint does not apply migrations, change secrets, invoke paid model APIs, or activate functions/workers.
- Existing PRs #165 and #168 remain subject to the repository WIP policy. Do not open another non-draft PR until the Executive Office confirms capacity.

This document is an execution plan. It does not represent test results or deployment evidence.

## 2. Eight-hour work package

The eight-hour target is divided into bounded work packages. Each package must end with a committed artifact, test evidence, or a clearly recorded blocker. Work must stop at the boundary if the required access or approval is missing.

| Elapsed target | Work package | Deliverable | Acceptance gate |
|---|---|---|---|
| 00:00–01:00 | Baseline & contracts | Inventory, component/API contracts, risk register | Every claim tied to a file, commit, PR, or explicit unknown |
| 01:00–02:00 | NEXUS Core | Request envelope, identity context, conversation lifecycle contract | Authenticated identity; correlation IDs; no secrets in logs |
| 02:00–03:00 | Model Gateway | Provider adapter contract and routing policy | Provider allowlist; no silent paid fallback; timeout and bounded output |
| 03:00–04:00 | Divisi 07 Memory | Canonical record and retrieval contract | Provenance, lifecycle, scope/sensitivity filters before ranking |
| 04:00–05:00 | Divisi 06 Runtime | Task state machine, lease and idempotency contract | Kill switch default-on; bounded retries; no privilege escalation |
| 05:00–06:00 | Reasoning & tools | Plan/execute/verify protocol and tool capability matrix | Read-only default; all tool calls audited; explicit approvals for writes |
| 06:00–07:00 | Evaluation & security | Frozen benchmark, threat model, test matrix | Reproducible tests; negative authorization tests; no provider spend |
| 07:00–08:00 | Integration handoff | Dependency graph, acceptance checklist, next sprint tickets | Every ticket has owner, inputs, tests, artifact and stop condition |

The elapsed targets are a planning allocation for a real engineering team/worker. ChatGPT cannot keep executing after this conversation ends; this table is not a running background job.

## 3. NEXUS system contracts

### 3.1 Request envelope

Every user/agent request entering NEXUS should be normalized to:
- `request_id`: UUID, generated at trusted ingress.
- `correlation_id`: UUID shared by child tasks and tool calls.
- `actor`: authenticated user or registered agent identity; never trust caller-supplied role claims.
- `session_id` and optional `conversation_id`.
- `intent`: classified request category and risk tier.
- `input`: bounded text/structured payload; secrets and unrelated sensitive data rejected/redacted.
- `context_refs`: explicit memory/knowledge IDs and source revisions, not arbitrary unbounded context dumps.
- `policy`: server-resolved capabilities, budget ceiling, provider allowlist and autonomy stage.
- `deadline`, `max_steps`, `max_tool_calls`, `max_output_bytes`.
- `response_contract`: expected output schema and acceptance checks.

The server must derive actor, policy, budget and allowed tools from trusted identity/configuration. Client payloads may request a capability but cannot grant it.

### 3.2 Response envelope

Return:
- `request_id`, `correlation_id`, `conversation_id`;
- assistant response and typed status;
- citations/provenance references for retrieved facts;
- task IDs and artifact references, if work was queued;
- model/provider identifier only when actually used;
- verification summary, warnings and unresolved assumptions;
- explicit cost/usage metadata when available; otherwise mark unknown, never invent;
- approval requirement and pending status where applicable.

Never return internal secrets, hidden reasoning, raw provider credentials, or unreviewed memory as canonical fact.

### 3.3 Model Gateway

The gateway owns provider selection; agents must not call arbitrary provider URLs directly.
- Adapter interface: `generate(request, policy) -> normalized result`.
- Provider registry: provider/model IDs, capabilities, data handling class, availability, max context/output, cost class and configuration status.
- Routing: explicit allowlist; default to no provider if none is configured/approved.
- Failover: only to another explicitly allowed provider with compatible privacy/cost policy. No silent paid fallback.
- Controls: deadline, timeout, bounded retries, output cap, cancellation, circuit breaker and per-task usage ceiling.
- Provenance: record provider/model/version, request template version, parameters and timestamps; do not persist secrets or unnecessary raw prompts.
- Evaluation: compare candidates on the same frozen cases before changing default routing.
- Initial release: provider integration is disabled until keys, budget and data handling are explicitly approved. Do not call paid APIs in CI.

### 3.4 Memory / Knowledge contract (Divisi 07)

Use the existing canonical domains and validate before persistence:
- Record classes: decision, fact, policy, task_handoff, execution_result, knowledge, skill, evaluation.
- Required: stable ID/key, type, scope, sensitivity, title/summary, status, source type/ref/revision, creator, timestamps, retention class/date.
- Optional/conditional: content, validity interval, confidence with evidence basis, supersedes relation, task/correlation ID, artifact refs, reviewer/approver.
- Lifecycle: proposed → reviewed → approved/rejected; approved → superseded/expired/archived. No direct agent promotion to approved.
- Provenance must survive retrieval and downstream answer generation.
- Apply identity, tenant/project, division/agent scope and sensitivity authorization **before** text search/ranking.
- Exclude stale, expired, rejected and superseded items from default current-fact retrieval. Historical queries may include them with status labels.
- Conflicts remain explicit; authority and evidence resolve them, not timestamp alone.
- Never store chat transcripts, hidden reasoning, credentials, exchange keys or provider secrets.
- Begin with PostgreSQL constraints and full-text search. No vector DB, Redis, embeddings or new paid service until measured need and BOS approval.

### 3.5 Agent Runtime (Divisi 06)

Minimum task fields:
- task ID/key, type, title, bounded input, output schema;
- requesting actor, assigned agent and division;
- autonomy stage, required capabilities and risk class;
- status, priority, schedule, deadline, attempt/max attempts;
- dependency IDs, idempotency key and correlation ID;
- lease owner/token/expiry, heartbeat and cancellation state;
- budget/time/tool-call limits;
- result/artifact refs, verification status and error summary.

State machine:
`proposed → queued → claimed → running → (succeeded | failed | cancelled | dead_letter)`
A retryable failure may return to `queued` only after a new bounded schedule and incremented attempt. Terminal transitions must be audited. Dependencies must be acyclic. Lease recovery must be deterministic and tested.

Safety invariants:
1. Platform pause and kill switch default to ON.
2. Observe/propose stages cannot perform write tools.
3. Worker identity is separate from user identity and least-privileged.
4. Every claim requires an active registered agent, approved task type, valid lease and available budget.
5. Idempotency prevents duplicate external side effects.
6. Retries are bounded; poison tasks move to dead-letter for review.
7. No agent may approve its own privileged action or promote its own autonomy stage.
8. Production, secrets, paid provisioning, live exchange orders and withdrawals remain unavailable without separate explicit BOS approval.
9. A kill-switch test must prove workers stop claiming and executing tasks, not merely flip a UI flag.
10. Worker and scheduler remain OFF until disposable-database, security, QA, recovery and cost gates pass.

### 3.6 Reasoning and tool-use loop

1. Classify intent and risk.
2. Resolve identity and server-side capability policy.
3. Retrieve only authorized, approved and current context.
4. Produce a bounded plan with acceptance criteria.
5. Select model and agent from approved registries.
6. Request tool capabilities from the policy gateway.
7. Execute in isolated workspace with deadline and resource caps.
8. Verify with deterministic tests/source checks and independent review.
9. Save artifact references and propose (not auto-approve) durable memory.
10. Return answer, evidence, limitations and next actionable task.

No unrestricted self-prompting loop. Each task has max steps, max tool calls, wall-clock deadline, budget ceiling and explicit stop/escalation conditions.

## 4. Autonomy capability ladder

| Stage | Allowed | Not allowed |
|---|---|---|
| Observe | Read approved repository/data, summarize, detect issues | Writes or external side effects |
| Propose | Create plans, draft patches and approval requests | Merge, deploy, spend or trade |
| Isolated build | Write only in isolated branch/workspace; run tests | Production mutation or secrets exposure |
| Controlled integration | Open/update PRs within configured policy; request review | Self-approve, bypass CI or merge protected branches |
| Production operation | Only individually approved release actions with rollback | Any action outside the exact approval |

Advancement is per capability and task type, not a global switch. Default stays at Observe/Propose. Live trading and withdrawals are excluded from this ladder until a separate financial safety program and explicit BOS decision.

## 5. Security and reliability test matrix

Required before any worker pilot:
- Unauthenticated and expired-token requests are rejected.
- Client cannot spoof actor, role, division, budget, autonomy stage or provider.
- Cross-scope and confidential memory retrieval is denied before ranking.
- Proposed/rejected/expired/superseded records do not appear as current approved facts.
- Secret-like content is rejected/redacted before logs and storage.
- Provider not configured returns a controlled error; no hidden fallback or billable call.
- Provider timeout, malformed output, oversized output and rate limit are bounded.
- Tool not allowlisted is denied and audited.
- Write tool is denied at Observe/Propose.
- Duplicate idempotency key does not duplicate side effects.
- Dependency cycles are rejected.
- Expired lease is reclaimed once; exhausted task reaches dead-letter.
- Pause/kill switch prevents new claims; in-flight cancellation behavior is tested.
- Worker restart does not lose task state or duplicate completion.
- Backup/restore and audit integrity are verified.
- Cost ceiling Rp0 is enforced in configuration and tests.

## 6. Backlog ready for assignment

| ID | Division | Priority | Task | Depends on | Definition of done |
|---|---|---:|---|---|---|
| NX-001 | Executive/06/07 | P0 | Freeze request, response, task and memory contracts | This spec | Versioned JSON schemas and contract tests |
| NX-002 | 01/05 | P0 | Threat model and trust-boundary review | NX-001 | Abuse cases, mitigations, negative tests approved |
| NX-003 | 07 | P0 | Reconcile memory schema with existing migrations/store | NX-001 | One canonical schema; migration drift report; no duplicate migration |
| NX-004 | 06 | P0 | Queue state-machine and RPC contract tests | NX-001 | Disposable PostgreSQL tests for transitions, idempotency, lease, dependency, pause/kill |
| NX-005 | 04 | P0 | Provider adapter interface and frozen model benchmark | NX-001 | Mock-only contract tests; no provider spend |
| NX-006 | 05 | P0 | End-to-end NEXUS chat contract tests | NX-001, NX-005 | Auth, malformed payload, provider-not-configured and response shape verified |
| NX-007 | 07/01 | P1 | Provenance-aware retrieval API design and authorization tests | NX-003 | Scope filtering before ranking; stale/conflict cases covered |
| NX-008 | 06/01 | P1 | Read-only tool registry and policy gateway | NX-002, NX-004 | Deny-by-default allowlist; audit events; write-denial tests |
| NX-009 | 02/06 | P1 | Dashboard NEXUS integration and runtime config contract | NX-006 | No secret in browser; no repeated secret entry; Hostless support verified before release |
| NX-010 | 06/05 | P1 | Worker pilot design and recovery runbook | NX-004, NX-008 | No activation; disposable env test plan and kill-switch evidence |
| NX-011 | 04/05/07 | P1 | Evaluation and curated learning loop | NX-003, NX-005 | Frozen cases, reproducible scores, human-approved promotion |
| NX-012 | Executive/01/05 | P2 | Capability-by-capability autonomy approval process | All P0 | Explicit approver, evidence, rollback and expiry for each capability |

## 7. Free-first deployment strategy

- Reuse the existing NEXUS Supabase project only after confirming current plan limits, schema state, backups and access controls.
- Use existing GitHub CI for deterministic contract/security tests within current free quotas.
- Keep model gateway in mock/no-provider mode by default. External model use is opt-in and requires an explicit cost/data policy.
- Do not provision a new database, cache, vector store, worker host or paid service.
- Do not assume static Hostless hosting can run persistent background workers. Verify runtime model, sleep/timeout, environment-variable injection, outbound network, storage persistence and free quota first.
- If no verified always-on free compute exists, NEXUS may queue and prepare work but cannot promise continuous execution. Use event-triggered CI only for tasks that fit its limits and permissions.

## 8. Stop conditions and BOS approvals

Stop and request review when:
- a task needs a paid resource or provider call;
- an action touches production data, authentication policy, secrets or external account permissions;
- the schema migration is irreversible or has uncertain rollback;
- a task requires write access beyond its assigned branch/workspace;
- a benchmark regresses or evidence conflicts;
- the runtime cannot prove kill-switch, idempotency or recovery behavior.

BOS reserved decisions: paid spend, production release/migration, secret or permission changes, global autonomy increase, exchange account connection, live orders and withdrawals.

## 9. Next handoff

The first implementation cycle should take NX-001 through NX-006 in parallel only where files and ownership are disjoint. Start with contract/schema tests against existing code and migrations. Do not duplicate existing memory or queue migrations. Keep PR WIP limits; work on the current documentation branch until Executive Office clears integration capacity.

**Current execution state:** plan only. No tests were run for this document, no database changes were applied, no provider was called, and no worker/scheduler was started.
