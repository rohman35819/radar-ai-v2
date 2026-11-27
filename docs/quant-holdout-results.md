# Out-of-time BTC holdout — 27 November 2026

Purpose: test whether the four explainable strategies generalise to a period never used for selection or tuning. This is a **new pre-registered experiment**, not a re-run of the 364-bar window.

## Data and pre-registration

- Source: free public Binance klines `data-api.binance.vision`, BTCUSDT 1d, retrieved `2026-11-27T05:14:09Z`, 999 rows, SHA-256 `0db18eee1a0aa8653ff7b1051d4564da8c0a98633a56019316001118081c0061`.
- Holdout: first 634 rows with `timestamp < 2025-11-27T00:00:00Z` → `2024-03-03..2025-11-26`. This window is disjoint from the original `2025-11-27..2026-11-25` dataset. Fixture SHA-256 `104462ab64cd6864c0d259d967c2b65dd97ae443517237697ec22a347d497628`.
- `exp-06..exp-09` were written to `research/python/experiments/registry.json` at `2026-11-27T05:14:32Z`, **before** the first holdout report at `2026-11-27T05:15:39Z`. `registry_holdout.json` selects only these four pre-registered experiments.
- Criteria and costs unchanged: `validation-v1`, 7.5 bps fee + 7.5 bps slippage per side (15 bps/turn), funding 0, stop 10%, drawdown stop 30%, ≥2 OOS trades, OOS max DD ≤25%, validation accepted, walk-forward majority positive.

## Results

634 bars: train 317 / validation 158 / OOS 159; walk-forward 12 folds (120 train / 40 test, step 40). Buy&hold net **+42.94%**; no-trade 0%.

| Exp / strategy | Selected | Trades | Gross % | Net % | Max DD % | PF | Expect % | Sharpe / Sortino | Expos % / Turnover | PF(v) | OOS net/DD/tr | WF +/total | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| exp-06 SMA crossover | 5/20 | 6 | -29.65 | -30.28 | 31.68 | 0.145 | -0.0356 | -1.177 / -0.344 | 9.31 / 11 | 1.106 | -6.30 / 25.31 / 6 | 3/12 | REJECT |
| exp-07 trend momentum | t100/m20 | 6 | -31.90 | -32.51 | 32.51 | 0.000 | -0.0342 | -1.774 / -0.357 | 5.99 / 11 | 2.288 | -8.25 / 20.32 / 8 | 4/12 | REJECT |
| exp-08 mean reversion | z20 -1.5/0 | 5 | -17.35 | -17.96 | 33.34 | 0.420 | -0.0254 | -0.631 / -0.118 | 5.52 / 9 | 3.484 | -3.87 / 33.58 / 8 | 9/12 | REJECT |
| exp-09 regime aware | t20 rsi7 35/55 | 7 | 9.68 | 8.53 | 10.63 | 1.415 | 0.0074 | 0.477 / 0.059 | 2.37 / 14 | 2.486 | -8.44 / 10.14 / 2 | 4/12 | REJECT |

## Diagnosis

- No strategy is promoted. All four fail at least one unchanged acceptance criterion.
- exp-08 improved walk-forward to 9/12 (majority) on this period but OOS drawdown 33.58% breached the 25% limit; its full-sample net -17.96% is worse than simply holding BTC (+42.94%) in this window.
- exp-09 had the best full-sample net (+8.53%) and controlled drawdown (10.63%), but OOS net was -8.44% and walk-forward only 4/12. Positive full-sample return again proves to be selection bias if taken alone.
- Selection scores on validation were high for every strategy (1.1–3.5 PF) yet OOS results were negative — validationPF is not a reliable predictor here. This supports the existing decision not to promote without OOS/walk-forward confirmation.
- Buy&hold strongly positive in this earlier window while all strategies were flat/negative net of costs suggests long-flat timing on daily bars is not capturing the dominant drift. A controlled next hypothesis should model exposure differently rather than tune the same grids again.

## Verification

`python3 -m unittest discover -s research/python -p 'test_*.py'`: 25/25 OK. `verify_report.py` on all four holdout reports: 4/4 passed. Artifacts: `research/python/fixtures/holdout/`, `research/python/output/holdout/`. No live orders, paper ledger, worker, paid service or parameter relaxation.
