# Pre-Registration Proposal — Window 6 (27 November 2026)

**STATUS: PROPOSED — NOT APPROVED. NO DATA FETCHED. NO BACKTEST RUN. NO EXPERIMENT EXECUTED.**
**Owner:** BOS · **Approver:** Chief Strategy Advisor / Divisi 04 · **Prepared by:** Grok.
**Rule:** execution may start only after this document and the registry file are committed and explicitly accepted. Criteria remain `validation-v1`; no parameter may change after results are observed.

## 1. Common design (both candidates)

- Market: BTCUSDT, 1d, 365 bars, **2019-01-01 → 2019-12-31** from free key-less `https://data-api.binance.vision/api/v3/klines` (`startTime=1546300800000`).
- Non-overlap proof: `2019-12-31 < 2020-01-01` (window 4), `< 2022-01-01` (window 3), `< 2024-01-01` (window 2), `< 2025-11-27` (window 1). Zero shared bars; 2019 has never been inspected.
- Costs: fee 5 + slippage 5 + spread 5 = 15 bps/side, funding 0 (spot), position fraction 1.0, hard stop 10%, portfolio drawdown stop 30%.
- Validation: unchanged `validation-v1` — 50/25/25 train/validation/OOS, walk-forward train 120 / test 40 / step 40, buy-and-hold and no-trade benchmarks, minimum 2 OOS trades, OOS drawdown ≤25%, validation selection accepted, majority of walk-forward folds positive.
- Exactly one fixed parameter set per candidate. **No grid search, no threshold tuning, no curve fitting.** All signals are computed from information at `i-1` and executed at bar `i` open.
- Reproducibility: commit registry before fetching; store source URL, retrieved_at, range, row count, SHA-256; run twice and compare metric blocks; independent `verify_report.py` must pass.

## 2. Candidate A (primary) — volatility-compression state gate

- **Theory:** volatility clusters. participating only after compression and standing aside during expansion changes *when* capital is exposed, not the predicted direction. This is distinct from exp-08 where ATR was a trailing stop distance, and from exp-01/02/04 where no volatility state gate existed.
- **Fixed parameters:** `atr_period=14`, `state_lookback=100`, `compression_percentile=20`, `expansion_percentile=80`, `trend_sma=50`, `max_hold_bars=5`.
- **Entry:** at bar `i`, using bars up to `i-1`: `ATR%[i-1] ≤ 20th percentile of ATR% over the prior 100 bars` **and** `close[i-1] > SMA50[i-1]`. Enter at open `i`.
- **Exit:** at open `i` when `ATR%[i-1] ≥ 80th percentile`, or `close[i-1] < SMA50[i-1]`, or `bars_held ≥ 5`. Hard stop 10% remains.
- **Expected edge:** avoid the high-volatility regimes where the fixed 15 bps/side cost dominates; capture the post-compression directional leg.
- **Bias/limitations:** percentile thresholds are conventional but still a choice; the rule remains trend/flat underneath and can inherit exp-08's instability. ATR% and SMA are both history-based; warm-up must be explicit.
- **Overfitting risk:** medium — mitigated by fixing every number here before data exists.
- **Falsification:** reject if OOS net ≤ no-trade, OOS trades <2, OOS drawdown >25%, validation selection rejected, or walk-forward folds not majority positive. Also reject if buy-and-hold net is superior while the strategy carries comparable drawdown.

## 3. Candidate B (secondary) — volume-regime transition

- **Theory:** transitions in the volume regime mark participation shifts. A level-based volume ratio (exp-10) produced one trade; a *change-based* transition detector is a different mechanism: it asks when activity moves from quiet to unusual, not whether volume is simply high.
- **Fixed parameters:** `volume_lookback=20`, `transition_z=2.0`, `exit_z=0.0`, `max_hold_bars=3`.
- **Entry:** at bar `i`, using bars up to `i-1`: `volume_z[i-1] ≥ 2.0` (z-score of volume against prior 20 bars) **and** `close[i-1] > close[i-2]`. Enter at open `i`.
- **Exit:** at open `i` when `volume_z[i-1] ≤ 0.0` or `bars_held ≥ 3`. Hard stop 10% remains.
- **Expected edge:** early participation when unusual volume confirms a new directional phase.
- **Bias/limitations:** volume dimension overlaps exp-10 (rejected with one OOS trade); if this also produces 0–2 trades, the mechanism is untestable rather than false. Exchange volume can be manipulated; no order-flow confirmation is available.
- **Overfitting risk:** medium-high; mitigated by fixed z-thresholds and one configuration only.
- **Falsification:** identical `validation-v1` criteria, plus explicit rejection if trade count <2. No parameter rescue after seeing results.

## 4. Explicitly not selected

- **Taker-flow imbalance:** public `aggTrades` endpoint responded, but only recent trades are returned; a full 2019 OOS/walk-forward window cannot be reconstructed at Rp0. BLOCKED by data retention, not by theory.
- **Spread-aware execution enabler:** tracked with DeepSeek's M5 engine; it changes cost realism, not directional edge, and must never be counted as a new alpha mechanism.
- **Volatility-conditioned reversion:** too close to exp-03/10 families already rejected on multiple windows.

## 5. Pre-registration checklist (to be completed only after approval)

- [ ] Advisor acceptance recorded in this document and in master context.
- [ ] Registry JSON written and committed with `registered_at` timestamp **before** any 2019 data fetch.
- [ ] Implementation (if needed) committed before fetch; no edits to DeepSeek's M5 files.
- [ ] Fetch 2019 BTCUSDT klines with provenance sidecar and checksum.
- [ ] Data quality and freshness report recorded; STOP if integrity fails.
- [ ] Run each candidate once with unchanged validation engine; no grid, no threshold changes.
- [ ] Independent QA + duplicate-run reproducibility check.
- [ ] Record accepted/rejected honestly; no paper ledger activation.

## 6. Current state

Nothing in this section has been executed. No 2019 data has been fetched. No result exists. No strategy is promoted. Paper ledger, reconciliation runtime, worker, live trading and withdrawal remain OFF; Rp0.
