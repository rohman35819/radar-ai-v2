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

All experiments use 364 daily bars (train 182 / validation 91 / OOS 91), long-flat only. `PF(v)` is the profit factor computed on the validation segment for selection; OOS columns are net % / max DD % / trades. Benchmarks: buy&hold net -34.00% BTC, -44.03% ETH; no-trade 0%.

| Exp / strategy | Symbol | Selected | Trades | Gross % | Net % | Max DD % | PF | Expect % | Sharpe / Sortino | Expos % / Turnover | PF(v) | OOS net/DD/tr | WF +/total | B&H % | Status |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| exp-01 SMA crossover | BTC | 3/8 | 9 | -28.57 | -29.53 | 30.48 | 0.180 | -0.0251 | -2.581 / -0.728 | 9.34 / 17 | 0.381 | -16.23 / 16.23 / 6 | 2/6 | -34.00 | REJECT |
| exp-01 SMA crossover | ETH | 3/8 | 7 | -23.06 | -23.86 | 31.68 | 0.167 | -0.0345 | -1.282 / -0.315 | 8.79 / 13 | 4.553 | -35.78 / 35.78 / 7 | 2/6 | -44.03 | REJECT |
| exp-02 trend momentum | BTC | 20/5 | 24 | 9.58 | 5.70 | 21.92 | 0.890 | -0.0017 | 0.324 / 0.277 | 32.14 / 48 | 0.210 | -13.43 / 14.28 / 6 | 1/6 | -34.00 | REJECT |
| exp-02 trend momentum | ETH | 50/10 | 5 | -32.37 | -32.88 | 32.88 | 0.025 | -0.0384 | -2.542 / -0.419 | 3.85 / 9 | 0.462 | -25.06 / 25.06 / 7 | 2/6 | -44.03 | REJECT |
| exp-03 mean reversion | BTC | z20 -1.5/0 | 4 | -22.20 | -22.66 | 29.59 | 0.425 | -0.0292 | -1.348 / -0.294 | 9.07 / 7 | 0.585 | -21.04 / 33.38 / 7 | 3/6 | -34.00 | REJECT |
| exp-03 mean reversion | ETH | z20 -1.5/0 | 4 | -27.06 | -27.49 | 34.97 | 0.176 | -0.0534 | -1.389 / -0.310 | 7.42 / 7 | 1.048 | -24.67 / 37.35 / 7 | 3/6 | -44.03 | REJECT |
| exp-04 regime aware | BTC | t20 rsi7 35/55 | 7 | 11.66 | 10.49 | 6.65 | 2.609 | 0.0127 | 1.125 / 0.206 | 3.30 / 14 | 1.753 | 2.82 / 0.05 / 1 | 3/6 | -34.00 | REJECT |
| exp-04 regime aware | ETH | t20 rsi7 35/55 | 6 | 0.18 | -0.72 | 16.80 | 1.040 | 0.0010 | 0.036 / 0.005 | 4.12 / 12 | 0.000 | 6.60 / 2.06 / 2 | 1/6 | -44.03 | REJECT |
| exp-05 regime aware fast | BTC | t20 rsi7 35/60 | 7 | 15.11 | 13.90 | 6.65 | 2.731 | 0.0150 | 1.234 / 0.344 | 5.22 / 14 | 1.753 | 6.86 / 0.43 / 1 | 2/6 | -34.00 | REJECT |

No CANDIDATE and no REPEAT is promoted: every row fails `walk_forward_not_majority_positive`; SMA also fails OOS drawdown, and regime-aware fails the minimum OOS trade count. Positive full-sample numbers on exp-02/04/05 are not selected for promotion because OOS and walk-forward robustness failed.

No-trade return is 0% by definition. Every rejected result retains its JSON report and QA sidecar; criteria were never relaxed after observing results. Walk-forward never reached a positive majority; SMA additionally failed OOS drawdown on ETH, and regime-aware had too few OOS trades on BTC.

`exp-05-regime-aware-fast` was pre-registered in `research/python/experiments/registry.json` at `2026-11-26T19:38:43Z`, **before** it was run. Its shorter lookbacks raised full-sample net to 13.90% and OOS net to 6.86%, but it still had too few OOS trades and only 2/6 positive walk-forward folds, so it was rejected. Further parameter tuning on the same 364 bars would be data snooping; the next valid step is a fresh holdout period or a different, pre-registered hypothesis rather than relaxing criteria. No strategy is promoted.

## Correctness fix applied here

`run_backtest()` recorded the kill-switch exit into the last equity point but left `max_drawdown` based on the pre-exit drawdown, so the reported value could disagree with an independent recomputation (`verify_report.py` failed `max_drawdown_recomputed` on exp-03 BTCUSDT with 31.385% reported vs 29.586% recomputed). Path-dependent metrics are now recomputed from the final equity curve after the loop. All 25 Python tests pass and all 8 regenerated reports pass independent QA.

## Audit findings on exact heads

- Pre-registration evidence: registry commit `8791a68` was created at `2026-11-26T19:28:03Z` (commit time), before the first report at `2026-11-26T19:31:56Z`. The in-file `registered_at` value had been written as `2026-11-27T00:00:00Z` (future-dated relative to the reports); this branch corrects it to the actual commit time. `exp-05` was registered at `2026-11-26T19:38:43Z`, before its report at `2026-11-26T19:39:31Z`.
- Look-ahead: `generate_signals()` computes each bar from `i-1` information only; regression tests prove signal streams are unchanged when future candles are removed. Each candidate uses its own `(fast, slow)` / parameter dict for selection, OOS and every walk-forward fold.
- Leakage/robustness: train/validation/OOS are contiguous and disjoint; folds are contiguous 120-train/40-test with no overlap. Criteria and costs were not relaxed after results were seen. All strategies fail walk-forward majority, so no curve-fitted candidate is promoted. Tuning further on the same 364 bars would be data snooping.
- Survivorship/data scope: only BTCUSDT and ETHUSDT were mandated ex-ante from one public venue and one year of daily bars; no delisting universe, intraday data, or multi-venue confirmation. Missing data is rejected by `quant_data` quality guards rather than replaced with zero.
- Costs: 7.5 bps fee + 7.5 bps slippage per side; funding 0 for spot; intrabar stop fills are simplified. No order, paper ledger, or production execution exists.

## Limitations

One asset/interval per experiment, one public venue, simplified intrabar fills, no order execution, no paper ledger. Historical results do not guarantee future outcomes. No profitable strategy claim is made.
