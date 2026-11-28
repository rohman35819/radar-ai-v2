# Quantum M5 vertical slice — BTC/USDT — 27 November 2026

Status: **engine implemented and tested; no strategy promoted**. SPOT + FUTURES, M5, hybrid regime-aware, scalping and momentum. Live trading, orders, withdrawals, worker, paper ledger and paid resources remain OFF; budget Rp0.

## Data

- Free public Binance klines `data-api.binance.vision`, BTCUSDT interval 5m, retrieved `2026-11-27T06:49:52Z`.
- 9,999 closed M5 candles, `2026-10-23T13:30Z` → `2026-11-27T06:40Z`; one still-open candle was skipped, never used for signals.
- Quality: 0 duplicates, 0 missing intervals, 0 OHLCV violations. Provenance sidecar with source, symbol, interval, range, rows, retrieval time and SHA-256 `38fb4834944bab43a94d9e91363f601b03e661846f8cfd2424efb456b473c012`.
- `m5_data.py` rejects non-UTC/naive timestamps, duplicate and missing candles, invalid OHLCV, checksum mismatch and stale data (>3 bars old relative to retrieval).

## Engine

- `hybrid.py`: EMA, RSI, VWAP, ATR, breakout; regime (UP/DOWN/FLAT × LOW/NORMAL/HIGH); SCALP / MOMENTUM / HOLD / NO_TRADE selector; bounded config; ATR-based stop/TP; risk-based position fraction; mode comparison.
- `hybrid_backtest.py`: next-bar-open execution, SPOT long-only, FUTURES long/short at 1x baseline, fee 7.5 bps + slippage 7.5 bps + spread 2 bps per side, funding 0 spot / pre-registered 0 futures, stop/take-profit, simplified isolated liquidation, kill switch, final-equity drawdown recomputation.
- `hybrid_validation.py`: train 60% / validation 20% / OOS 20%, contiguous disjoint walk-forward (2000 train / 500 test / step 500), selection on validation only, OOS once, unchanged criteria (≥2 trades, OOS DD ≤25%, WF majority positive).

Six experiments were pre-registered in `research/python/experiments/hybrid_registry.json` at `2026-11-27T06:59:49Z`, before the first report. Reports: `research/python/output/hybrid_m5/`.

| Experiment | Instrument | OOS net % | OOS DD % | Trades | PF | Expect/trade % | WF +/total | Status |
|---|---|---:|---:|---:|---:|---:|---:|---|
| m5-01 hybrid | SPOT | 0.00 | 0.00 | 0 | n/a | 0.000 | 0/15 | REJECT |
| m5-02 hybrid | FUTURES | -2.81 | 2.81 | 14 | 0.000 | -0.203 | 1/15 | REJECT |
| m5-03 scalp | SPOT | -25.53 | 25.66 | — | — | — | 0/15 | REJECT |
| m5-04 scalp | FUTURES | -35.33 | 36.82 | 188 | 0.238 | -0.282 | 0/15 | REJECT |
| m5-05 momentum | SPOT | 0.00 | 0.00 | 0 | n/a | 0.000 | 0/15 | REJECT |
| m5-06 momentum | FUTURES | -2.81 | 2.81 | 14 | 0.000 | -0.203 | 1/15 | REJECT |

Benchmarks are in each report (`buy_hold_net_pct`, `no_trade_return_pct = 0`). No strategy passed walk-forward majority; scalping breached drawdown limit. Hybrid produced no tradable signal on SPOT and only 14 futures trades OOS. These are failures, retained as evidence; criteria were not relaxed.

## Verification

`python3 -m unittest discover -s research/python -p 'test_*.py'`: **all tests pass** (M5 data 5, hybrid 7, backtest 6, validation 3, plus existing Quant suites). `git diff --check` clean. Engineering status: Python engine is code + tests + artifacts, not a deployed service.

## P0 audit — engine correction and superseded metrics (28 November 2026)

The six results in the table above were produced by the **pre-correction** engine and are retained as historical evidence at `research/python/output/hybrid_m5/`. A follow-up audit found defects that invalidate their reported numbers:

