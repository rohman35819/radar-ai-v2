# RADAR AI V2 — Shadow/Paper Readiness (design only, NOT activated)

**Status:** IMPLEMENTED as pure TypeScript helpers + design. **Paper ledger: OFF. Reconciliation runtime: OFF. Worker: OFF. Live trading/withdrawal: OFF. Rp0.**
**Owner:** BOS · Branch: `feat/quant-shadow-readiness` · Depends on: PR #156 (merged, `cc16628d`).

## 1. What this adds

| Module | Purpose | Boundary |
|---|---|---|
| `src/quant/risk-budget.mts` | `evaluateRiskBudget()` sizes a position from risk-per-trade ÷ stop distance, capped by remaining exposure; circuit breakers for kill switch, daily loss limit, loss streak and exposure. Fails closed on malformed input. | Pure function. No ledger, no exchange. |
| `src/quant/audit.mts` | `appendAuditEvent()` produces deterministic, content-derived event ids (FNV-1a), deduplicates events, bounds the in-memory ledger, rejects secret-bearing and unknown actions. | Append-only **in memory only**; no persistence, no transport. |
| `src/quant/reconciliation.mts` | `reconcileFills()` compares expected vs observed fills into matched/missing/unexpected/mismatched with `balanced`. Bounded to 200 records each. | **Design-only** comparison; does not own a ledger and is not an active paper system. |

Existing `src/quant/contracts.mts`, `risk.mts`, `paper.mts` (PR #156) provide the versioned signal contract, fail-closed risk gate and deterministic shadow simulation. Nothing in this branch changes them.

## 2. Explicit non-activation

- No paper ledger is created or written. `reconcileFills()` is a comparison helper, not a ledger.
- No scheduler, worker, queue, API route, dashboard change, production database, credential, Hostless setting or deployment is touched.
- No `fetch`, HTTP client, exchange client, order submission, withdrawal or fund movement exists in the new modules. A test enforces this by scanning module source.
- These modules have **no production caller**. They are building blocks for a later, separately approved stage.

## 3. Gates before any activation

1. A strategy must pass the unchanged `validation-v1` criteria: ≥2 OOS trades, OOS max drawdown ≤25%, validation selection accepted, majority of walk-forward folds positive. Currently **no strategy passes** (see `docs/quant-strategy-experiments.md`).
2. BOS must approve the paper ledger / reconciliation stage explicitly and separately.
3. Exact-head tests, strict TypeScript, security scans and a reviewed reconciliation design must pass on the activation PR.
4. Durable state, idempotency under restart, kill-switch propagation and audit retention must be tested in a disposable environment before any operational use.

## 4. Verification

- `npm test`: **241 pass, 0 fail** (237 existing + 4 new readiness tests).
- Strict `tsc --noEmit -p tsconfig.json`: exit 0.
- New tests cover sizing/circuit breakers, audit determinism/idempotency/secret rejection, reconciliation differences and absence of network/order paths.

## 5. Next task

Keep paper ledger locked. The next quantum task is a new **pre-registered** strategy experiment only if evidence justifies it, or activation design work after a strategy actually passes validation. Do not relax criteria to obtain a pass.
