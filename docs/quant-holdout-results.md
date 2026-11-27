# RADAR AI V2 — Fresh 2024 Holdout Results (27 November 2026)

**Owner:** BOS · **Lead:** Grok / Divisi 04 · **Branch:** `feat/quant-holdout-experiment`
**Registration:** `research/python/experiments/registry_holdout_v2.json` at `2026-11-27T05:23:58Z`, before any 2024 data was fetched (`retrieved_at` 05:24:50–51Z) and before any result existed. Criteria are identical `validation-v1`; no parameter was tuned on the earlier 2025–2026 sample.

## 1. Why this experiment exists

The first nine experiments used one 364-bar window (2025-11-27 → 2026-11-25). Further tuning on the same bars would be data snooping. This holdout uses a **non-overlapping earlier window**: 2024-01-01 → 2024-12-30, 365 daily candles each for BTCUSDT and ETHUSDT, from the free key-less endpoint `https://data-api.binance.vision/api/v3/klines` with `startTime=1704067200000`. Provenance (source URL, symbol, interval, retrieved_at, range, rows, checksum) is in each sidecar.

Two previously rejected families were re-tested on fresh data using their **exact same fixed grids** — no new parameter chosen after seeing 2024 results:
- `exp-06` trend + momentum: trend 20/mom 5, 50/10, 100/20.
- `exp-07` regime aware: trend 20/RSI 7 35→55, 50/14 30→60, 100/14 40→65.

## 2. Results — all rejected, no promotion

| Experiment | Market | Selected | OOS net % | OOS gross % | OOS DD % | Trades | PF | Expectancy % | Sharpe / Sortino | Exposure % | Turnover | Full net % | Buy&hold net % | WF positive | Status |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|
| exp-06 trend+momentum | BTC | 20/5 | +45.997 | +47.761 | 11.27 | 8 | 2.869 | +0.0259 | 2.69 / 3.13 | 56.52 | 16 | +34.394 | +109.405 | 3/6 | **REJECTED** |
| exp-06 trend+momentum | ETH | 20/5 | −33.550 | −32.646 | 33.55 | 9 | 0.436 | −0.0208 | −2.64 / −1.73 | 47.83 | 18 | +72.368 | +42.505 | 3/6 | **REJECTED** |
| exp-07 regime aware | BTC | 20 / RSI 7 | +8.611 | +8.774 | 0 | 1 | null | +0.0861 | 1.99 / null | 1.09 | 2 | +15.271 | +109.405 | 3/6 | **REJECTED** |
| exp-07 regime aware | ETH | 20 / RSI 7 | 0.000 | 0.000 | 0 | 0 | null | 0 | null / null | 0 | 0 | +10.709 | +42.505 | 1/6 | **REJECTED** |

Reasons: exp-06 BTC `walk_forward_not_majority_positive`; exp-06 ETH `oos_drawdown_limit` + walk-forward; exp-07 both `oos_too_few_trades` + `validation_selection_rejected` + walk-forward. Costs on every turn: 7.5 bps fee + 7.5 bps slippage; funding 0 (spot); stop loss 10%; drawdown stop 30%. No-trade baseline 0%. No-trade beats exp-07 ETH; buy-and-hold beats every strategy on both markets.

Artifacts: `research/python/output/experiments_holdout_v2/` (reports, summaries, QA). Independent `verify_report.py`: **4/4 passed**. Local `npm test` **241/241**, Python **25/25**, strict TypeScript exit 0.

## 3. Evidence-based conclusion

1. **Positive OOS net is not an edge.** BTC exp-06 earned +46% OOS after costs but still failed walk-forward (3/6) and substantially underperformed buy-and-hold (+109%). Promoting it would be selection bias.
2. **Full-sample gains are misleading.** ETH exp-06 full +72% but OOS −33.55% with a 33.55% drawdown limit breach — the strongest single demonstration in this project that full-sample net must not be reported alone.
3. **Signal frequency remains the regime-aware failure.** BTC/ETH exp-07 produced 1 and 0 OOS trades; profit factor is undefined; no statistical claim is possible.
4. **The earlier rejection was not sample-specific.** Identical grids on an independent window still fail unchanged criteria. This is evidence *against* these two simple families, not evidence that "a better grid" is just around the corner.
5. **Standards were not lowered.** No criterion changed; no grid was re-run with different values; no asset was cherry-picked for promotion; SOL was not introduced.

## 4. Status and next task

All four holdout results are **REJECTED**. No strategy is a `VALIDATION CANDIDATE`. Paper ledger, reconciliation runtime, worker, live trading, withdrawal and fund movement remain OFF; Rp0 preserved. **Next task:** if research continues, pre-register a genuinely different, evidence-backed hypothesis on a third non-overlapping window (or a different market regime definition) before observing results. Do not tune on either existing sample.
