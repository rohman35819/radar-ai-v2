# RADAR AI V2 — Window-3 Volatility Breakout Experiment (27 November 2026)

**Status:** REJECTED under unchanged `validation-v1`. Research-only; no paper ledger, worker, live trading, withdrawal or paid service. Owner: BOS · Lead: Grok / Divisi 04.

## 1. Hypothesis and why it is substantively different

`exp-08-volatility-breakout-window3`: a **Donchian/ATR volatility-expansion breakout** with an ATR trailing stop and a 10-bar maximum holding period.

| Earlier experiment | Signal family | This experiment |
|---|---|---|
| exp-01 | close-only SMA crossover | uses **high/low** channel + true range, not close averages |
| exp-02 | price above trend SMA + ROC | no moving-average trend filter; no ROC |
| exp-03 | close z-score mean reversion | breakout (trend continuation), not reversion |
| exp-04/05 | trend SMA + RSI pullback | no RSI; exit via volatility trailing stop and time limit |

Entry: at bar *i*, using only bars up to *i−1*, enter at bar *i* open if `close[i−1] > max(high[i−20:i])`. Exit at bar *i* open if `close[i−1] < highest_close_since_entry − 2.0 × ATR14[i−1]` or `bars_held ≥ 10`. Inherited hard stop 10% and portfolio drawdown kill switch 30% remain in the engine. Market rationale: directional legs often start with volatility expansion beyond a prior range; a volatility-scaled trailing stop plus a time exit addresses unstable signals and dead exposure diagnosed earlier.

**Exactly one fixed configuration** — `lookback_period=20`, `atr_period=14`, `atr_multiple=2.0`, `max_hold_bars=10`. No grid search, no curve fitting, no parameter chosen from earlier results.

## 2. Pre-registration proof and non-overlap

- Registry: `research/python/experiments/registry_window3_vol_breakout.json`.
- First committed at **`25d54774d9a7d45ef93a9e2c342d33a433ef52ca`**, timestamp **`2026-11-27T05:39:57Z`**, before any window-3 data was fetched and before any result existed. Structural runner-compatibility fields were added later at `723e276` before a result was produced; hypothesis, parameters, costs and criteria were unchanged.
- Data fetched at **`2026-11-27T05:49:02.526738Z`** — after registration.
- Non-overlap: v1 `2025-11-27→2026-11-25`, v2 `2024-01-01→2024-12-30`, v3 `2022-01-01→2022-12-31`. `2022-12-31 < 2024-01-01 < 2025-11-27`; zero shared bars.

## 3. Dataset provenance and validation

- Source: `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=365&startTime=1640995200000` (free public endpoint, no API key).
- Symbol BTCUSDT, interval 1d, 365 rows, range 2022-01-01→2022-12-31, retrieved_at `2026-11-27T05:49:02.526738Z`, SHA-256 `9173fa337a0dda12050f310a29667a527dcb8ac7dee9613820cb8d85c00c4ee7`.
- Integrity: `accepted=true`, duplicate timestamps **0**, missing daily intervals **0**, OHLC violations **0**, issues `[]`. Timestamps timezone-aware and strictly increasing; prices finite/positive; volume non-negative.
- Freshness: data age at evaluation 34,253.845 hours; `historical_research_only=true`, `live_ready=false`. This is an intentionally historical window; freshness is recorded as provenance, never presented as live data.

## 4. Costs (explicit spread, unchanged effective assumptions)

Fee **5 bps/side**, slippage **5 bps/side**, spread **5 bps/side** = **15 bps/side**, identical to validation-v1's 7.5+7.5 decomposition. Funding 0 (spot), position fraction 1.0, stop loss 10%, drawdown stop 30%. `cost_bps_per_turn` in the report remains 15 by the same convention used in all prior experiments. The engine now charges spread explicitly with a default of 0, so all earlier results are unchanged.

## 5. Result — REJECTED

| Metric | Value |
|---|---:|
| OOS period | 2022-10-01 → 2022-12-31 (92 bars) |
| OOS gross / net return | −7.541% / **−7.818%** |
| OOS max drawdown | 12.854% |
| OOS trades / turnover | 2 / 4 |
| OOS win rate / profit factor | 50% / **0.225** |
| OOS expectancy | −0.026% per trade |
| OOS Sharpe / Sortino | −1.517 / −0.492 |
| OOS exposure | 13.043% |
| OOS buy-and-hold net | −14.593% |
| No-trade return | 0% |
| Full-sample net / drawdown | −15.375% / 20.675% |
| Full buy-and-hold net | −65.440% |
| Walk-forward | **1/6 positive** |
| Acceptance | **false** — `walk_forward_not_majority_positive` |

**Interpretation:** the strategy lost less than buy-and-hold in a falling 2022 market, but it still lost money after costs, had only two OOS trades, undefined-quality low profit factor, and only 1 of 6 walk-forward folds positive. It is **REJECTED**, not a `VALIDATION CANDIDATE`. No profit claim. No criterion was relaxed; the fixed configuration was not re-run with different parameters.

## 6. Reproducibility and QA

- `research/python/verify_report.py` on the generated `quant-report.v1`: **passed=true**, failed checks `[]`.
- The experiment was run twice into different output directories; all metric blocks, selected parameters, acceptance reasons, walk-forward results and benchmarks were byte-identical (`REPRODUCIBLE=true`). Only `generated_at` differs by design.
- Local suites: Python **28/28**, `npm test` **241/241**, strict `tsc --noEmit` exit 0. Secret scan clean; `git diff --check` clean.
- Artifacts: `research/python/output/experiments_window3/` (report, summary, QA).

## 7. Files

Created: registry v3, fixture + sidecar, experiment outputs, this document.
Changed: `strategy.py` (new strategy + ATR), `backtest_engine.py` (explicit spread cost), `quant_data.py` (freshness report), `run_experiments.py` (single-hypothesis/freshness/cost support, relative report_path), `test_quant_mvp.py` (3 new tests), master context §151 and shared memory.

## 8. Blockers and next task

No strategy has passed `validation-v1`; paper ledger and reconciliation remain locked pending a pass and separate BOS approval. Worker/scheduler, live trading, withdrawal and fund movement are OFF; Rp0. **Next task:** if research continues, pre-register a genuinely different hypothesis on a fourth non-overlapping window before observing data; do not tune on windows 1–3.
