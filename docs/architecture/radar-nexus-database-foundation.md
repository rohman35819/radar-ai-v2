# RADAR NEXUS Database Foundation — Design v1

- Date: 2026-11-27 (Asia/Jakarta)
- Status: **Design proposal; not approved for SQL application**
- Lead: Division 07 — Knowledge & Memory Systems
- Supporting: Division 01 — Security & Reliability; Division 06 — Agent Platform & Automation; Division 05 — QA, Testing & DevOps
- Target: separate Supabase project "radar-nexus-core"
- Project ref: "zhvznjcsxrtybqcpbryu"
- Project URL: "https://zhvznjcsxrtybqcpbryu.supabase.co"
- Cost boundary: Rp0 / Supabase Free only; no paid add-ons, overages, or trials converting to paid.

## 1. Verified provisioning facts

BOS dashboard evidence on 2026-11-27:
- Project "radar-nexus-core" exists under organization "RADAR NEXUS", Free plan.
- Dashboard status Healthy; compute nano; branch main.
- No GitHub repository connected, no migrations, no backups, and no requests/warnings/errors in the displayed 60-minute window.
- Region was displayed as Auto during project creation; actual selected region has not been independently verified.
- No database password, API key, or secret is recorded in this document.

Provisioning does **not** prove schema, RLS, API integration, backup/restore, or application persistence is implemented.

## 2. Data ownership and trust boundary

### NEXUS-owned data
- Conversation sessions and messages.
- Durable AI memory and curated knowledge.
- Skill/agent metadata and version references.
- Agent task state, task dependencies and execution summaries.
- Evaluation results, provenance/source references and NEXUS audit events.

### RADAR-owned data (must remain in RADAR database)
- Market observations, scanner results, watchlists.
- Portfolio and exchange operational state.
- Alerts and RADAR operational audit records.

NEXUS may request intentionally published RADAR information through authenticated, versioned APIs. It must not read or write RADAR tables directly. RADAR must not use NEXUS database credentials. Shared information is transferred as validated API payloads; each side stores only its own permitted copy.

## 3. Proposed logical schema

All names below are proposals, not existing tables. Keep application tables in a private schema (proposed "nexus") rather than exposing them through the default public Data API. Enable RLS and explicitly revoke broad access; create narrowly scoped policies only after the runtime identity model is reviewed.

| Table | Purpose | Important fields / constraints |
|---|---|---|
| nexus.conversations | Session metadata | id UUID; owner_subject; title; status; created_at; updated_at; archived_at |
| nexus.messages | Session messages | id UUID; conversation_id FK; sequence_no; role; content; content_format; created_at; idempotency_key; unique(conversation_id, sequence_no); scoped idempotency |
| nexus.memory_records | Durable curated memory | id UUID; owner_subject; memory_type; content; scope; sensitivity; approval_status; source_ref; source_revision; valid_from; valid_until; supersedes_id; created_at; updated_at |
| nexus.knowledge_documents | Curated knowledge units | id UUID; namespace; title; body; source_uri; source_revision; provenance JSONB; approval_status; sensitivity; published_at; expires_at |
| nexus.skills | Skill catalogue metadata | id UUID; name; version; description; source_revision; status; permission_profile_id; created_at |
| nexus.agents | Agent registry metadata | id UUID; division_code; name; version; status; capability_manifest JSONB; permission_profile_id; prompt_revision; created_at; updated_at |
| nexus.tasks | Durable task lifecycle | id UUID; task_type; requested_by; assigned_agent_id; status; priority; autonomy_stage; input_ref; output_ref; idempotency_key; attempt_count; max_attempts; available_at; deadline_at; lease_owner; lease_expires_at; created_at; updated_at |
| nexus.task_dependencies | Task dependency edges | task_id; depends_on_task_id; unique pair; reject self-edge; cycle detection in transactional service logic |
| nexus.evaluations | Model/agent evaluation evidence | id UUID; agent_id; task_id; evaluator; rubric_version; score JSONB; verdict; evidence_ref; created_at |
| nexus.audit_events | Append-only audit trail | id UUID; actor_type; actor_id; action; entity_type; entity_id; outcome; correlation_id; metadata JSONB (sanitized); created_at |

