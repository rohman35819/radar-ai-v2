# Cross-Window Evidence Audit — 5 Windows, 16 Daily Runs + 6 M5 Runs (27 November 2026)

**Owner:** BOS · **Prepared by:** Grok / Divisi 04 for Chief Strategy Advisor · **Scope:** evidence audit only; no new experiment was run for this document.
**Rule:** facts and interpretations are separated. No mechanism is declared failed because of a single metric; every rejection cites the full reason set recorded in the pre-registered artifacts.

## 1. FACTS — full matrix

All rows are from committed artifacts. `WF` = positive walk-forward folds / total folds. `PF` blank means profit factor was undefined (no winning trades). Daily windows are non-overlapping: 2025 → 2024 → 2022 → 2020 → 2018. M5 runs are a separate 5-minute dataset from the DeepSeek branch.

| ID | Mechanism | Market | Period | Full net % | OOS net % | OOS DD % | Trades | PF | Expectancy % | WF | Recorded rejection reasons |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|
| exp-01 | SMA crossover | BTC | 2025-11→2026-11 | −29.53 | −16.23 | 16.23 | 6 | 0.318 | −0.0148 | 2/6 | WF minority |
| exp-01 | SMA crossover | ETH | 2025-11→2026-11 | −23.86 | −35.78 | 35.78 | 7 | 0.085 | −0.0448 | 2/6 | OOS DD limit, WF minority |
| exp-02 | trend+momentum | BTC | 2025-11→2026-11 | +5.70 | −13.43 | 14.28 | 6 | 0.248 | −0.0206 | 1/6 | WF minority |
| exp-02 | trend+momentum | ETH | 2025-11→2026-11 | −32.88 | −25.06 | 25.06 | 7 | 0.140 | −0.0289 | 2/6 | OOS DD limit, WF minority |
| exp-03 | z-score reversion | BTC | 2025-11→2026-11 | −22.66 | −21.04 | 33.38 | 7 | 0.311 | −0.0299 | 3/6 | OOS DD limit, WF minority |
| exp-03 | z-score reversion | ETH | 2025-11→2026-11 | −27.49 | −24.67 | 37.35 | 7 | 0.390 | −0.0363 | 3/6 | OOS DD limit, selection rejected, WF minority |
| exp-04 | RSI regime pullback | BTC | 2025-11→2026-11 | +10.49 | +2.82 | 0.05 | 1 | — | +0.0135 | 3/6 | too few trades, WF minority |
| exp-04 | RSI regime pullback | ETH | 2025-11→2026-11 | −0.72 | +6.60 | 2.06 | 2 | — | +0.0258 | 1/6 | selection rejected, WF minority |
| exp-05 | fast RSI regime | BTC | 2025-11→2026-11 | +13.90 | +6.86 | 0.43 | 1 | — | +0.0332 | 2/6 | too few trades, WF minority |
| exp-06 | trend+momentum | BTC | 2024 | +34.39 | **+46.00** | 11.27 | 8 | **2.869** | +0.0259 | 3/6 | WF minority (buy&hold +109.4%) |
| exp-06 | trend+momentum | ETH | 2024 | +72.37 | −33.55 | 33.55 | 9 | 0.436 | −0.0208 | 3/6 | OOS DD limit, WF minority |
| exp-07 | RSI regime | BTC | 2024 | +15.27 | +8.61 | 0 | 1 | — | +0.0861 | 3/6 | too few trades, selection rejected, WF minority |
| exp-07 | RSI regime | ETH | 2024 | +10.71 | 0 | 0 | 0 | — | 0 | 1/6 | too few trades, selection rejected, WF minority |
| exp-08 | Donchian+ATR breakout | BTC | 2022 | −15.37 | −7.82 | 12.85 | 2 | 0.225 | −0.0260 | 1/6 | WF minority |
| exp-09 | opening continuation | BTC | 2020 | 0 | 0 | 0 | 0 | — | 0 | 0/6 | too few trades, selection rejected, WF minority — **no signal existed** |
| exp-10 | volume close strength | BTC | 2018 | −3.64 | −5.51 | 5.51 | 1 | 0 | −0.0551 | 1/6 | too few trades, WF minority |
| m5-01 | hybrid SPOT 5m | BTC | M5 window | — | 0 | 0 | — | — | — | 0/15 | too few trades, undefined PF, WF minority |
| m5-02 | hybrid FUTURES 5m | BTC | M5 window | — | −2.81 | 2.81 | — | — | — | 1/15 | WF minority |
| m5-03 | scalp SPOT 5m | BTC | M5 window | — | −25.53 | 25.66 | — | — | — | 0/15 | DD limit, selection rejected, WF minority |
| m5-04 | scalp FUTURES 5m | BTC | M5 window | — | −35.33 | 36.82 | — | — | — | 0/15 | DD limit, selection rejected, WF minority |
| m5-05 | momentum SPOT 5m | BTC | M5 window | — | 0 | 0 | — | — | — | 0/15 | too few trades, undefined PF, WF minority |
| m5-06 | momentum FUTURES 5m | BTC | M5 window | — | −2.81 | 2.81 | — | — | — | 1/15 | WF minority |

