# Quantum Trading M5 — audit and results record

**Status:** research evidence only. Live trading, order submission, transfers,
withdrawals, production worker, paper-trading runtime and paid resources stay
OFF. Budget Rp0. Nothing in this document is a deployment or profit claim.

## 1. Scope and audit date

**Audit date:** 28 November 2026 (UTC). GitHub heads re-fetched during the audit:
`origin/main` = `f38d25a6203ab486d7170369e86874f838af627a`,
`origin/develop` = `411e7b7114c9642c0e4d567e7e666c82910d2b3c`.

In scope: the Binance-only M5 research engine (data ingest, quality gates,
features, strategy signals, backtest accounting, validation, artifact
verification), the six pre-registered M5 experiments and their artifacts, and
the durable documentation handoff (master context, shared memory).

Out of scope / **not tested** here: TypeScript dashboard and contracts, Binance
Futures funding-rate and open-interest history, taker-flow and order-book depth
sources, Hostless build or LIVE deployment, GitHub Actions exact-head runs,
browser/mobile QA, and any live or paper execution path. No paid resource was
activated and no new Binance request was made during this documentation pass.

## 2. Sources and commits examined

| Source | Commit / identifier | What was examined |
|---|---|---|
| `origin/main` | `f38d25a` | production reference only; not modified |
| `origin/develop` | `411e7b7` | integration reference and base of this documentation branch |
| `feat/quantum-m5-engine` | `34752b7` | M5 data engine, hybrid strategy, backtest, validation, typed contracts, six pre-registered experiments |
| `m5-engine-p0` (pushed, no PR) | `4780fa9` | corrected accounting/risk code, new regression tests, corrected reports and A/B evidence |
| `test/quantum-m5-data-risk` | `03eea31` | independent `m5_quality.py`, `m5_risk.py`, `m5_gate.py`, real BTCUSDT 5m 2024-01 fixture, 52 tests |
| `exp/binance-quant-intraday` | `55aaa07` | §154–157 documentation (Command 17–20), Binance-only Season 1 history |
| Experiment registry | `research/python/experiments/hybrid_registry.json`, registered `2026-11-27T06:59:49Z` | fixed parameters and unchanged `validation-v1` criteria |
| M5 dataset | BTCUSDT 5m, `data-api.binance.vision`, retrieved `2026-11-27T06:49:52Z`, 9,999 closed candles `2026-10-23T13:30Z`→`2026-11-27T06:40Z`, SHA-256 `38fb4834944bab43a94d9e91363f601b03e661846f8cfd2424efb456b473c012` | artifact provenance, checksum, quality record |

The corrected code and artifacts exist on `m5-engine-p0` @ `4780fa9`; they are
**not** merged into `develop`. This documentation branch carries the audit
record only and does not copy or overwrite §150 or §154–157, which live on
isolated branches.

## 3. Findings and concrete evidence

### 3.1 Double-counted holding-period return — **Verified**

The pre-correction `hybrid_backtest.py` marked equity to market on every held
bar and then multiplied equity by the full trade return again at exit.
Deterministic A/B on identical candles, signals, costs and full exposure:

| Engine | Closed trades | Final equity | Compounded trade returns | Invariant |
|---|---:|---:|---:|---|
| Old (`34752b7`) | 1 | +0.679808 % | +0.178914 % | fails by +0.500894 pp |
| Corrected (`4780fa9`) | 1 | +0.178657 % | +0.178657 % | holds (gap 0.0) |

Reproduction: `research/python/test_hybrid_risk.py::AccountingTests`, and the
A/B script kept outside the repository. Reported `net_return_pct` for the old
engine therefore overstated the actual trade return by roughly 0.5 pp in this
case.

### 3.2 Expectancy stored as fraction under percent names — **Verified**

`Trade.net_pct`, `gross_pct` and `funding_pct` were fractions written under
percent-named fields. `test_expectancy_units.py` now covers positive, negative,
zero, single-trade and no-trade ledgers for both engines; `verify_report.py`
recomputes every trade from its own entry/exit prices and explicitly rejects a
fraction (e.g. `0.10` where `10.0` is required).

### 3.3 One signal re-opened multiple positions — **Verified**

On identical input the old engine produced 6 trades where the corrected engine
produced 2. `test_hybrid_risk.py::SignalConsumptionTests` proves that a signal
is consumed after it opens or expires, and that an expired signal cannot
re-enter.

### 3.4 Kill switch, daily loss, gap fills and liquidation — **Verified**

`test_backtest_risk.py` and `test_hybrid_risk.py` prove: the drawdown kill
switch arms even when the breach is realised by an exit or stop while flat; the
daily-loss limit halts the rest of the day and resets next day; a gap through a
stop fills at the open, never at the stop price; and 1x liquidation is computed
from `L = E(1 − 1/leverage)/(1 − maintenance)` instead of the previous linear
approximation.

### 3.5 O(n²) signal generation — **Verified**

`strategy.generate_signals` rebuilt indicator series inside the bar loop. It
now builds each series once per call. `test_strategy_equivalence.py` compares
bit-identical output against the verbatim previous implementation on daily and
M5 fixtures, and asserts constant builder-call counts (≤2) for 120 vs 1,200
bars. `bench_signals.py` provides a device-dependent wall-clock benchmark; the
call-count test is the deterministic proof.

