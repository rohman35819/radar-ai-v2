# ADR-002 — Agent Platform v1: Durable Observe-Only Contracts

**Status: DRAFT — submitted for review. NOT approved by BOS.** Date: 2026-11-27. Owner: BOS · Authors: Grok for Divisi 06/07 · Reviewers required: Divisi 01 (security), Divisi 05 (QA), BOS/Direktur Utama (approval).
**Scope:** design only. No scheduler, worker, queue runtime, production DB, paper ledger or execution capability is implemented or activated by this ADR.

## Context

PR #160 proved a deterministic observe-only path: internal gateway → `market-observation.v1` → `market-observation-input.v1` → `market-observation-shadow.v1` OBSERVE_ONLY receipt. Its replay `seen` state is caller-supplied and in-memory, so restart safety and cross-process dedupe are unproven. NEXUS names the required boundaries but does not implement them. This ADR fixes the technical decisions for the first Agent Platform slice before any runtime code is written.

## Decisions

### 1. Event envelope and schema versioning
**Decision:** all tasks use `agent-task-envelope.v1` with immutable `schema_version`, `task_type` (only `OBSERVE_MARKET` in v1), `requested_at`, `expires_at`, `budget`, `risk_scope`, and `input` referencing a validated contract. Unknown versions fail closed.
**Alternatives:** untyped JSON (rejected — drift), versionless enum (rejected — no safe migration). **Rationale:** versioned contracts allow replay of old artifacts without reinterpretation. **Risk:** schema drift across services. **Acceptance:** guard rejects wrong version, unknown task_type, missing provenance; parity test between TS contract and fixture.

### 2. `event_id`, `idempotency_key`, deduplication
**Decision:** `event_id = sha256(canonical(task body))`; `idempotency_key = sha256(event_id + input.provenance_ref + input.observed_at)`. Unique DB constraint on `(idempotency_key, task_type)`; duplicate submission returns the original receipt without a second effect.
**Alternatives:** random UUID (rejected — not reproducible), caller key (rejected — forgeable). **Rationale:** deterministic identity across retry/restart. **Risk:** canonicalization changes break old IDs; version the canonicalizer. **Acceptance:** same envelope submitted twice produces one effect and one audit event; different harmless metadata does not change `event_id` proof of content unless body changed.

### 3. Durable state and replay protection across processes
**Decision:** PostgreSQL (existing disposable `radar_agent.*` schema, no new paid DB) is the system of record for task envelopes, audit events and replay keys. `seen` moves out of the caller into `task_event` lookups with a unique index. No production data is touched in this ADR.
**Alternatives:** caller array (current, rejected — non-durable/forgeable), Redis (rejected — extra service/cost), in-memory global (rejected — restart loss). **Rationale:** restarts and two consumers require shared state. **Risk:** DB unavailability blocks processing; fail closed and retry only transient failures. **Acceptance:** restart test and two-consumer test show exactly one effect for one idempotency key.

### 4. Queue lifecycle
**Decision:** states `pending → leased → running → succeeded | failed → dead-letter`; terminal states immutable; every transition writes an audit event in the same transaction where supported.
**Alternatives:** single `done` flag (rejected — no recovery semantics), silent delete (rejected — loses evidence). **Rationale:** explicit failure/recovery boundary. **Risk:** stuck `running` tasks. **Acceptance:** legal-transition tests reject invalid jumps; stuck tasks reclaimed after lease expiry.

### 5. Retry, timeout, lease expiry, recovery
**Decision:** max 3 attempts, per-task timeout, exponential backoff with jitter, lease fencing token, heartbeat before expiry, reclaim expired leases, dead-letter after cap. Retry only transient errors.
**Alternatives:** infinite retry (rejected — unbounded spend), no lease (rejected — double execution). **Rationale:** bounded, auditable recovery. **Risk:** duplicate effects if fencing fails. **Acceptance:** concurrency/restart/reclaim tests with disposable DB show no duplicate audit effects.