Source artifacts: `research/python/output/experiments/summary.json` (develop), `experiments_holdout_v2/summary.json` (PR #159), `experiments_window3|4|5/summary.json` (exp branches), `output/hybrid_m5/summary.json` (DeepSeek M5 branch). All daily rows are `data_kind=public_api`, costs 15 bps/side, funding 0 for spot, `validation-v1` unchanged.

## 2. FACTS — cross-window regularities

1. **Walk-forward is the binding constraint in every single run.** Best daily result is 3/6; best M5 result is 1/15. No run reached a majority of positive folds, regardless of mechanism, asset, or timeframe.
2. **Positive OOS net does not imply an edge.** exp-06 BTC produced +46% OOS and PF 2.87, yet underperformed buy-and-hold (+109.4%) and failed walk-forward. exp-04/05/07 produced positive OOS net with 1–2 trades and undefined profit factor.
3. **Full-sample and OOS frequently disagree in sign.** exp-06 ETH full +72.37% versus OOS −33.55%; exp-02 BTC full +5.70% versus OOS −13.43%. Full-sample return alone is not evidence.
4. **Drawdown limit breaches cluster in reversion/scalp families.** exp-01/02/03 ETH, exp-06 ETH, m5-03, m5-04 all breached the 25% OOS drawdown ceiling.
5. **Low-frequency filters fail the minimum-trade criterion.** exp-04/05/07/09/10, m5-01/05 produced 0–2 OOS trades; expectancy and profit factor are statistically uninformative there.
6. **exp-09 is a data-contract failure, not a strategy result.** Zero of 365 bars had an opening move ≥0.5% because a continuous market's daily open is effectively the prior close.
7. **M5 adds no rescue so far.** All six DeepSeek M5 runs are rejected; two have zero trades and two breached drawdown.

## 3. INTERPRETATION (clearly not fact)

- The recurring failure of walk-forward suggests **parameter/instance instability** rather than uniformly wrong direction. A rule that wins in one 120-bar train/test window often loses in the next; this is the signature of regime dependence and small effective sample size, not proof that trend, reversion or breakout mechanisms are universally invalid.
- The fact that buy-and-hold beat every positive daily result in 2024 and that no-trade beat several strategies in bear windows suggests the tested rules mostly **traded less or later** than the dominant regime, without compensating risk adjustment.
- Reversion/scalp drawdown breaches are consistent with **uncapped adverse continuation**; their stop and kill-switch designs limit tail loss but do not produce positive expectancy after 15 bps/side.
- The minimum-trade failures indicate the entry conditions are too restrictive relative to the 92-bar OOS segment; this is a **statistical power** problem, not evidence of profitability.
- M5's higher frequency did not fix instability: more folds (15) still produced 0–1 positive folds for most modes.

## 4. NEW HYPOTHESES (not tested, not yet pre-registered)

- **Volatility-state conditioning rather than a new direction rule:** use volatility *compression* as a gate for participation, and volatility *expansion* as a risk-off trigger. This differs from exp-08, where ATR was a stop distance, not a state filter.
- **Liquidity/flow proxy from public data:** taker-buy/taker-sell imbalance from public aggregate trades could provide an order-flow dimension absent from OHLCV. Feasibility is blocked by historical retention (see mechanism evaluation).
- **Execution realism as a separate lever:** spread-aware M5 execution already exists in DeepSeek's engine; improving it changes measured net returns without changing directional edge, so it must not be presented as a new alpha source.

No new experiment was run, no dataset was fetched, and no criterion was changed for this audit.
