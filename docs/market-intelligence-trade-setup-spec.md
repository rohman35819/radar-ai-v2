# Market Intelligence & Trade Setup Specification

Status: approved direction / staged backlog. This document is a product and engineering specification, not a claim that the features are implemented.

## Product outcome

RADAR AI should help the owner compare crypto assets using broad, timestamped, quality-checked evidence. A scanner candidate must open a full asset detail view. A trade setup may show a conditional entry zone, invalidation/stop, TP1/TP2/TP3, risk/reward and rationale only when source coverage and data freshness pass quality gates.

No system can guarantee profit or identify a coin that will certainly rise. The platform is decision support, not a profit guarantee or autonomous trading authorization.

## Asset drill-down

Clicking an asset from Top Scanner, Top Movers, watchlist or alert opens a canonical asset detail page. Identity must include chain and contract address where applicable, exchange, market type (spot/perpetual), base/quote and provider identifiers. Symbol-only matching is unsafe.

### Required panels

- Overview: price, market cap, FDV, circulating/total/max supply, 24h change, source coverage and freshness.
- Candles: OHLCV across supported intervals (e.g. 1m/5m/15m/1h/4h/1d where provider permits), with interval volume and timestamp.
- Spot market quality: 24h rolling volume, interval volume, trades, spread and order-book depth/slippage where available.
- Derivatives: open interest, funding rate, mark/index price, basis, contract metadata and long/short ratios only where a reliable endpoint exists.
- Liquidity/DEX: pool liquidity, pool volume, price impact and pool identity.
- Fundamentals: protocol TVL, fees/revenue, token supply and unlock schedule with source and date.
- On-chain: active addresses, transfers, exchange flows or wallet activity only when provider definitions and coverage are explicit.
- Catalysts: relevant news, governance and announcements with source links and published timestamps.
- Signal history: every previously emitted setup and its subsequent outcome.

Do not label 24h rolling volume as candle volume or 10-minute native volume. Do not infer open interest from volume. Missing values are unavailable, never silently zero.

## Data provenance contract

Every metric carries:
- canonical asset and market identity;
- provider/source and endpoint family;
- observed_at and received_at timestamps;
- interval/timeframe and units;
- raw/normalized value distinction;
- freshness state (fresh, delayed, stale, unavailable);
- quality state (validated, estimated, partial, conflicting);
- coverage and any transformation method.

Provider adapters must respect documented ToS, rate limits, attribution and retention rules. Use bounded concurrency, timeouts, retry/backoff, caching and per-provider rate limiting. Keep source failures isolated. Avoid paid tiers and production API credentials until owner approval.

## Analysis and ranking

Use transparent, testable features, not an opaque LLM verdict:
- market regime and multi-timeframe trend;
- price structure, support/resistance and VWAP context;
- ATR/realized volatility and momentum;
- relative volume and volume profile where supported;
- liquidity, spread, depth and estimated execution impact;
- OI change, funding, basis and positioning context;
- market breadth and correlation/regime;
- unlock/vesting, protocol fundamentals, news and on-chain catalysts.

Each score must explain positive and negative contributions, missing inputs and model/version. Avoid look-ahead bias, survivorship bias, data leakage and overfitting. A high scanner rank means "worth investigating", not "buy".

## Conditional trade setup

A setup is generated only if the underlying data snapshot is sufficiently fresh and complete. It contains:
- directional bias: long, short or neutral;
- setup family and timeframe;
- entry zone (not a false-precision single price);
- invalidation condition and stop level;
- TP1, TP2 and TP3, with the rule used to derive each;
- expected R multiple and fee/slippage assumptions;
- confidence/probability only after calibration on out-of-sample outcomes;
- supporting evidence, counter-evidence and key risks;
- expiry time and conditions that cancel the setup;
- market snapshot ID and analysis/model version.

Levels must be reproducible from recorded OHLCV/market structure/ATR/liquidity and documented deterministic rules. The language model may explain a setup but must not invent price levels. If the market snapshot is stale, conflicting or incomplete, suppress the setup or display "belum tersedia/belum tervalidasi". Never imply TP levels are guaranteed to be reached.

## Validation before trusting signals

- Historical walk-forward and out-of-sample evaluation.
- Fees, spread, slippage, funding, latency and realistic fill assumptions.
- Record all signals immutably, including losses, invalidations and expired setups.
- Track sample size, win rate, expectancy, profit factor, max drawdown, MAE/MFE, TP/SL ordering and calibration.
- Forward paper-trading before any claim of live usefulness.
- Publish methodology, test period and limitations beside performance.

## Dashboard experience

Dashboard should show daily scanner candidates with rank change, concise reasons and data-quality badge. Selecting a candidate opens the full detail page. The setup panel shows entry zone, stop/invalidation, TP1/TP2/TP3, R:R, timeframe, expiry and reasons, plus a clear "scenario / not guaranteed" label. Include signal journal and realized paper outcomes; never cherry-pick winners.

## Delivery stages and ownership

1. Stage 0 source audit/data contract: Division 08 provider matrix; Division 03 market/derivatives semantics; Division 04 feature hypotheses; Division 01 security review; Division 05 data-quality fixtures.
2. Stage 1 data foundation: canonical identities, adapters, normalized OHLCV/derivatives, freshness and quality. Historical persistence waits for a verified durable storage decision.
3. Stage 2 asset drill-down: clickable scanner rows, chart, volume, OI/funding and source status; responsive QA.
4. Stage 3 explainable setup generator: entry/stop/TPs, rationale, invalidation, expiry and quality gates.
5. Stage 4 backtest and forward paper validation.
6. Stage 5 dashboard daily ranking, signal journal, outcome tracking and alerts.

## Security and execution boundaries

No seed phrase/private key collection. No order execution in this scope. Live trading remains OFF. Exchange API secrets stay server-side. No paid data provider, paid quota, storage provisioning or production mutation without explicit BOS approval. Hostless EROFS means ephemeral paths cannot be treated as durable historical storage.

## Acceptance criteria

- Every metric displays provenance, timestamp, interval, freshness and quality.
- Rolling 24h volume, candle volume, OI and funding remain distinct.
- Unsupported fields are never fabricated or shown as zero.
- Setup levels can be reproduced from the immutable market snapshot and documented rules.
- Confidence is not advertised as calibrated until out-of-sample evidence exists.
- Backtests account for fees/slippage/funding and report losses and sample size.
- Desktop/mobile detail and chart interactions pass QA.
- No trading execution or paid infrastructure is enabled by this work.
