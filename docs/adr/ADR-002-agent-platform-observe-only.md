# ADR-002 — Agent Platform Observe-Only Foundation

**Status:** PROPOSED (design review required). **Date:** 2026-11-27 · **Owner:** BOS · **Authors:** Grok for Divisi 06/07 · **Supersedes:** none.

## Context

RADAR AI needs bounded operation when BOS is offline, but current chat sessions are not workers. PR #160 proved a deterministic observe-only path: gateway → observation → research input → shadow receipt. Replay state is currently caller-supplied and non-durable; no queue, scheduler, worker, permission gateway, durable audit, budget enforcement or kill switch runtime exists. NEXUS architecture names these boundaries but does not implement them.

## Decision

Build the Agent Platform in gates, starting with a **durable task envelope and audit trail** in disposable infrastructure, not a live worker. Do not activate scheduling, workers or execution until every gate below passes.

### 1. Durable queue/state

- PostgreSQL (already used only in disposable CI for `radar_agent.*` schema) is the candidate system of record; no new paid DB.
- Tables: `task_envelope` (event_id, idempotency_key, type, input_ref, status, attempts, deadline, lease_owner, lease_expires_at), `task_event` append-only audit, `approval_request`, `platform_control`.
- Atomic claim via `SELECT ... FOR UPDATE SKIP LOCKED`, lease fencing token, heartbeat before expiry, reclaim expired leases, dead-letter after bounded retries. Idempotency key unique per effect.
- Replay state (`seen`) must move from the caller's array to durable `task_event` lookups; current shadow consumer remains a pure boundary test.

### 2. Worker lifecycle and recovery

- One worker per leased task, bounded concurrency (default 1), per-task timeout, max attempts 3, exponential backoff with jitter.
- Worker registers with least-privilege service identity; no BOS token, no exchange key, no admin role.
- Heartbeat, graceful shutdown, lease release, recovery replay from durable events, restart-safe idempotency test in disposable DB required before activation.

### 3. Permission scope

- `OBSERVE_MARKET` only in phase 1: market observation + receipt + audit. No order, transfer, withdrawal, ledger write, deployment, merge, or permission mutation.
- Fixed BTC/ETH allowlist; caller cannot widen it. Role capabilities frozen and checked at every gateway call.
- Human approval boundary for any future privileged task; a worker cannot approve itself.

### 4. Budget/quota enforcement

- Hard Rp0: `max_usd=0`, no paid provider, no paid tier, no quota overage.
- Per-task caps: max calls, max tokens, max duration, max rows. Circuit breaker after cap breach; stop optional work before quota exhaustion.

### 5. Audit persistence

- Append-only `task_event` with event_id, correlation_id, idempotency_key, actor, action, decision, provenance_ref, rejection_reason, occurred_at.
- No secret, private account payload, balance or position in audit. Hash-chain optional but must be computed and verified if claimed; do not ship nullable placeholders.

### 6. Kill switch and recovery

- `platform_control` defaults: paused=true, kill_switch=true, budget=0, concurrency=1.
- Kill switch checked before claim and before each side effect; revoke leases, pause queue, stop workers, record audit event.
- Recovery drill: simulate worker crash mid-lease, expired lease reclaim, duplicate event suppression, and kill-switch stop in disposable environment.

## Consequences

Positive: a tested, bounded, restart-safe observe-only platform can later accept read-only research tasks without human token entry. Negative: durable DB and worker work add operational complexity and must remain isolated. No live trading, worker activation or production deployment is authorized by this ADR.

## Alternatives rejected

- Caller-provided `seen` array as durable replay protection: not durable, forgeable by re-signing.
- Using `EXCHANGE_ACCESS_TOKEN` for internal workers: violates human/service boundary.
- Starting with live order adapters: no validated strategy, no paper evidence, no approval.

## Gates before implementation activation

1. Contract guards + tests pass. 2. Disposable migration/lease/retry/idempotency/restart tests pass. 3. Divisi 01 security review (human) and Divisi 05 QA. 4. BOS approval for runtime activation. Until then: **OFF**.
