# RADAR AI V2 — Window-4 Opening Continuation Experiment (27 November 2026)

**Status:** REJECTED / NO EVIDENCE under unchanged `validation-v1`. Research-only. Owner: BOS · Lead: Grok / Divisi 04.

## 1. Hypothesis and difference

`exp-09-opening-continuation-window4`: enter BTCUSDT at the next bar open when the 00:00 UTC opening print is ≥0.5% above the previous close **and** that bar closes above its open; exit at the next open when a bar closes below its open or after 2 bars. Fixed parameters: `gap_threshold_pct=0.005`, `max_hold_bars=2`. No grid search.

It differs from exp-01 SMA, exp-02 trend+ROC, exp-03 z-score, exp-04/05 RSI regime, and exp-08 Donchian/ATR breakout: it uses **open vs prior close** and same-bar bullish confirmation, with a strict 2-bar time exit — not moving averages, oscillators, z-scores or high/low channels. Inherited 10% hard stop and 30% drawdown kill switch remain.

## 2. Pre-registration and non-overlap

- Registry: `research/python/experiments/registry_window4_gap_continuation.json`, first commit **`49090c9847fdea90dc42979b6c3f3e93759685ab`**, timestamp **`2026-11-27T06:48:51Z`** — before data fetch (`retrieved_at` 06:53:00Z) and before any 2020 result. Code commit `fabcad0` also preceded the fetch.
- Windows: v1 2025-11-27→2026-11-25, v2 2024-01-01→2024-12-30, v3 2022-01-01→2022-12-31, v4 **2020-01-01→2020-12-30**. `2020-12-30 < 2022-01-01 < 2024-01-01 < 2025-11-27`: zero shared bars.
- Costs: fee 5 + slippage 5 + spread 5 = 15 bps/side, funding 0; `validation-v1` unchanged.

## 3. Data provenance and validation

Source: `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=365&startTime=1577836800000`, BTCUSDT 1d, 365 bars, 2020-01-01→2020-12-30, retrieved `2026-11-27T06:53:00.689811Z`, SHA-256 `cce3b9383e359126f3aabd96f464d721cd83d0f0be4d43f64b609c22e5df85ef`.
Integrity: accepted, 0 duplicates, 0 missing daily intervals, 0 OHLC violations, timezone-aware strictly increasing timestamps. Freshness: age 51,798.892 h, `historical_research_only=true`, `live_ready=false`.

## 4. Result — REJECTED / NO EVIDENCE

| Metric | Value |
|---|---:|
| OOS trades / position changes | **0 / 0** |
| OOS gross / net return | 0% / **0%** |
| OOS drawdown / exposure / turnover | 0% / 0% / 0 |
| OOS profit factor / expectancy / Sharpe / Sortino | null / 0 / null / null |
| OOS buy-and-hold net | **+167.144%** |
| No-trade return | 0% |
| Full-sample net / buy-and-hold net | 0% / **+299.801%** |
| Walk-forward | **0/6 positive** |
| Acceptance | **false** — `oos_too_few_trades`, `validation_selection_rejected`, `walk_forward_not_majority_positive` |

**Root cause with evidence:** across all 365 bars, the number of bars with `open[i]/close[i-1] − 1 ≥ 0.5%` is **0**. In a continuous 24/7 market, the 00:00 UTC kline open is effectively the prior close; there is no tradable overnight gap. The signal condition therefore never fired. This is **not** evidence that the strategy is profitable or unprofitable — it is evidence that the proposed mechanism is **not observable in this data contract**. Per BOS instruction, the experiment is stopped and recorded; the threshold was **not** lowered after seeing the result.

Artifacts: `research/python/output/experiments_window4/` (report, summary, QA). Independent `verify_report.py`: **passed**. Two runs produced byte-identical metric blocks (`REPRODUCIBLE=true`). Python **29/29**, npm **241/241**, strict TS exit 0.

## 5. Files and next task

Created: registry v4, fixture + sidecar, outputs, this doc. Changed: `strategy.py` (gap strategy), `run_experiments.py` (runner compatibility), `test_quant_mvp.py` (new test), master context §150, shared memory.

**Next task:** pre-register a fifth hypothesis that uses a data dimension not yet tested (for example volume-confirmed closing strength) on a fourth non-overlapping window, before fetching data. Do not tune prior windows. Paper ledger, reconciliation runtime, worker, live trading and withdrawal remain OFF; Rp0.