### Design notes
- Use UUID primary keys and UTC timestamps (timestamptz).
- Use explicit tenant/owner subject on every user-owned record. Never trust a caller-supplied owner id without deriving/validating it from authenticated identity.
- Message content and memory content are data, not executable instructions. Treat model/tool/web content as untrusted.
- Store large binary attachments in a separately reviewed object-storage design; do not assume Supabase Storage is free/unlimited.
- Do not add pgvector, Redis, external vector DB, or paid embedding services in v1. Start with PostgreSQL indexes and full-text search after measured need.
- Do not store raw API keys, passwords, access tokens, exchange payloads, hidden chain-of-thought, or routine chat transcripts as shared project memory. Conversation messages are NEXUS product data only if explicitly required by product behavior and governed by retention/privacy policy.
- Retention durations, user deletion semantics, and legal/privacy policy require explicit review before production data is written.

## 4. Indexing and retrieval (initial, no vector infrastructure)

- Conversations: index owner_subject + updated_at.
- Messages: unique conversation_id + sequence_no; index conversation_id + created_at.
- Memory: index owner_subject + scope + approval_status + valid_until; add full-text GIN only after query design is tested.
- Knowledge: index namespace + approval_status + sensitivity + published_at; full-text index over approved searchable fields.
- Tasks: partial index for runnable statuses + available_at; index assigned_agent_id + status; unique idempotency key within its caller scope.
- Audit: index created_at and correlation_id; append-only from runtime roles.
- Retrieval must filter identity/tenant, scope, sensitivity, approval status, validity and retention **before** ranking or text search. Never let ranking override authorization.

## 5. Identity, RLS and permissions — mandatory security review

Proposed role separation:
- Migration owner: schema changes only; not used by application runtime.
- NEXUS API runtime: narrowly scoped read/write on explicitly approved tables through server-side connection; no DDL, no role management, no cross-project access.
- Read-only analyst: only approved views/records; no raw private messages unless explicitly authorized.
- Worker identity: no direct database owner privileges; task claims and state transitions must use a constrained service interface.
- Browser/Termux: no service-role key, no database password, no unrestricted direct access to private tables.

Security invariants:
1. RLS enabled on all user-scoped tables; policies tested for both allowed and denied identities.
2. Default-deny grants. No broad anon or authenticated grants to private application tables.
3. Service-role credentials remain server-side and are never placed in browser bundles, Termux config shared to Git, model prompts, logs, or documentation.
4. Separate NEXUS and RADAR credentials; never reuse or share database passwords.
5. Validate payload size/type, rate limit, authenticate/authorize each API call, and bind audit correlation IDs.
6. Audit events are append-only for runtime roles; no UPDATE/DELETE/TRUNCATE privileges to application identities.
7. No worker can modify its own permission profile, autonomy stage policy, budget cap, or kill switch.
8. API responses expose only allowlisted fields; redact secrets and sensitive content.

## 6. Task state model for future Agent Platform

Proposed lifecycle:
queued → claimed → running → succeeded | failed | cancelled | dead_letter

- Claim must be transactional, lease-based and concurrency-safe.
- Every claim has a lease expiry and fencing token; expired workers cannot commit stale results.
- Retries are bounded and use backoff; terminal failures go to dead-letter state.
- Idempotency is required for enqueue and completion.
- Dependencies must be cycle-checked and cannot run until all prerequisites succeed.
- Each task carries acceptance criteria, allowed tool set, file/resource scope, deadline, maximum attempts, and hard budget of USD 0.
- Queue remains paused and kill switch remains ON by default until separately approved.
- No scheduler, worker, model provider, GitHub write agent, deployment, trading or withdrawal is activated by this schema design.

## 7. API bridge contract boundary

Initial bridge should be read-only and versioned:
- NEXUS → RADAR: request a narrow market/context snapshot, with explicit asset/timeframe/window and freshness requirement.
- RADAR → NEXUS: submit an approved analysis request or consume a bounded analysis response.
- Each request has caller identity, scope, schema version, correlation id, idempotency key, created_at, expires_at, source provenance and freshness metadata.
- Reject unauthenticated, unauthorized, malformed, stale, replayed, oversized, or secret-bearing payloads.
- Explicit timeout/error response; no silent fallback to the other database or persistent phone storage.
- No order placement, exchange account private read, permission change, portfolio mutation, withdrawal, or production action in v1.

## 8. Backup, restore and free-tier operations