### 3.6 Artifact safety contract missing — **Verified**

`verify_m5` initially failed every report on `paper_only_safety_flags` because
`run_hybrid_experiments.py` never emitted the flags. After adding `paper_only`,
`live_trading`, `withdrawal` and `profit_claim`, all six corrected reports pass
**30/30** independent checks each (6/6 reports, 180 checks total).

### 3.7 Corrected experiment results — **Verified**

Registry, dataset, costs and `validation-v1` criteria were unchanged; no
parameter was tuned after observing holdout results. Original reports remain
at `research/python/output/hybrid_m5/` as pre-correction evidence; corrected
reports are at `research/python/output/hybrid_m5_corrected/` on `m5-engine-p0`.

| Experiment | Instrument | OOS net % | OOS DD % | Trades | PF | Expect/trade % | Win % | Exposure % | Turnover | WF +/total | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| m5-01 hybrid | SPOT | 0.00 | 0.00 | 0 | n/a | 0.000 | 0.0 | 0.00 | 0 | 0/15 | REJECT |
| m5-02 hybrid | FUTURES | −1.241 | 1.241 | 2 | 0.000 | −0.622 | 0.0 | 0.25 | 4 | 1/15 | REJECT |
| m5-03 scalp | SPOT | −15.551 | 16.177 | 35 | 0.127 | −0.506 | 17.14 | 6.55 | 70 | 0/15 | REJECT |
| m5-04 scalp | FUTURES | −16.706 | 17.547 | 51 | 0.250 | −0.395 | 29.41 | 10.50 | 103 | 0/15 | REJECT |
| m5-05 momentum | SPOT | 0.00 | 0.00 | 0 | n/a | 0.000 | 0.0 | 0.00 | 0 | 0/15 | REJECT |
| m5-06 momentum | FUTURES | −1.241 | 1.241 | 2 | 0.000 | −0.622 | 0.0 | 0.25 | 4 | 1/15 | REJECT |

Baseline no-trade return is 0 %. No strategy reached the majority-positive
walk-forward gate. **No promotion and no profit claim.** The reject decision is
unchanged; only the inflated metrics were corrected.

### 3.8 Dataset quality at artifact level — **Partial**

The committed artifact has 0 duplicate timestamps, 0 missing 5-minute
intervals, 0 OHLCV violations and a checksum matching its provenance sidecar,
as enforced by `m5_data.load_artifact` + `m5_quality`. The live Binance source
was **not** re-fetched in this documentation pass, so freshness relative to the
current date is not re-validated here. The stale-data guard (>3 bars behind
retrieval) is covered by offline tests on `m5-engine-p0`.

### 3.9 Binance-only dashboard and Bybit DEFERRED — **Not tested**

Recorded in §157 on `exp/binance-quant-intraday`; not re-verified in this audit
and not changed by this documentation branch. No claim is made about the
current live dashboard state.

### 3.10 TypeScript contracts, CI and deployment — **Blocked locally / not tested**

Local `tsc` is unavailable in this Termux environment (`tsc: not found`);
exact-head GitHub Actions were not run for the isolated research branch. No
Hostless build or LIVE verification was performed. These controls remain
required before any integration.

### 3.11 Execution gates — **Partial**

Research modules emit `live_trading=false`, `withdrawal=false` and
`paper_only=true`, and no order/HTTP client was found in the changed Python
files. A repository-wide runtime audit of workers, ledger or production
services was not performed in this pass; those remain OFF by policy and by the
documented state in the master context.

## 4. Risks and follow-up

1. **Superseded numbers.** Any downstream note quoting the pre-correction
   figures (−25.53 % / −35.33 % scalp drawdowns) must be marked historical;
   corrected values are −15.55 % / −16.71 % net respectively.
2. **Branch isolation.** The corrected engine and artifacts are not on
   `develop`. Integration requires a separate evaluation with exact-head tests
   and review; this audit does not request or perform a merge.
3. **No edge yet.** All six pre-registered M5 experiments were rejected under
   unchanged criteria. Do not relax `validation-v1`, do not grid-search after
   seeing holdout results, and do not activate paper trading or a worker.
4. **Fresh data required.** Next M5 work must use a new, non-overlapping
   Binance 5m window with provenance, BTCUSDT and ETHUSDT prioritised, and
   admission/data-quality checks before other assets.
5. **Two hypotheses only.** Pre-register at most two genuinely different M5
   hypotheses with fixed parameters and a timestamp before fetching data.
6. **Status labels.** §3.8–3.11 are explicitly Partial/Blocked/Not tested;
   they must not be reported as verified passes.

## 5. Tests run for this audit record

- `python3 -m unittest discover -s research/python -p 'test_*.py'` on
  `m5-engine-p0` @ `4780fa9`: **100 tests, 0 failures**.
- `verify_report.py` on all six `hybrid_m5_corrected` reports:
  **6/6 passed, 30 checks each**.
- `git diff --check` clean; secret-pattern scan of changed files found no
  credentials.
- Shared-memory documentation size checked after edit (target < 12,288 bytes).

These runs belong to the isolated research branch; they are not GitHub
Actions results and are not evidence of deployment.
