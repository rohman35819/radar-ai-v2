# Agent Platform Integration Contract v1 — Observe-Only Boundary

**Status:** PROPOSED DESIGN. No queue, worker, scheduler, runtime, paper ledger or reconciliation is implemented or active. Owner: BOS · Divisi 06 (platform), Divisi 04 (research), Divisi 01/05 (security/QA).

## 1. Purpose

Define the first versioned boundary through which a future Agent Platform task may carry a validated market observation into research and produce an auditable `OBSERVE_ONLY` receipt. It reuses existing contracts (`market-observation.v1`, `market-observation-input.v1`, `market-observation-shadow.v1`) and does not replace the Python OHLCV pipeline.

## 2. Envelope `agent-task-envelope.v1`

| Field | Type | Rule |
|---|---|---|
| `schema_version` | literal `agent-task-envelope.v1` | rejected if absent/different |
| `event_id` | 64-hex | content-derived from canonical task body; stable across retries |
| `idempotency_key` | 64-hex | derived from `event_id` + `input.provenance_ref` + `input.observed_at`; retry with same key must not create a second effect |
| `task_type` | enum | `OBSERVE_MARKET` only in v1; no trading/order/transfer/withdraw type exists |
| `schema_provenance` | object | `source_contract`, `contract_version`, `source_revision` (Git SHA) |
| `input` | `market-observation-input.v1` | validated by `createQuantMarketInput` before envelope creation |
| `requested_at` | ISO-8601 UTC | caller timestamp, timezone required |
| `expires_at` | ISO-8601 UTC | must be > `requested_at`; bounded by policy |
| `approval` | object | `{ required: false, boundary: 'OBSERVE_ONLY', approver: null }` in v1 |
| `budget` | object | `{ max_calls: 1, max_tokens: 0, max_usd: 0 }` — Rp0 default |
| `risk_scope` | object | `{ allowed_symbols: ['BTCUSDT','ETHUSDT'], max_age_ms: 300000, kill_switch: true }` |

## 3. Input validation and freshness

- Accept only `market-observation-input.v1` that passes `isMarketObservationInputV1` and `hasValidMarketInputChecksum`.
- Reject future timestamps, stale age above `max_age_ms`, malformed/no-timezone timestamps, `freshness !== 'fresh'`, `is_ohlcv !== false`, symbol outside the fixed allowlist, secret/private payload fields.
- `now` must be injected by the runtime for deterministic tests. Do not let a task rewrite `received_at` to make stale data fresh.
- Ticker observations are **not** OHLCV candles; no candle-derived indicator may consume them.

## 4. Result contract `agent-observe-result.v1`

| Field | Rule |
|---|---|
| `schema_version` | literal `agent-observe-result.v1` |
| `receipt` | `market-observation-shadow.v1` with `decision='OBSERVE_ONLY'` |
| `audit_event` | `agent-audit-event.v1` (see §5) |
| `rejection_reason` | null on success; stable code on rejection |
| `provenance_ref`, `checksum` | copied from receipt; not re-signed by the task |
| `completed_at` | injected runtime clock, ISO UTC |
| `effect` | literal `NONE` — no order, fill, ledger or state mutation |

Only `OBSERVE_ONLY` or a rejection status is permitted. No BUY/SELL, entry/TP/SL, simulated fill or profit claim exists in this contract.

## 5. Audit event `agent-audit-event.v1`

Fields: `event_id`, `correlation_id`, `idempotency_key`, `actor` (service identity, never BOS human token), `action` (`observe.accept|observe.reject|task.retry|task.dead_letter|kill_switch`), `task_type`, `input_provenance_ref`, `decision`, `rejection_reason`, `occurred_at`, `schema_version`. Secrets, balances, positions and raw provider payloads are forbidden in audit fields.

## 6. Retry and replay policy

- Retry only transient failures (e.g., internal provider timeout), max 3 attempts, exponential backoff with jitter, hard cap.
- `idempotency_key` deduplicates effects; duplicate key returns the original receipt without re-consuming the observation.
- Current shadow consumer's `seen` array is **caller-supplied and in-memory only** — it is NOT durable replay protection. Durable replay state is a Divisi 06 gate before any runtime activation.
- Dead-letter after max attempts with a sanitized rejection code; no silent discard.

## 7. Approval boundary

- `OBSERVE_MARKET` requires no human approval in v1 because it has no side effect beyond a receipt and audit event.
- Any future task type that writes state, changes permissions, touches a provider with credentials, or proposes execution requires explicit approval, least-privilege scope, and a separate BOS decision.
- A task cannot grant itself permissions, widen the symbol allowlist, raise budgets, merge, deploy, or disable a kill switch.

## 8. Contract status

This document defines interfaces only. Implementation gates: strict TypeScript guards, deterministic tests, disposable-state replay tests, independent QA, and explicit BOS approval before any scheduler/worker activation. Current runtime state: **OFF**.