1. **Double-counted holding-period return.** The old engine marked equity to market on every held bar and then multiplied equity by the *full* trade return again at exit. Isolated A/B on identical candles, signals and costs (full-exposure configuration): old engine final equity **+0.679808 %** while the trade's true net return was **+0.178914 %** — a **+0.500894 pp phantom gain**. The corrected engine reports final equity **+0.178657 %** and satisfies the invariant `final_equity == Π(1 + trade.net_pct/100)` exactly (gap 0.0).
2. **Expectancy unit mismatch.** `Trade.net_pct`/`gross_pct`/`funding_pct` were fractions stored under percent names; the independent verifier could pass producer and consumer with the same wrong convention. Canonical unit is now percent per trade (1.0 = 1 %), enforced by `test_expectancy_units.py` and recomputation in `verify_report.py`.
3. **Signal re-entry.** One signal could open up to six positions after a stop; the corrected engine consumes a signal after it opens or expires (A/B: 6 trades → 2 on the same input).
4. **Drawdown kill switch** did not arm when the breach was realised by a signal exit or stop-loss while flat, allowing re-entry past the limit; a daily-loss halt was missing; gap-through-stop filled at the stop price instead of the open; the 1x liquidation approximation was mathematically wrong (now `L = E(1−1/leverage)/(1−maintenance)` for longs).
5. **O(n²) signal generation** rebuilt indicator series inside the bar loop. It is now O(n); `test_strategy_equivalence.py` proves bit-identical output against the old implementation and constant builder-call counts.
6. **Artifact verification gap.** `verify_m5` initially failed every report on `paper_only_safety_flags`: the runner never emitted the safety contract. `run_hybrid_experiments.py` now writes `paper_only=true`, `live_trading=false`, `withdrawal=false`, `profit_claim=false`. All six corrected reports pass **30/30** independent checks.

### Corrected metrics under unchanged `validation-v1` criteria

Dataset and pre-registration are unchanged (checksum `38fb4834…c012`, registered `2026-11-27T06:59:49Z`). Only the defective accounting/risk code was corrected; no strategy parameter was tuned after seeing holdout results.

| Experiment | Instrument | OOS net % | OOS DD % | Trades | PF | Expect/trade % | Win % | Exposure % | Turnover | WF +/total | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| m5-01 hybrid | SPOT | 0.00 | 0.00 | 0 | n/a | 0.000 | 0.0 | 0.00 | 0 | 0/15 | REJECT |
| m5-02 hybrid | FUTURES | −1.241 | 1.241 | 2 | 0.000 | −0.622 | 0.0 | 0.25 | 4 | 1/15 | REJECT |
| m5-03 scalp | SPOT | −15.551 | 16.177 | 35 | 0.127 | −0.506 | 17.14 | 6.55 | 70 | 0/15 | REJECT |
| m5-04 scalp | FUTURES | −16.706 | 17.547 | 51 | 0.250 | −0.395 | 29.41 | 10.50 | 103 | 0/15 | REJECT |
| m5-05 momentum | SPOT | 0.00 | 0.00 | 0 | n/a | 0.000 | 0.0 | 0.00 | 0 | 0/15 | REJECT |
| m5-06 momentum | FUTURES | −1.241 | 1.241 | 2 | 0.000 | −0.622 | 0.0 | 0.25 | 4 | 1/15 | REJECT |

Corrected artifacts: `research/python/output/hybrid_m5_corrected/`. The reject decision is unchanged — no strategy reached the majority-positive walk-forward gate, no-trade baseline is 0 %, and the corrected drawdowns are lower because phantom gains were removed. **No promotion, no paper ledger, no worker, no live order, no withdrawal.** `m5_quality.py` is synced verbatim from `test/quantum-m5-data-risk` @ `56f8113` so this branch remains self-contained; the canonical independent verification module remains that branch.

Verification: `python3 -m unittest discover -s research/python -p 'test_*.py'` → **100 tests, 0 failures**; `verify_report.py` on all six corrected reports → **6/6 passed, 30 checks each**; `git diff --check` clean. Branch `m5-engine-p0` from `34752b7`, no new PR (WIP limit full), no merge.