### 6. Permission scope / least privilege
**Decision:** one service identity per role; capabilities frozen; default deny; `OBSERVE_MARKET` may only read validated market observations and write receipts/audit events. No exchange key, no BOS token, no admin, no order/transfer/withdraw capability reaches a worker.
**Alternatives:** shared service account (rejected — privilege creep), ambient authority (rejected). **Rationale:** a task cannot widen its own permission. **Risk:** mis-scoped DI. **Acceptance:** role escalation tests and source scan prove no order path and no human token parameter.

### 7. Human approval for risky actions
**Decision:** observe-only tasks need no human approval; any future task that writes durable state beyond audit, changes permissions, uses credentials, or proposes execution requires explicit approval request with expiry and named approver role. Self-approval prohibited.
**Alternatives:** blanket pre-approval (rejected — bypasses gates). **Rationale:** preserve BOS authority at risk boundaries. **Risk:** approval queue stalls work; expiry and escalation defined. **Acceptance:** test shows unauthorized task denied and approval required.

### 8. Budget/quota enforcement
**Decision:** hard Rp0; `max_usd=0`, bounded calls/tokens/duration/rows; circuit breaker stops optional work before quota exhaustion; no automatic paid fallback.
**Alternatives:** best-effort budget (rejected — overage risk). **Rationale:** BOS hard policy. **Risk:** research capability limited by caps; acceptable. **Acceptance:** cap-breach test fails closed and emits audit event.

### 9. Persistent audit trail and provenance
**Decision:** append-only `task_event` with event_id, correlation_id, idempotency_key, actor, action, decision, provenance_ref, rejection_reason, occurred_at. No secret, balance, position, raw provider payload. Hash-chain only if fully computed and verified (no nullable placeholder claim).
**Alternatives:** logs only (rejected — not queryable/durable). **Rationale:** reconstruction of decisions. **Risk:** storage growth; retention policy required. **Acceptance:** tamper test and retention test.

### 10. Kill switch and stopping mechanism
**Decision:** `platform_control` defaults paused=true, kill_switch=true, budget=0, concurrency=1. Check before claim and before every side effect; kill switch revokes leases, pauses queue, stops workers, emits audit event. Only an authorized human can clear it.
**Alternatives:** process SIGKILL only (rejected — no queue state). **Rationale:** complete, auditable stop. **Risk:** partial effect mid-task; idempotency covers. **Acceptance:** drill demonstrates no new effects after kill.

### 11. Retention, backup, recovery
**Decision:** define retention per class (task envelope, audit, knowledge record); disposable backup/restore drill before activation; no destructive production action; no automated reverse of financial data.
**Alternatives:** keep forever (rejected — unbounded). **Rationale:** bounded, recoverable state. **Risk:** restore loses recent events; tested RPO documented. **Acceptance:** backup/restore drill passes in disposable DB.

### 12. Free-tier deployment and Rp0 limits
**Decision:** use existing PostgreSQL CI service / free local tooling only; no new paid DB, vector service, VPS, paid model or quota overage. Infrastructure provisioning requires separate BOS approval.
**Alternatives:** managed queue service (rejected — cost). **Rationale:** Rp0 hard rule. **Risk:** free-tier limits constrain uptime; document rather than silently spend. **Acceptance:** cost review shows Rp0 and no new paid dependency.

## Consequences

Positive: a provably bounded observe-only automation path can later accept read-only research tasks without human token entry. Negative: added DB operational surface and gating slow delivery. No live trading/withdrawal is enabled.

## Activation gates (all must pass before any runtime)

1. BOS approval of this ADR. 2. Divisi 01/05 review of contract and threat model. 3. Exact-head CI/security on implementation branch. 4. Disposable migration, lease/concurrency/retry/idempotency/restart/kill-switch tests. 5. Human reviewer for PR #160. Until then: **OFF**.
