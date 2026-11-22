# Agent Platform Phase 0 — Architecture Decision Record

- Status: **PROPOSED — documentation only**
- Date: 22 November 2026 (Asia/Jakarta)
- Owner: BOS
- Architecture lead: Chief Strategy Advisor
- Operational coordinator: Direktur Utama
- Initial implementation leads: Divisi 06 (platform), Divisi 07 (memory)
- Mandatory gates: Divisi 01 security; Divisi 05 independent QA
- Budget: Rp0 hard ceiling; no paid fallback or unverified overage

## 1. Decision summary

Build a governed, PostgreSQL-first orchestration core in small independently reviewable stages. GitHub remains the initial durable work ledger and integration surface. Do not deploy a worker or scheduler until the database, security, QA, persistence and Hostless cost gates are evidenced.

The first implementation target is not an autonomous fleet. It is a deterministic task contract and a safe, auditable state machine that can later support one paused-by-default worker.

### Explicitly rejected for Phase 0

- GitHub Actions as an always-on worker.
- In-memory or filesystem-only queue state.
- A second queue technology (Redis) or vector database.
- Worker self-approval, self-permission escalation, automatic production deployment, or financial actions.
- Any resource provisioning or paid service under the current Rp0 policy.

## 2. System boundary and trust model

`BOS → Director → Task Queue → Division Agent → Tool Gateway → GitHub`

Cross-cutting controls:
- Identity and policy authorization before task claim and before every tool call.
- Durable task state and audit event written transactionally.
- Independent QA and security review before integration.
- Human approval for reserved actions.
- Resource caps, pause/cancel and kill switch.
- Memory retrieval applies scope and sensitivity filters before search ranking.

GitHub is the initial external tool. Hostless is the existing application/control plane, but account-level capacity, persistent mount and overage behavior remain unverified. Therefore Phase 0 must not provision Hostless resources.

## 3. Canonical task contract (v1)

Required fields:

| Field | Type | Rule |
|---|---|---|
| task_id | UUID | Immutable primary identifier |
| task_key | text | Stable idempotency key, unique within project |
| objective | text | Bounded, non-secret task description |
| division | enum 01–08 | Exactly one accountable lead |
| agent_id | text | Registered identity; never inferred from user input |
| status | enum | proposed, ready, claimed, running, blocked, review, done, failed, cancelled |
| priority | smallint | Bounded project-defined range |
| depends_on | UUID[] | Valid task IDs; reject cycles |
| acceptance_criteria | JSON/text | Testable, explicit and finite |
| allowed_tools | text[] | Allowlist; empty means no tool calls |
| scope | JSON | Repository, paths, branch and permitted operations |
| budget_usd | numeric | Must equal 0 under current BOS policy |
| max_attempts | integer | 1–3 |
| attempt_count | integer | 0..max_attempts |
| deadline_at | timestamp | Required before claim |
| lease_owner | text/null | Set atomically during claim |
| lease_token | UUID/null | Fencing token, rotated on every claim |
| lease_expires_at | timestamp/null | Required while claimed/running |
| idempotency_key | text | Unique side-effect boundary |
| input_ref/result_ref | text/null | References to bounded artifacts, not secret blobs |
| created_at/updated_at | timestamp | Server-generated |

No task may contain credentials, seed phrases, API secrets, raw private exchange payloads or unrestricted user content. Enforce payload-size limits at API and DB boundaries.

### State transition rules

- proposed → ready only after validation and policy checks.
- ready → claimed only through a single atomic claim transaction.
- claimed → running only by the current lease owner/token.
- claimed/running → blocked, review, done, failed or cancelled only through validated transition commands.
- expired claimed/running tasks return to ready only after lease expiry and fencing checks; attempts increment exactly once.
- failed tasks may retry only when retryable, attempts remain, and bounded backoff has elapsed.
- done/failed/cancelled are terminal; reopening creates a new task linked to the prior task.
- A task with incomplete dependencies cannot be claimed.
- Dependency cycles are rejected at creation/update.

## 4. Event contract (append-only)