- Before storing important data, establish a documented encrypted manual export and restore drill. Dashboard currently reports no backups.
- Backup material must be stored outside the same project, encrypted, access-controlled, and never committed to GitHub.
- Test restore into a disposable project/database before claiming recoverability.
- Monitor database size, egress, storage, request volume and inactivity pause behavior against the current Free limits.
- Never enable paid compute, add-ons, overages, or billing conversion. If quotas are insufficient, stop writes and present a free alternative; do not silently upgrade.
- Confirm actual region and account/project quota before connecting runtime.

## 9. Phased implementation and acceptance gates

### N0 — Schema/security design (draft implementation started)
- Division 07: approve table ownership, provenance, retention and retrieval rules.
- Division 01: threat model, identity mapping, RLS/grants and secret boundary.
- Division 06: task lifecycle, API contract, agent/permission registry interface.
- Division 05: migration and isolation test plan.
- Exit: all four divisions review design; no unresolved P0/P1 security finding.

### N1 — Disposable migration validation
- Review the draft SQL with Division 01/06/07 and correct findings.
- Apply to disposable PostgreSQL/Supabase-compatible database first; never target the BOS project.
- Test schema constraints, RLS allow/deny matrix, append-only audit, task transition/lease/idempotency, dependency cycle rejection and rollback.
- Exit: exact migration SHA, test logs, security review and QA sign-off.

### N2 — NEXUS project schema deployment
- Verify project region, Free quota, backup/export path and secret storage.
- BOS explicitly approves applying migration to the NEXUS project.
- Apply schema; verify RLS/grants and health; no RADAR data copied.
- Exit: schema catalog evidence and security smoke test.

### N3 — NEXUS API persistence pilot
- Server-only NEXUS API identity; no browser/Termux direct privileged database access.
- Persist only synthetic/test conversations and approved knowledge.
- Test restart/reinstall recovery and explicit cloud-write failure.
- Exit: evidence for isolation, recovery, quota and failure behavior.

### N4 — RADAR↔NEXUS API bridge
- Read-only, authenticated, versioned contract with provenance/freshness and audit.
- Independent Divisi 01/05 review; BOS approval before production connection.
- No trading or external financial actions.

## 10. Division backlog

| Division | Work item | Deliverable | Acceptance |
|---|---|---|---|
| 07 | Data ownership + logical model | This schema proposal, field dictionary, retention proposal | Every table has owner, purpose, provenance, sensitivity and lifecycle |
| 01 | Threat model + RLS matrix | Abuse cases, role/grant matrix, policy tests | Cross-user and cross-project access denied by default |
| 06 | Task/API contracts | OpenAPI or typed TS contracts, state transition spec | Idempotency, freshness, retry, lease and kill-switch semantics defined |
| 05 | Validation suite | Disposable migration/RLS/restore tests | Exact-head repeatable pass; negative tests included |
| Executive Office | Sequence and conflict control | One lead per task; no overlapping file ownership | WIP policy respected; blockers have owner and next condition |
| BOS | Reserved approvals | Project migration approval and any production connection | Explicit approval before NEXUS SQL deployment or production data |

## 11. Explicit non-goals / current status

- No SQL has been run on the NEXUS project.
- Draft migration `supabase/nexus-migrations/20261127_0001_nexus_private_foundation.sql` has been created on the review branch. It is not a Supabase CLI migration path and has not been executed or validated against PostgreSQL.
- No application code, API bridge, worker, scheduler, agent runtime, or cloud persistence is active.
- No backup/restore has been demonstrated.
- No production or RADAR data has been copied.
- No paid service/resource is enabled.
- Existing earlier migration proposal written for a shared public schema remains unsuitable and must not be applied unchanged.

## 12. Next actions

1. Division 01 reviews the security/identity/RLS section and returns explicit findings.
2. Division 07 resolves owner identity, memory provenance, retention and deletion semantics.
3. Division 06 reviews task lifecycle, idempotency, lease and API bridge contracts.
4. Division 05 prepares a disposable PostgreSQL test matrix; do not target the NEXUS project yet.
5. Review and validate the draft migration on a disposable PostgreSQL database. Applying SQL to the BOS NEXUS project remains a separate explicit approval gate.


## 13. RADAR is the sole control plane; NEXUS is an internal subsystem

BOS clarified on 2026-11-27 that NEXUS must live within the RADAR AI V2 product and remain under RADAR AI V2's full operational control. The separate Supabase project/database is a storage-isolation boundary only; it does not create a separate product owner, command hierarchy, or independent governance domain.

