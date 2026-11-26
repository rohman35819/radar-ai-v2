# Quant-first validation results — 27 November 2026

Status: **no strategy promoted**. All pre-registered experiments were executed and rejected under unchanged criteria. This is a research result, not a profitability claim.

## Reproduction

```
python3 -m unittest discover -s research/python -p 'test_*.py'
python3 research/python/run_experiments.py --out-dir <temp-dir>
python3 research/python/verify_report.py <temp-dir>/<id>_<symbol>_report.json \
  --csv research/python/fixtures/<symbol>_1d_public.csv
```

Data: public Binance klines via `data-api.binance.vision`, BTCUSDT and ETHUSDT, 1d, 364 bars (2025-11-27 → 2026-11-25). Retrieved 2026-11-26T18:46:03Z; BTCUSDT SHA-256 `9976744e46f7fac896995ac45e1b042d3626647ddafd0c00dfe94ce4864dc013`.

Costs: 7.5 bps fee + 7.5 bps slippage per side (15 bps per turn), funding 0 (spot), position fraction 1.0, stop-loss 10%, drawdown stop 30%. Criteria (unchanged): ≥2 OOS trades, OOS max DD ≤25%, validation selection accepted, walk-forward majority positive. Selection uses train/validation only; OOS evaluated once with the selected candidate's own signals.

## Results

| Experiment | Symbol | Selected | OOS net % | Full net % | WF +/total | Buy&hold net % | Decision |
|---|---|---|---:|---:|---:|---:|---|
| exp-01 SMA baseline | BTCUSDT | 3/8 | -16.23 | -29.53 | 2/6 | -34.00 | reject |
| exp-01 SMA baseline | ETHUSDT | 3/8 | -35.78 | -23.86 | 2/6 | -44.03 | reject |
| exp-02 trend momentum | BTCUSDT | 20/5 | -13.43 | 5.70 | 1/6 | -34.00 | reject |
| exp-02 trend momentum | ETHUSDT | 50/10 | -25.06 | -32.88 | 2/6 | -44.03 | reject |
| exp-03 mean reversion | BTCUSDT | z20, -1.5/0 | -21.04 | -22.66 | 3/6 | -34.00 | reject |
| exp-03 mean reversion | ETHUSDT | z20, -1.5/0 | -24.67 | -27.49 | 3/6 | -44.03 | reject |
| exp-04 regime aware | BTCUSDT | t20, rsi7 | 2.82 | 10.49 | 3/6 | -34.00 | reject |
| exp-04 regime aware | ETHUSDT | t20, rsi7 | 6.60 | -0.72 | 1/6 | -44.03 | reject |
| exp-05 regime aware fast | BTCUSDT | t20, rsi7, 35/60 | 6.86 | 13.90 | 2/6 | -34.00 | reject |

No-trade return is 0% by definition. Every rejected result retains its JSON report and QA sidecar; criteria were never relaxed after observing results. Walk-forward never reached a positive majority; SMA additionally failed OOS drawdown on ETH, and regime-aware had too few OOS trades on BTC.

`exp-05-regime-aware-fast` was pre-registered in `research/python/experiments/registry.json` at `2026-11-26T19:38:43Z`, **before** it was run. Its shorter lookbacks raised full-sample net to 13.90% and OOS net to 6.86%, but it still had too few OOS trades and only 2/6 positive walk-forward folds, so it was rejected. Further parameter tuning on the same 364 bars would be data snooping; the next valid step is a fresh holdout period or a different, pre-registered hypothesis rather than relaxing criteria. No strategy is promoted.

## Correctness fix applied here

`run_backtest()` recorded the kill-switch exit into the last equity point but left `max_drawdown` based on the pre-exit drawdown, so the reported value could disagree with an independent recomputation (`verify_report.py` failed `max_drawdown_recomputed` on exp-03 BTCUSDT with 31.385% reported vs 29.586% recomputed). Path-dependent metrics are now recomputed from the final equity curve after the loop. All 25 Python tests pass and all 8 regenerated reports pass independent QA.

## Limitations

One asset/interval per experiment, one public venue, simplified intrabar fills, no order execution, no paper ledger. Historical results do not guarantee future outcomes. No profitable strategy claim is made.
