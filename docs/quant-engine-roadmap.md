# Quant Engine Architecture & Roadmap (27 November 2026)

**Owner:** BOS · **Prepared by:** Grok / Divisi 04 for Chief Strategy Advisor · **Scope:** component boundaries, current status, and ordered roadmap. No activation, deployment, worker, or financial action is authorized by this document.

## 1. Component boundaries

| Component | Language | Responsibility | Explicitly NOT responsible for |
|---|---|---|---|
| Data acquisition & provenance | Python | Free public adapters, bounded pagination, checksum, source URL, retrieved_at, range, row count, staleness gates | Trading, secrets, persistence beyond artifacts |
| Data quality | Python | Timestamp order, duplicates, gaps, OHLC invariants, finite prices, volume, freshness reporting | Repairing/fabricating missing data |
| Research features & indicators | Python | Deterministic indicators (SMA, ROC, z-score, RSI, ATR, VWAP), causal warm-up, O(n) preferred | Signal approval or execution |
| Strategy registry | Python + versioned JSON | Strategy id, parameter set, code/data/config hashes, lineage, provenance | Choosing parameters from results |
| Backtest engine | Python | Cost-aware execution at next open, fee/slippage/spread/funding, stops, drawdown kill switch, equity curve | Live orders, guaranteed profit claims |
| Validation | Python | train/validation/OOS split, walk-forward, unchanged `validation-v1` criteria, benchmarks | Lowering thresholds to obtain a pass |
| Report artifact | Python | `quant-report.v1`, machine-readable metrics, limitations, provenance | Presenting historical results as live or forward-looking |
| Independent QA | Python | `verify_report.py` recomputes trade metrics/drawdown/checksum via separate code path | Replacing human review |
| Signal contract | TypeScript | Versioned `quant-signal.v1` / `quant-report.v1` runtime guards | Calculating alpha |
| Risk interface | TypeScript | Fail-closed sizing, exposure limits, circuit breakers, kill switch, stale block | Opening positions |
| Audit trail | TypeScript | Deterministic event ids, idempotent in-memory ledger, secret rejection | Durable storage without approval |
| Paper/shadow readiness | TypeScript | Pure fill simulation and reconciliation comparison | Owned paper ledger, restart-safe persistence, activation |

Python is the research/statistics engine. TypeScript is the platform contract, API, risk and audit layer. The existing JavaScript dashboard stays untouched.

## 2. Current status (evidence-based)

- Daily research: 5 non-overlapping windows, 16 runs, **0 passed** `validation-v1`. Artifacts on develop and exp branches.
- DeepSeek M5 branch `feat/quantum-m5-engine` head `34752b7`: pagination (`MAX_PAGES=20`, `MAX_ROWS_PER_PAGE=1000`), provenance/checksum/staleness gates, hybrid/spot/futures engine with fee+slippage+spread+funding, typed contracts `src/quantum/m5-contracts.mts`, 6 M5 experiments — **all rejected**. Test workflow `45956609501` success. No security workflow ran (no PR; push to non-default branch).
- M5 gaps found in audit (reported, not edited, because DeepSeek owns those files):
  1. `generate_signals()` precomputes indicators (good) but uses a per-bar high/low slice for breakout extremes — O(n·k), not strict O(n). Recommended fix: deque-based rolling extremes.
  2. No explicit `m5_quality` API; quality gates exist inside `load_artifact()` (checksum, staleness). Naming/interface gap.
  3. M5 reports use `experiment_schema`, while `verify_report.py` expects `quant-report.v1` with `backtest.metrics`; independent QA currently cannot verify M5 reports. Needs an adapter/schema alignment.
  4. M5 summary `report` paths are machine-specific absolute paths — portability defect of the same class already fixed in PR #157.
  5. Six sweeps already ran before those gates were closed; no further sweep should run until engine and data-quality acceptance pass.
- Agent Platform foundation (PR #153, `feat/quant-foundation-p1`) remains open and OFF: fail-closed role registry, task admission policy, scoped memory retrieval, audit sanitizer. Scheduler, worker, durable queue, approval runtime and kill switch are not active.

## 3. Ordered roadmap (gates, not intentions)

1. **Data quality & provenance gate:** unify daily and M5 sidecar contracts; relative artifact paths; explicit `m5_quality`; verify checksum/freshness/gaps on every dataset. Gate: QA 100% on fixtures.
2. **Research engine O(n):** convert rolling extremes to deque; add deterministic no-look-ahead regression with a 10k-bar fixture. Gate: same outputs as current engine on committed fixtures, measured runtime improvement.
3. **M5 QA adapter:** make `verify_report.py` accept M5 report schema or add a dedicated verifier. Gate: 6/6 M5 reports independently verified before any new sweep.
4. **Strategy registry & lineage:** versioned config hash + data hash + code hash; store in provenance records. Gate: replay of any historical experiment from registry alone.
5. **Validation integrity:** keep `validation-v1` frozen; add machine-readable criteria-version assertion so a run cannot silently use different thresholds. Gate: test that tampering with criteria fails.
6. **Risk interface (TS):** risk-budget sizing, exposure, stale block, kill switch already present as pure modules. Gate: integration tests with versioned signals; no production caller.
7. **Audit trail (TS):** idempotent events already present in memory. Gate: durable store design with restart/idempotency test in disposable environment before any activation.
8. **Paper/shadow readiness:** pure simulation and reconciliation comparison exist. Gate: strategy passes `validation-v1` **and** BOS approves the stage separately.
9. **Autonomous operations (Divisi 06/07):** scheduler, durable queue, worker runtime, permissions, approvals, budgets, kill switch. Gate: all operational controls implemented and tested; no activation without BOS approval.

## 4. Rules that remain in force

- No criterion relaxation, no post-result parameter changes, no cherry-picking, no curve fitting.
- No new PR while WIP toward `develop` remains 4 non-draft (#159, #153, #115, #105); no merge, no direct `main` write.
- Rp0; no paid service, key, secret, VPS, production DB, deployment, worker, live order, withdrawal or fund movement.
- Failed experiments are permanent evidence and must not be deleted or rewritten to look successful.