- RADAR AI V2 is the single product/control plane and BOS is the ultimate authority.
- RADAR-owned control services govern NEXUS configuration, agent/skill registry activation, model/provider policy, task priorities, permission profiles, budgets, approval gates, pause/kill switch, audit and release lifecycle.
- NEXUS is an internal capability subsystem providing AI reasoning interfaces, conversations, memory/knowledge retrieval, agent orchestration and task-state persistence as approved by RADAR.
- NEXUS may execute only within capabilities and scopes issued by RADAR. It cannot grant itself permissions, change autonomy/budget policy, bypass approval, or initiate production/financial actions.
- NEXUS data remains in its separate NEXUS database; RADAR operational data remains in RADAR storage. Cross-boundary access uses authenticated, versioned, least-privilege APIs with provenance, freshness, idempotency, correlation IDs and audit.
- RADAR's control plane must remain authoritative even if NEXUS storage/API is unavailable; fail closed for NEXUS-dependent operations and preserve core RADAR functionality where possible. No silent database fallback or shared database credentials.
- Product navigation, user-facing configuration and BOS administration should present NEXUS as an integrated RADAR subsystem, not as a separately governed product.

This clarification supersedes any interpretation of the separate NEXUS Supabase organization/project as independent organizational or operational ownership. It does not authorize SQL deployment, production integration, workers, schedulers, or paid resources.


## 14. NEXUS as the core intelligence and RADAR system operator

BOS clarified on 2026-11-27 that NEXUS is intended to be RADAR AI V2's core intelligence/brain. NEXUS should continuously improve its usable capabilities by learning from and collaborating with other AI systems, and should be able to manage and evolve RADAR AI V2, including dashboard presentation and functionality. This is a product objective and staged architecture target, not a claim that these capabilities are currently active.

### Intelligence and learning
- NEXUS is the central reasoning, memory, knowledge, agent-coordination and evaluation layer for RADAR AI V2.
- It may consult external AI systems (including Grok, DeepSeek and other approved providers) as teachers, critics, researchers or specialist agents. Provider choice remains configurable and provider-neutral; no paid provider or resource is enabled without BOS approval.
- External outputs are untrusted proposals/evidence, not authoritative instructions. NEXUS must capture source/model/version, timestamp, task/prompt revision where appropriate, evidence references and evaluation results; compare independent answers, run tests and retain only validated knowledge/skills with provenance and version history.
- Distinguish learning (curated knowledge, memory, reusable skills, tool procedures and evaluation feedback) from training/fine-tuning model weights. No model-weight training or autonomous provider billing is implied.

### RADAR management and dashboard evolution
- NEXUS may inspect RADAR's permitted repository, architecture, tests, telemetry and dashboard components; diagnose issues; propose and implement scoped changes to UI, dashboard layout, features and internal functions.
- All changes must be made in isolated workspaces/branches with bounded file/resource scope, tests, secret scanning, diff review, preview/build evidence and rollback path. Preserve existing dashboard behavior unless a change is explicitly intended and validated.
- Low-risk reversible changes may be prepared autonomously in a sandbox/branch under a RADAR-issued capability token. Merging, production deployment, permission/security changes, schema/data migrations, exchange operations, live trading and withdrawals remain approval-gated according to risk and BOS policy.
- NEXUS cannot grant itself repository permissions, widen its own scope, bypass CI/review, disable safeguards, or deploy directly to production. RADAR's policy/approval gateway remains the authority; BOS has final override and kill-switch control.
- The dashboard should expose NEXUS status, approved model/provider roster, agent/task activity, knowledge/evaluation health, proposed changes, diffs/previews, approvals, audit history and pause/kill controls. NEXUS is surfaced as the integrated core brain inside RADAR, not as a separately controlled product.

### Capability rollout gates
1. Observe: read approved repository/dashboard context and produce grounded analysis.
2. Propose: create design and change proposals with impact/risk/test/rollback plans.
3. Build: implement in isolated branch/workspace and run automated tests/security checks.
4. Validate: preview and regression checks; independent control for high-risk changes.
5. Integrate: merge/deploy only through RADAR policy gates and required BOS approval.
6. Operate: monitor, rollback and record outcomes; no unbounded self-modification.

None of these capabilities should be described as continuously learning, managing, editing, or deploying until the corresponding runtime, permissions, tests and operational evidence exist.


## 15. BOS decision — NEXUS trading authority; withdrawal reserved to BOS

