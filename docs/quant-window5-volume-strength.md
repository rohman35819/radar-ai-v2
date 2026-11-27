# RADAR AI V2 — Window-5 Volume-Confirmed Closing Strength (27 November 2026)

**Status:** REJECTED under unchanged `validation-v1`. Research-only. Owner: BOS · Lead: Grok / Divisi 04.

## 1. Hypothesis and difference

`exp-10-volume-close-strength-window5`: enter BTCUSDT at next-bar open when the previous bar closed in the upper 20% of its daily range **and** its volume was ≥1.5× the 20-bar average; exit at next open when the close falls into the lower half of the range or after 3 bars. Fixed parameters: `close_position_min=0.8`, `weak_close_max=0.5`, `volume_ratio_min=1.5`, `volume_lookback=20`, `max_hold_bars=3`. One configuration, **no grid search**.

This is the first experiment to use **traded volume**. Prior ones used close-only SMA, trend+ROC, z-score, RSI regime, Donchian/ATR channel, or opening gaps. Rationale: a strong close near the high with unusual volume can reflect informed accumulation; a 3-bar time exit bounds dead exposure.

## 2. Pre-registration and non-overlap

- Registry: `research/python/experiments/registry_window5_volume_strength.json`, first commit **`976a1a38a3844a2c01252ffd7145073c15277bf4`**, registered **`2026-11-27T06:56:04Z`**, before fetch at `07:00:32Z`. Implementation commit `82581d6` also preceded the fetch.
- Fifth window: BTCUSDT 1d, 2018-01-01→2018-12-31, 365 bars. Non-overlap: `2018-12-31 < 2020-01-01 < 2022-01-01 < 2024-01-01 < 2025-11-27`; zero shared bars with windows 1–4.
- Costs: fee 5 + slippage 5 + spread 5 = 15 bps/side, funding 0. Criteria `validation-v1` unchanged.

## 3. Data provenance and validation

Source: free key-less `https://data-api.binance.vision/api/v3/klines?...startTime=1514764800000`. 365 rows, checksum `8f6e90b6a9a8e039b35c7ac2d9aa0437f6535e2c48cffb0278a7e64bf9c25654`, retrieved `2026-11-27T07:00:32.975604Z`. Integrity: accepted, 0 duplicates, 0 missing daily bars, 0 OHLC violations. Freshness: historical-only, `live_ready=false`.

## 4. Result — REJECTED

| Metric | OOS (2018-10-01→12-31) | Full sample |
|---|---:|---:|
| Gross / net return | −5.364% / **−5.506%** | −2.617% / **−3.635%** |
| Max drawdown | 5.506% | 8.550% |
| Trades / turnover | **1** / 2 | 7 / 14 |
| Win rate / profit factor | 0% / **0** | 28.571% / 0.580 |
| Expectancy | −0.0551% | −0.0094% |
| Sharpe / Sortino | −1.992 / null | −0.237 / −0.042 |
| Exposure | 1.087% | 2.192% |
| Buy-and-hold net | **−44.162%** | **−72.408%** |
| No-trade | 0% | 0% |
| Walk-forward | **1/6 positive** | — |

`accepted_for_paper_candidate=false` — `oos_too_few_trades`, `walk_forward_not_majority_positive`. The strategy avoided a large part of a severe 2018 drawdown but produced only one OOS trade and lost money after costs; it is **not** a `VALIDATION CANDIDATE`. No criterion was relaxed and the fixed parameters were not re-run with alternatives.

Artifacts: `research/python/output/experiments_window5/`. Independent `verify_report.py`: **passed**. Second run produced identical metric blocks (`REPRODUCIBLE=true`). Python **30/30**, npm **241/241**, strict TS exit 0.

## 5. Files and next task

Created: registry v5, fixture + sidecar, outputs, this doc. Changed: `strategy.py` (volume strategy + tests), `run_experiments.py` (runner compatibility), master context §150, shared memory.

**Evidence-based conclusion:** across five non-overlapping windows and ten fixed hypotheses, no strategy passes `validation-v1`; positive full-sample results repeatedly fail OOS/walk-forward, and low-frequency filters repeatedly fail the minimum-trade criterion. Further window/parameter iteration without a genuinely new mechanism would be data snooping. Paper ledger, reconciliation runtime, worker, live trading and withdrawal remain OFF; Rp0.
