# Evaluation of Five Candidate Quant Mechanisms (27 November 2026)

**Owner:** BOS · **For:** Chief Strategy Advisor / Divisi 04 · **Status:** evaluation only. Nothing here is approved for execution; a hypothesis becomes testable only after a documented, committed pre-registration.
**Standard applied:** a new indicator is not a new mechanism. A mechanism must have a distinct economic source of edge, a data source that can actually support OOS testing, and an explicit falsification condition.

## 1. Volatility expansion vs volatility contraction

- **Theory:** volatility clusters and mean-reverts. Expansion often accompanies information arrival and trend initiation; contraction often precedes expansion. A rule can participate after compression and stand aside during expansion, changing *when* capital is exposed rather than *which direction* is predicted.
- **Expected edge:** avoid trading in noisy high-volatility regimes where 15 bps/side costs dominate; capture the expansion leg after compression.
- **Data needed:** OHLCV only (true range, rolling volatility percentile). Available free from `data-api.binance.vision`; already used in prior fixtures.
- **Bias/limitations:** a volatility percentile is computed from a lookback window; if the lookback is chosen after inspecting results it is curve fitting. Contractions are frequent, so trade count may be adequate, but the rule is still a trend/flat rule underneath and can inherit exp-08's failure.
- **Overfitting risk:** medium — choosing percentile thresholds (e.g. 20th vs 30th) is exactly the grid search the Advisor forbids. Fix one conventional threshold a priori.
- **Falsification:** if OOS net after costs ≤ no-trade, or walk-forward positive folds are not a majority, or drawdown exceeds 25%, reject. Also reject if trade count < 2 (no statistical power).

## 2. Liquidity imbalance / order-flow proxy from public data

- **Theory:** aggressive buy/sell imbalance should precede short-horizon price pressure. Public aggregate trades expose a `m` flag (buyer is maker), letting us approximate taker flow.
- **Expected edge:** informational advantage from order flow rather than price pattern.
- **Data needed:** public `aggTrades` endpoint. We verified it responds without API key, but it returns only **recent** trades (the probe returned current-day timestamps). Reconstructing a full year of OOS/walk-forward history would require continuous collection or a licensed archive — neither exists at Rp0 today.
- **Bias/limitations:** retention window too short; sampling gaps; maker/taker flag semantics vary; partial fills and hidden liquidity invisible. A proxy built on a few days of data cannot support the four-year, five-window validation standard used here.
- **Overfitting risk:** high if thresholds are tuned on the short available window; also high survivorship/recency bias.
- **Falsification:** reject immediately if the required historical window cannot be reconstructed with provenance. **Current verdict: BLOCKED by data availability — not selected.**

## 3. Market microstructure and spread-aware execution

- **Theory:** quoted spread and fee/funding/slippage assumptions determine whether a theoretical signal survives. Modelling half-spread adverse selection can turn an apparent edge into a loss — or vice versa.
- **Expected edge:** this is a **cost/realism lever**, not a directional alpha source. DeepSeek's M5 engine already charges fee, slippage, spread, funding and an isolated liquidation model.
- **Data needed:** OHLCV plus explicit spread assumptions; public order-book snapshots would be needed for actual quoted spread, which the current fixtures do not contain.
- **Bias/limitations:** assumed spread is not observed spread; backtest cannot reproduce queue position or partial fills.
- **Overfitting risk:** low for cost modelling if assumptions are fixed before testing; high if costs are lowered after a loss.
- **Falsification:** if a strategy only passes when spread/fee assumptions are reduced, it is rejected. **Current verdict: required as an enabler, not a standalone hypothesis.**

## 4. Volatility-conditioned mean reversion

- **Theory:** reversion is stronger in calm, liquid conditions and fails during volatile trends. Conditioning z-score entries on a low-volatility state could remove the drawdown breaches seen in exp-03/04 and m5-03/04.
- **Expected edge:** same reversion premium, better regime selection.
- **Data needed:** OHLCV only.
- **Bias/limitations:** mechanism is still mean reversion; exp-03 failed on multiple windows with drawdown breaches, and exp-10 (volume+close reversion proxy) failed on too few trades. Adding a filter risks re-fitting the same family.
- **Overfitting risk:** high — two filter conditions (z-score + volatility) create a large threshold space.
- **Falsification:** reject if OOS drawdown still exceeds 25%, if trades < 2, or if walk-forward folds are not majority positive. **Current verdict: not selected — insufficient distance from rejected family.**

## 5. Regime transition and volume behaviour change

- **Theory:** shifts in volume and volatility mark transitions between accumulation, distribution and trend phases. A transition detector could enter only after a state change is confirmed by both dimensions.
- **Expected edge:** early participation in a new regime rather than lagging price-only filters.
- **Data needed:** OHLCV including volume, which is available in all public kline fixtures.
- **Bias/limitations:** exp-10 used a static volume ratio and close position and produced one OOS trade. A transition rule uses changes rather than levels, which is different, but the data dimension overlaps and threshold sensitivity remains.
- **Overfitting risk:** medium-high if transition thresholds are tuned; low if fixed from a stated economic rule before data.
- **Falsification:** reject if OOS net ≤ no-trade, trades < 2, drawdown > 25%, or WF not majority.

## Selection ranking

| Mechanism | Theory | Data ready | OOS testable | Cost-safe | Snooping risk | Reproducible | Rank |
|---|---|---|---|---|---|---|---|
| 1. Volatility-compression state gate | strong | yes | yes | yes | medium (fixed threshold) | yes | **1** |
| 2. Taker-flow imbalance | strong | **no (retention)** | no | yes | high | no | blocked |
| 3. Spread-aware execution | strong (enabler) | partial | yes | yes | low | yes | enabler |
| 4. Vol-conditioned reversion | medium | yes | yes | yes | high | yes | not selected |
| 5. Volume-regime transition | medium | yes | yes | yes | medium-high | yes | **2 (conditional)** |

**Conclusion:** select at most two for pre-registration: (1) volatility-compression state gate as primary, and (2) volume-regime transition as a strictly secondary candidate with a fixed, economically justified threshold. Mechanism 2 (order flow) remains blocked by public-data retention; mechanism 3 is an execution enabler to be tracked separately with DeepSeek's M5 work.