Decision recorded 2026-11-27 (Asia/Jakarta), superseding any conflicting v1 statements in Sections 2, 7, 9, 10, 13 and 14 about NEXUS being categorically barred from exchange operations or live trading.

### Granted product capability (target state; not yet implemented or activated)
- NEXUS is authorized by BOS, as a product requirement, to read RADAR operational/market/portfolio data and to perform exchange trading and transaction operations within capabilities and risk limits issued by RADAR.
- Trading operations may include placing, modifying and cancelling orders; buying/selling assets; opening, managing and closing positions; and running an approved automated strategy.
- NEXUS may use private exchange account capabilities required for balances, positions and trading, but only through a RADAR-controlled execution gateway and dedicated credentials.
- Autonomous trading is permitted only inside an explicit BOS-approved strategy mandate: exchange/account, allowed instruments, allowed order types, maximum order/notional/exposure, loss and drawdown limits, rate limits, session/expiry, and stop conditions. Missing or exceeded limits must deny execution and trigger a safe stop.
- RADAR policy remains the enforcement point. NEXUS cannot grant itself trading scopes, increase limits, change the approved strategy mandate, disable risk controls, or bypass audit/kill switch.

### Absolute withdrawal prohibition
- Withdrawal of any asset or funds to an external wallet, bank account, address, or destination is **BOS-only**. NEXUS, its agents, workers, service identities and API credentials must never have withdrawal permission.
- Exchange API keys used by NEXUS must have withdrawal/transfer-out permissions disabled at the exchange level, not merely blocked by a prompt or application policy. Use separate credentials where supported, IP restrictions, secret vaulting and key rotation.
- The RADAR execution gateway must explicitly deny withdrawal endpoints and equivalent asset-egress operations. Tests must prove denial even if NEXUS requests it, an external model suggests it, or a task payload attempts prompt/policy injection.
- Only BOS-controlled authenticated workflow may initiate a withdrawal, with independent confirmation and an auditable record. NEXUS may prepare information for BOS but may not submit, sign, approve or execute the withdrawal.
- Internal transfers between exchange accounts/subaccounts are not automatically granted by this decision; treat them as separately scoped fund-movement operations requiring explicit BOS policy.

### Mandatory controls before any live transaction
1. Start with exchange sandbox/testnet and paper execution; verify order lifecycle, idempotency, reconciliation, duplicate prevention, partial fills, timeouts and cancel/replace behavior.
2. Live trading remains OFF until BOS separately approves the named exchange/account, credential scope, strategy, capital ceiling, risk limits and go-live checklist.
3. Never store exchange secrets in NEXUS memory, prompts, logs, browser or repository. Credentials remain server-side in a secret manager and are never exposed to model context.
4. Enforce pre-trade risk checks, price/quantity precision, min-notional, stale-market-data rejection, slippage bounds, exposure limits, daily loss/drawdown stops, rate limits, and emergency kill switch.
5. Every decision and order must carry actor/agent identity, mandate revision, capability scope, idempotency key, correlation ID, market-data provenance/freshness, risk-check result and exchange order identifiers.
6. Reconcile exchange fills, fees, balances and positions against RADAR's ledger; alert and halt on unexplained divergence.
7. Withdrawal denial must be covered by unit, integration and negative authorization tests against the actual gateway/credential configuration before any live trading is enabled.

### Authority clarification
This decision grants NEXUS the intended ability to trade; it does not grant unlimited capital, unrestricted account administration, withdrawal, or permission to activate live trading immediately. BOS remains the sole authority for withdrawal and the final authority for enabling live trading mandates. This architecture decision does not itself connect an exchange, create credentials, place an order, or activate a worker.


## 16. BOS decision — standing autonomous strategy and trading mandate

Decision recorded 2026-11-27 (Asia/Jakarta). This section clarifies the intended autonomy level in Section 15.

### No per-trade BOS approval
- Once BOS establishes and enables a standing operating mandate, NEXUS does **not** need BOS approval for each trade, order, position adjustment, strategy selection, or routine strategy execution that stays inside that mandate.
- NEXUS is expected to independently discover opportunities, formulate hypotheses, evaluate and select strategies, backtest, paper trade, monitor, execute enabled strategies, reconcile results, and adjust strategy parameters within the mandate.
- NEXUS should pursue sustainable net returns for RADAR AI V2 rather than wait for BOS to issue individual trading instructions. It must report performance, drawdown, exposure, incidents and material strategy changes to the RADAR control center.
- NEXUS may autonomously stop or reduce risk when safety conditions, data quality, loss limits, drawdown limits, connectivity, reconciliation or execution integrity require it. It must never disable or raise its own risk limits.

