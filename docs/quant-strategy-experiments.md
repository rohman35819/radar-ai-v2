# RADAR AI V2 — Registered Quant Strategy Experiments (27 November 2026)

**Owner:** BOS · **Lead:** Grok / Divisi 04 · **Branch/PR:** `feat/quant-mvp-vertical-slice` / #156
**Policy:** hypotheses, parameter grids, costs and acceptance criteria were written to `research/python/experiments/registry.json` **before** any result was observed. Nothing below was re-run with looser criteria; failed experiments are retained as evidence.

## 1. Fixed evaluation contract

- Data: Binance public daily klines, BTCUSDT and ETHUSDT, 364 candles each, 2025-11-27 → 2026-11-25, via free endpoint `https://data-api.binance.vision/api/v3/klines` (no API key). ETH retrieved 2026-11-26T19:24Z; BTC retrieved 2026-11-26T18:46Z. Provenance and checksums are in each fixture sidecar.
- Costs: 7.5 bps fee + 7.5 bps slippage per side (15 bps per position turn), funding 0 (spot), position fraction 1.0, stop loss 10%, drawdown kill switch 30%.
- Split: 50% train / 25% validation / 25% OOS; walk-forward train 120 bars → test 40 bars, step 40.
- Acceptance (`validation-v1`, unchanged): ≥2 OOS trades, OOS max drawdown ≤25%, validation selection accepted, and walk-forward positive folds must be a majority. Strictly ≥4 of 6 folds for these datasets.
- No look-ahead: signal at bar `i` reads only information up to `i-1`; warm-up comes from earlier bars. Each candidate uses its own SMA/feature stream.

## 2. Results (all rejected — recorded, not hidden)

| ID | Strategy | Symbol | Selected params | OOS net % | Full net % | Max DD % (full) | Trades | WF positive | Rejection reasons |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| exp-01 | SMA crossover | BTC | fast 3 / slow 8 | −16.23 | −29.53 | lihat report | — | 2/6 | `walk_forward_not_majority_positive` |
| exp-01 | SMA crossover | ETH | fast 3 / slow 8 | −35.78 | −23.86 | lihat report | — | 2/6 | `oos_drawdown_limit`, `walk_forward_not_majority_positive` |
| exp-02 | Trend + momentum | BTC | trend 20 / momentum 5 | −13.43 | +5.70 | lihat report | — | 1/6 | `walk_forward_not_majority_positive` |
| exp-02 | Trend + momentum | ETH | trend 50 / momentum 10 | −25.06 | −32.88 | lihat report | — | 2/6 | `oos_drawdown_limit`, `walk_forward_not_majority_positive` |
| exp-03 | Mean reversion | BTC | z 20 / entry −1.5 / exit 0 | −21.04 | −22.66 | lihat report | — | 3/6 | `oos_drawdown_limit`, `walk_forward_not_majority_positive` |
| exp-03 | Mean reversion | ETH | z 20 / entry −1.5 / exit 0 | −24.67 | −27.49 | lihat report | — | 3/6 | `oos_drawdown_limit`, `validation_selection_rejected`, `walk_forward_not_majority_positive` |
| exp-04 | Regime aware | BTC | trend 20 / RSI 7 / 35→55 | +2.82 | +10.49 | lihat report | — | 3/6 | `oos_too_few_trades`, `walk_forward_not_majority_positive` |
| exp-04 | Regime aware | ETH | trend 20 / RSI 7 / 35→55 | +6.60 | −0.72 | lihat report | — | 1/6 | `validation_selection_rejected`, `walk_forward_not_majority_positive` |

Exact per-experiment metrics, trade ledgers, equity curves and the generated `quant-report.v1` artifacts are in `research/python/output/experiments/`. Independent `verify_report.py` recomputation passed **8/8** experiments. `summary.json` is the machine-readable roll-up.

## 3. Diagnosis supported by the artifacts

1. **Walk-forward instability is the common failure.** No configuration produced a majority of positive test folds (best 3/6). Parameter selection on validation is unstable across rolling windows; short lookbacks win on one window and lose on the next. This is evidence of regime sensitivity, not of a robust edge.
2. **Long/flat strategies remain exposed during sustained drawdowns.** Mean reversion breached the 25% OOS drawdown limit on both assets; SMA ETH did likewise. The 10% stop and 30% kill switch bound the worst case but do not create positive expectancy after 15 bps/turn.
3. **OOS net returns after costs are negative or based on too few trades.** Regime-aware BTC had positive OOS net but failed the minimum trade count, and its walk-forward was still 3/6.
4. **Full-sample "positive" results are not evidence.** Trend-momentum BTC (+5.70%) and regime-aware BTC (+10.49%) still failed OOS/walk-forward. Reporting only full-sample net would be selection bias; it is explicitly rejected here.
5. **No criterion was relaxed.** No parameter was added after seeing results, no failed experiment was re-run with a different grid, and no asset was cherry-picked. SOL was not tested because the BTC/ETH acceptance gate was not met.

## 4. Decision and blocked next step

**No strategy is promoted.** Paper ledger + reconciliation remains locked per BOS directive: promotion requires passing `validation-v1` and explicit BOS approval. Worker, scheduler, live trading, withdrawal and fund movement remain OFF; Rp0 preserved.

## 5. Reproduction

```sh
python3 research/python/fetch_ohlcv.py --symbol BTCUSDT --interval 1d --limit 365 \
  --output research/python/fixtures/btcusdt_1d_public.csv
python3 research/python/fetch_ohlcv.py --symbol ETHUSDT --interval 1d --limit 365 \
  --output research/python/fixtures/ethusdt_1d_public.csv
python3 research/python/run_experiments.py
# Independent QA for each generated report:
python3 research/python/verify_report.py \
  research/python/output/experiments/exp-04-regime-aware_btcusdt_report.json \
  --csv research/python/fixtures/btcusdt_1d_public.csv
```

## 6. Future hypotheses (registered, NOT run)

These are candidates for a *new* pre-registered experiment, not results: volatility-targeted position sizing, multi-asset trend confirmation, longer regime lookbacks with a hard minimum-trade floor, and a no-trade regime detector. They must be written into a new registry version with fixed grids and criteria before execution.