Every state mutation emits an event in the same transaction as the mutation.

Required fields:
- event_id (UUID), task_id, event_type, actor_id, actor_type, division;
- occurred_at (server timestamp), correlation_id, causation_id;
- from_status, to_status;
- safe_metadata (bounded JSON, allowlisted keys only);
- source_ref/artifact_ref where relevant.

Events include: task.proposed, task.validated, task.ready, task.claimed, task.heartbeat, task.blocked, task.review_requested, task.completed, task.failed, task.cancelled, task.retried, approval.requested, approval.granted, approval.denied, tool.invoked, tool.denied, worker.paused and worker.resumed.

Do not call the event log cryptographically tamper-evident unless a real signing/hash verification scheme is implemented and independently tested. Runtime callers cannot spoof actor identity; a trusted server-side writer derives actor identity from authenticated context.

## 5. Division permission matrix

| Role | Read | Propose task | Claim/execute | GitHub write | Approve |
|---|---|---|---|---|---|
| BOS | All project records | Yes | Reserved owner actions only | Explicitly authorized | Reserved actions |
| Director | Cross-division summaries | Yes | Coordinate only | PR/comment/issue within delegated scope | Project task acceptance; not BOS-reserved |
| Div 01 | Security-scoped records | Security tasks | Security checks | Security PRs only | Security gate; not BOS-reserved |
| Div 02 | UI scope + approved shared facts | UI tasks | UI work | Scoped UI branch/PR | No security/production approval |
| Div 03 | Exchange/on-chain scope | Domain tasks | Read-only integrations initially | Scoped code PR | No trade/financial approval |
| Div 04 | AI/research scope | Research tasks | Non-sensitive analysis | Scoped code/docs PR | No provider spend approval |
| Div 05 | Test evidence + needed source | QA tasks | Tests/review | Test/workflow PR | QA gate; not security/BOS approval |
| Div 06 | Task/registry metadata | Platform tasks | Queue/worker lifecycle only after gates | Scoped platform PR | Cannot approve own work |
| Div 07 | Approved shared knowledge + own scope | Memory proposals | Curate/retrieve | Scoped docs/schema PR | Cannot approve own records |
| Div 08 | Procurement/public source scope | Procurement tasks | Research only | Scoped docs/config PR | No purchase/provider activation |

Default deny applies. Read access is purpose-limited; no division receives unrestricted access to another division's private work. A contributor cannot approve its own change.

## 6. Approval matrix

| Action | Required approval |
|---|---|
| Read public repository/source and create isolated proposal branch | Delegated role policy |
| Low-risk docs/code PR | Independent Div 05 QA; Div 01 if security surface |
| Schema or DB migration design | Div 06 + Div 01 security + Div 05 migration QA |
| Production migration, storage mount, persistent resource | Explicit BOS approval after cost/rollback evidence |
| Secret creation/rotation, IAM or permission change | Explicit BOS approval + Div 01 review |
| Hostless deploy/restart/config change with production impact | Explicit BOS approval unless a later policy explicitly delegates it |
| Paid service, payment method, overage exposure | Prohibited under Rp0; requires BOS policy change |
| Exchange write, signing, transfer, withdrawal, live order | Prohibited in initial platform; explicit BOS approval and separate safety program required |
| Worker policy/autonomy-stage escalation | BOS approval; workers cannot self-escalate |

Approval records must bind the exact action, target, diff/config revision, actor, expiry and evidence. Approval cannot be reused for a materially changed action.

## 7. Transaction and worker invariants

Before enabling a worker, tests must prove:
1. Atomic claim uses row locking (e.g. `FOR UPDATE SKIP LOCKED`) and only one worker receives a task.
2. Lease token fencing rejects stale workers after expiry/reclaim.
3. Heartbeats cannot extend a lease after its token expires or changes.
4. Task mutation and audit event commit or roll back together.
5. Idempotency prevents duplicate side effects across retries.
6. Dependency completion and cycle checks are enforced transactionally.
7. Retry count/backoff/dead-letter behavior is bounded.
8. Cancellation and kill switch prevent further tool calls.
9. Restart recovery reclaims only expired leases and preserves audit history.
10. Actor identity is server-derived; no caller can write arbitrary actor fields.
11. Per-task time, token, request and payload limits are enforced.
12. Runtime remains OFF when policy, DB, persistence or resource checks fail.