### Standing mandate, not unlimited authority
- BOS approval is required to establish or materially expand the standing mandate: permitted exchange/account, capital allocation ceiling, instruments/markets, leverage policy (default disabled), order types, exposure caps, maximum position size, daily/weekly loss and drawdown limits, slippage bounds, strategy classes, operating hours, and expiry/review conditions.
- Within an enabled mandate, routine execution and strategy optimization are autonomous and do not require per-action BOS approval.
- NEXUS may not increase capital allocation, leverage, risk ceilings, allowed markets, or permissions; enable a new exchange/account; or override a stop condition. Such changes require a new BOS-approved mandate revision.
- Strategy evaluation must avoid look-ahead bias, data leakage, survivorship bias and overfitting; include fees, spread, slippage, latency and realistic fill assumptions. Promotion from research to paper and from paper to live must follow explicit objective acceptance gates. A live mandate must be enabled by BOS once, after the relevant evidence is reviewed; subsequent in-mandate trades do not need repeated approval.
- If no live mandate has been explicitly enabled, NEXUS may continue research and paper/testnet execution but must not place live orders.

### Withdrawal remains categorically excluded
- NEXUS has no withdrawal permission, no transfer-out capability and no ability to alter exchange API key permissions.
- Only BOS may initiate and authorize withdrawal through a separate BOS-controlled workflow.
- Trading automation must be technically unable to invoke withdrawal or equivalent external asset-egress operations.

### Operational reporting and stop conditions
- NEXUS runs only while its approved runtime, budget and risk limits permit. It must stop new orders and enter a safe state on kill-switch activation, stale/invalid market data, exceeded loss/exposure limits, uncertain order status, failed reconciliation, suspected credential compromise or policy service unavailability.
- Every autonomous strategy action must be attributable and auditable, including strategy/version, inputs and data provenance, mandate revision, risk checks, order idempotency, exchange acknowledgements/fills, fees and resulting positions.
- The system must never claim guaranteed profit. Profit generation is the objective; losses remain possible and must be bounded, measured and reported.

This decision authorizes the product design for autonomous in-mandate trading without per-trade BOS approval. It does not mean live trading is active today, does not itself enable exchange credentials or workers, and does not waive the one-time BOS approval required to activate a live trading mandate.

## 17. BOS clarification — autonomous opportunity-to-execution without approval waits

Decision recorded 2026-11-27 (Asia/Jakarta), clarifying BOS's requested operating behavior beyond Section 16.

- BOS's desired behavior is that NEXUS does not pause to ask BOS for permission when it detects an opportunity, selects or adjusts an in-scope strategy, or executes a routine trade. NEXUS is expected to move from detection through analysis, risk evaluation and execution autonomously, then report outcomes.
- Do not create a per-opportunity, per-strategy, per-order or per-position human approval queue. A human approval queue must not be used as the normal trading control loop.
- BOS also requested that NEXUS not wait for a separate strategy mandate. This is a product requirement for frictionless autonomy, **not permission for unlimited use of funds or unrestricted exchange access**.
- Before live trading can be technically possible, the system must have a fixed machine-enforced operating envelope configured outside the model's control: designated exchange/account, maximum allocated capital, allowed instruments, leverage policy (default off), position/exposure caps, loss/drawdown stops, execution constraints, and expiry/kill-switch behavior. These are hard safety invariants, not per-trade approval steps. NEXUS cannot create, expand or disable them.
- If the operating envelope, account permissions, valid market data, risk service or reconciliation is missing or unhealthy, execution must fail closed. NEXUS may continue research and paper/testnet work and report the exact blocker; it must not guess missing limits or use unbounded capital.
- NEXUS may independently discover, evaluate, choose, execute, monitor, stop and optimize strategies within the machine-enforced envelope without waiting for BOS. It must report activity and performance asynchronously.
- Withdrawal and external asset-egress remain technically impossible for NEXUS and every agent, worker and credential. Only BOS-controlled workflow may withdraw.
- This section records the requested autonomy behavior; it does not claim that exchange integration, operating limits, runtime, workers or live trading are implemented or active. No live order has been authorized or placed by this documentation change.