## 8. Delivery sequence

- **Phase 0 — contract (this ADR):** agree task/event contracts, role and approval matrix, threat boundaries and E2E acceptance plan.
- **Phase 1 — schema foundation:** reconcile PR #34 with current main; Div 01 security and Div 05 QA must independently review exact head. Schema merge is not runtime activation.
- **Phase 2 — queue API:** transactional claim, lease fencing, state transitions, dependencies, retries, idempotency, trusted audit writer. Runtime flag remains OFF.
- **Phase 3 — Director + GitHub gateway:** bounded GitHub read/write actions, isolated branch/PR workflow, approval gate.
- **Phase 4 — Div 07 memory:** curated records, provenance, access-aware retrieval, PostgreSQL FTS; no vector DB.
- **Phase 5 — one controlled worker:** only after verified durable storage, Hostless Rp0/no-overage proof, security sign-off, E2E tests and explicit BOS approval.
- **Phase 6 — measured expansion:** add concurrency/divisions only when reliability, QA escape rate, audit completeness and budget remain within targets.

## 9. E2E acceptance plan

| Scenario | Expected result |
|---|---|
| One Director objective creates dependent Div 06 + Div 07 tasks | Correct dependency graph and single accountable lead per task |
| Two workers race to claim one task | Exactly one claim succeeds |
| Old worker reports after lease reclaim | Fencing token rejects mutation |
| Dependency unfinished / cycle attempted | Claim blocked / cycle rejected |
| Same idempotency key submitted twice | One logical task/side effect |
| Retryable failure | Bounded backoff; attempt cap enforced |
| Non-retryable failure or attempt cap reached | Dead-letter/failed with audit event |
| Task and audit write fault injected | Both roll back |
| Worker process restarts | Expired lease recovered; completed tasks remain done |
| Unauthorized division reads restricted memory | Denied and safely audited |
| Agent attempts secret, deploy, migration or financial tool | Denied or routed to explicit approval |
| Kill switch activated | No new claims or tool invocations; active work stops safely |
| Hostless quota/cost evidence unavailable | Runtime remains OFF |
| Any test/provider exceeds Rp0 policy | Circuit breaker; no paid fallback |

## 10. Operational SLOs for pilot (proposed)

- 100% task state changes have an audit event.
- 0 duplicate successful claims for one active lease.
- 0 unauthorized tool actions.
- 100% tasks carry acceptance criteria, owner, scope and budget cap.
- 100% approved memory records have provenance and reviewer metadata.
- 0 paid usage; hard budget Rp0.
- Worker uptime is not an initial KPI until a worker is deployed; first pilot measures correctness and recovery, not availability claims.

## 11. Open decisions and blockers

- Hostless persistent mount, current quota and overage guard are not verified; no resource provisioning.
- Existing Hostless EROFS means current file persistence is not production-ready.
- PR #34 remains draft pending exact-main synchronization and independent Div 01/05 review.
- Trusted actor-bound audit writer and transactional queue semantics are not implemented.
- Div 07 retention durations are proposals until Div 01/BOS approval.
- No production schema migration, DB adapter, scheduler, worker, approval queue or kill switch is active.

## 12. Definition of done for Phase 0

- [ ] Div 06 confirms task/event contract and queue invariants.
- [ ] Div 07 confirms memory references and record linkage.
- [ ] Div 01 approves threat boundaries, identity, least privilege and retention review plan.
- [ ] Div 05 approves E2E test matrix and exact-head CI gate.
- [ ] Director records PIC, dependencies and one PR per bounded implementation stage.
- [ ] BOS approves any reserved policy change; current Rp0 policy is unchanged.

This ADR is a proposal for review. It does not dispatch agents, create resources, enable background execution or authorize production changes.
