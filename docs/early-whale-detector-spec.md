# AI Early Whale Detector — Technical Specification

Status: approved product direction / implementation backlog. This document is a specification only; it does not claim that real-time scanning, whale identification, scoring, or notifications are implemented.

## 1. Product decision

- Market coverage: centralized exchanges (CEX) and decentralized exchanges (DEX).
- Initial risk profile: medium.
- Notifications: Telegram Bot and browser/PWA push notifications.
- Operation: read-only market intelligence. No order placement, wallet signing, custody, transfer, or withdrawal.
- Primary outcome: identify early, evidence-backed accumulation/volume anomalies before a move becomes extended. A signal is a research lead, not a buy instruction or profit guarantee.

## 2. Fit with current RADAR AI

Existing foundations verified on main:
- Node.js >=20, zero runtime npm dependencies, native HTTP server.
- CoinGecko Market Intelligence in `lib/market-intelligence.js`, with hourly cache and market/trending/exchange/chart endpoints. This is useful for universe discovery and context, not a real-time tape.
- Solscan Pro v2 integration already exists for Solana intelligence. Its key must remain server-side.
- Existing Telegram configuration is documented as `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
- Existing `DATA_DIR`/EROFS concern means durable signal history and cooldown state must not be assumed until writable persistent storage is verified.
- Existing market-intelligence trade setup specification requires canonical identities, provenance, freshness/quality metadata, and staged delivery. This feature must follow those contracts and must not create trade setups in this phase.

Reuse current services where appropriate; do not replace existing CoinGecko, Solscan, screener, alerts, or dashboard features.

## 3. Scope and non-goals

### In scope
- CEX spot market discovery and streaming for supported symbols.
- DEX pool discovery and swap/transaction monitoring for supported chains.
- Relative-volume and trade-size anomaly detection.
- Wallet/pool accumulation evidence where the source actually exposes wallet identity.
- Liquidity, spread, price-impact, token/contract-risk gates.
- Explainable 0–100 ranking, signal journal, Telegram and PWA notifications.
- Health/freshness/coverage telemetry and replayable tests.

### Explicitly out of scope
- Automated buy/sell, exchange order endpoints, wallet signing, custody, deposits, transfers, or withdrawals.
- Claims that CEX public trades identify a specific whale or beneficial owner.
- Treating a large transfer as a market buy.
- Treating DEX pool volume or token price movement as proof of net accumulation.
- Paid provider subscriptions, production secret changes, Hostless configuration changes, or storage provisioning without explicit BOS approval.

## 4. Source matrix and capability boundaries

| Source | Initial use | Strength | Limitation / guard |
|---|---|---|---|
| Binance Spot WebSocket `@aggTrade`, ticker and depth | CEX real-time trade flow, price and order-book context | Real-time public trade/depth events | AggTrade identifies taker-side maker flag, not the beneficial owner; depth is not proof of executed buying |
| OKX public WebSocket | Second CEX adapter for trades, tickers and books | Independent exchange coverage | Normalize exchange-specific side/size semantics; confirm current public channel limits before rollout |
| CoinGecko Market Intelligence | Universe seed, market cap, 24h context, trending | Already integrated | Existing service caches for 60 minutes; never use as the real-time event clock |
| DexScreener API | DEX pair discovery and pool snapshots (price, volume, transactions, liquidity, pair age) | Broad multi-chain pair metadata | Snapshot/aggregated data; not a universal raw swap feed and does not establish wallet identity |
| GeckoTerminal API | DEX network/pool discovery and OHLCV | Pool-level OHLCV and pool metadata | Public API rate limit/availability can change; budget calls and cache |
| Solscan Pro v2 | Solana token/account/transfer enrichment and wallet history | Indexed Solana on-chain data | Paid/keyed provider; existing key must stay server-only; transfer direction alone does not prove exchange buy execution |
| Chain-specific RPC/logs (later) | Raw DEX swap event stream and transaction decoding | Transaction-level evidence | Per-chain implementation and node limits; add only after Stage 0 coverage and cost review |

Source references:
- Binance Spot WebSocket: https://developers.binance.info/en/docs/catalog/core-trading-spot-trading/api/ws-streams
- OKX API docs: https://www.okx.com/docs-v5/en/
- DexScreener API: https://docs.dexscreener.com/api/reference
- GeckoTerminal API: https://api.geckoterminal.com/docs/
- Solscan Pro API: https://pro-api.solscan.io/pro-api-docs/v2.0/docs

Do not imply one provider covers all chains, all CEX symbols, wallet labels, or all whale events. Each adapter must publish coverage and capability metadata.

## 5. Canonical event and asset contracts

Every asset identity must include, where applicable:
- `venue`, `market_type` (spot/perpetual/DEX), `chain_id`, `contract_address`, `pool_address`, `exchange_symbol`, `base_asset`, `quote_asset`, and provider identifiers.
- Symbols are display labels only and must never be used as unique identity. Same-symbol assets on different chains/contracts are distinct.

Every normalized observation must include:
- `event_id` / provider sequence or transaction hash + log index where available;
- canonical asset and market identity;
- `event_type` (trade, swap, ticker, depth, transfer, pool snapshot, OHLCV);
- `observed_at`, `received_at`, provider, endpoint/channel and interval;
- price, quantity, notional and currency units, with raw and normalized values distinguished;
- buyer/seller/taker side only when the source explicitly supplies reliable semantics;
- freshness, quality, coverage and any estimation method.

Never convert missing, delayed, stale, unsupported or conflicting data into zero or a positive signal.

## 6. Detection engines

### 6.1 Relative volume anomaly
- Compare short-window notional volume (initially 1m/5m/15m) with a baseline for the same asset, venue/pool and interval.
- Prefer robust median/MAD or percentile baselines over a single previous-window comparison; include time-of-day adjustment when sufficient history exists.
- Minimum warm-up: 60 minutes for provisional detection; target 7 days of comparable interval history before high-confidence classification.
- Exclude duplicate events, wash-like repetitive patterns where detectable, stale snapshots, and low-liquidity pools.
- Do not label rolling 24h volume as 5m volume.

### 6.2 Whale activity
- CEX: classify unusually large executed taker-side trades from public trade streams. Report “large taker buy/sell flow”, not a named whale or wallet.
- DEX: classify large swaps only when decoded transaction/pool evidence confirms direction and notional. Wallet identity is attached only when directly available and must be described as an address, not a known institution without verified labeling.
- A transfer, mint, burn, bridge, exchange deposit/withdrawal or internal wallet movement is a separate event class and must not be conflated with a buy.
- Thresholds should be adaptive: USD notional floor plus a size relative to recent interval volume and pool liquidity. Initial tuning values are configuration, not universal truths.

### 6.3 Liquidity and manipulation filters
- Minimum quote liquidity and pool age thresholds are configurable by chain/market.
- Estimate spread, depth and price impact for a standard notional; suppress signals when exit liquidity is inadequate.
- Flag abnormal buy/sell imbalance, repeated self-funded wallets, concentrated holders, suspicious mint/freeze/owner privileges and honeypot/tax risks where authoritative data exists.
- Missing security data means “not verified”, never “safe”.
- Detect sudden liquidity removal and invalidate an active signal.

### 6.4 Price structure and market context
- Use price change, realized volatility/ATR, range breakout, VWAP/volume context and broad market regime as supporting features.
- Medium-risk preference: prioritize early movement and avoid chasing already extended moves. A +1% to +8% early-move band may be an initial filter, not a hard universal rule.
- Cross-venue price disagreement and stale prices are quality penalties.

## 7. Explainable score and severity

Initial transparent score (0–100; calibrate only after replay and forward paper evaluation):
- Relative-volume anomaly: 25 points.
- Large executed buy-flow / verified DEX accumulation: 25 points.
- Price structure and momentum quality: 15 points.
- Liquidity, spread and estimated exit impact: 15 points.
- Token/pool security and holder-distribution evidence: 10 points.
- Market regime and cross-source confirmation: 10 points.

Hard gates override the score: stale/conflicting critical price data, insufficient liquidity, severe contract risk, unverified token identity, or source coverage below the minimum suppresses the alert. Negative evidence must reduce score and be displayed.

Severity:
- WATCH: candidate anomaly; informational, no push by default.
- STRONG: multiple independent signals and all minimum quality gates pass.
- HIGH PRIORITY: exceptional score plus confirmed liquidity/security/identity checks and no critical contradictory evidence.

A 90/100 score means ranked evidence under a versioned heuristic, not a 90% probability of profit. Do not display calibrated win probability until out-of-sample calibration exists.

## 8. Alert lifecycle and delivery

- Signal state: detected → confirmed → invalidated/expired; retain every state transition.
- Deduplicate by canonical asset + venue/pool + signal family + time bucket.
- Configurable cooldown per asset and severity; escalation may bypass cooldown only when new evidence materially changes.
- Include source timestamps, freshness, score breakdown, observed volume multiple, trade/swap evidence, liquidity, risk flags, entry-chasing warning and deep link to RADAR asset detail.
- Telegram uses existing server-side bot configuration. Never expose bot token in browser or logs.
- PWA push requires HTTPS, service worker subscription lifecycle, permission UX, server-side VAPID keys and subscription storage. Do not claim browser push works merely because Telegram works.
- Notification delivery must be queued/retried safely and idempotently; provider outage must not block scanning.

## 9. Runtime architecture

Recommended modules (names are proposed; inspect current tree before implementation):
- `lib/early-whale/identity.js`: canonical asset/pool identity.
- `lib/early-whale/normalizers/`: provider event adapters.
- `lib/early-whale/ingestors/`: WebSocket and bounded REST polling.
- `lib/early-whale/windows.js`: bounded rolling windows and baseline calculations.
- `lib/early-whale/detectors.js`: volume, large-trade, accumulation and risk features.
- `lib/early-whale/scoring.js`: deterministic score and hard gates.
- `lib/early-whale/signals.js`: lifecycle, dedupe and cooldown.
- `lib/early-whale/notifications.js`: Telegram and push adapters.
- `lib/early-whale/health.js`: source lag, reconnects, quota and coverage.
- API routes should be read-only GET for scanner/signals/config status; admin-only mutations for owner-managed filters/subscriptions.

Use one shared market-data connection per venue where possible, not one socket per browser. Reconnect with exponential backoff + jitter, ping/pong, subscription reconciliation, 24h connection rotation where required, bounded queues and backpressure. REST polling must use per-provider concurrency/rate budgets. Isolate failures by provider.

The current app uses a native Node HTTP server and zero npm runtime dependencies. Prefer native `fetch` and a small, audited WebSocket implementation only if the Node runtime supports it; otherwise propose a dependency with license, security and bundle/runtime impact review before adding it.

## 10. Persistence and operational safety

- Do not store durable signal history/cooldowns in an ephemeral/read-only filesystem.
- First resolve and verify `DATA_DIR` writable persistent storage or approve a durable external store; EROFS is a hard blocker for durable journals, not a reason to silently fall back to volatile files.
- Keep a bounded in-memory hot window for live calculations; persist compact signal/event summaries and replay fixtures, not unbounded raw tick streams.
- Apply retention, size caps, rotation, input validation, timeouts, retry/backoff and per-provider circuit breakers.
- Keep API keys and VAPID private keys server-side. Never log authorization headers, full wallet private material, or bot tokens.
- No new paid provider, paid quota, Hostless environment change, or production storage change without explicit BOS approval.

## 11. Testing and acceptance

### Deterministic unit tests
- volume baseline, zero/low-volume denominators, outliers, time buckets, late/duplicate/out-of-order events;
- buyer/seller/taker-side semantics per provider;
- large-trade thresholds across quote currencies and decimals;
- canonical identity collision tests (same symbol, different chain/contract/venue);
- stale/missing/conflicting data and hard-gate suppression;
- pool liquidity, price impact, token risk unknown vs safe;
- signal lifecycle, cooldown, dedupe, escalation and expiry;
- notification retry/idempotency and sanitized error paths.

### Integration and resilience
- recorded provider fixtures, schema drift, 429/5xx/timeouts, reconnect, sequence gaps and malformed payloads;
- provider isolation: one source outage must not stop other markets;
- bounded memory/queue/backpressure and no event-loop blocking;
- Telegram mocked integration and push subscription lifecycle tests;
- verify no secrets in response, logs, browser bundle or Git diff.

### Acceptance gates
1. Data identity, provenance, freshness and quality are correct.
2. CEX trade-side labels never claim wallet/beneficial-owner identity.
3. DEX buy-flow is based on decoded swaps, not generic transfers.
4. All high-priority alerts pass liquidity and security hard gates.
5. Score explanation and negative evidence are visible.
6. No duplicate alert storms under reconnect/replay.
7. Desktop/mobile UI, API and notification behavior pass QA.
8. Paper signal journal records every signal including invalidations and losses.
9. No trade execution capability is added.

## 12. Phased implementation plan and ownership

| Phase | Deliverable | Lead / support | Exit gate |
|---|---|---|---|
| 0. Source & data contract | Provider capability/cost/ToS matrix, canonical identity, event schema, freshness/quality contract | Division 08 lead; Divisions 03/04/01/05 support | Provider coverage and semantics approved; no paid procurement |
| 1. CEX foundation | Binance Spot trade/ticker/depth adapter; OKX adapter only after source review; normalized events and replay fixtures | Division 03 lead; Division 05 QA | Correct taker semantics, reconnect, bounded resource tests |
| 2. DEX foundation | DexScreener/GeckoTerminal discovery; Solscan enrichment; one chain-specific swap decoder pilot | Division 03 lead; Divisions 08/01 support | Token/pool identity and decoded swap direction independently verified |
| 3. Detection MVP | Relative volume, large trade/swap, liquidity/security hard gates, transparent score and signal journal | Division 04 lead; Divisions 03/05 support | Deterministic tests and replay evaluation |
| 4. Alerts & UI | Scanner list/detail, Telegram alerts, then PWA push, filters and cooldown controls | Division 02 lead; Division 05 QA | End-to-end desktop/mobile alert tests and no duplicate storms |
| 5. Forward paper evaluation | Walk-forward replay, paper journal, outcome and false-positive reporting | Division 04 lead; Divisions 05/08 support | Minimum sample and methodology published before performance claims |

### Suggested MVP limits
- Start with Binance Spot + Solana DEX only; add OKX and other chains after adapters and costs are validated.
- Universe: top liquid CEX pairs plus DEX pools that pass identity, liquidity and age filters. Do not attempt to stream every token/pool at once.
- Initial output: ranked candidate list and evidence; no buy button and no automatic trading.
- Initial score thresholds are feature flags/configuration and must be tuned on replay data before production alerts.

## 13. Release and rollback

- Implement on an isolated feature branch and open a draft PR; do not merge directly to main.
- Keep new routes/modules feature-flagged and default disabled until source credentials/quotas and persistence gates pass.
- Rollback: disable the feature flag, stop new subscriptions/notifications, retain existing dashboard and market-intelligence routes; no destructive migration.
- GitHub CI, Hostless Build, and verified LIVE are separate release gates.


## 14. BOS requirement: real-time movement alerts and actionable trading plans

The product must notify the user about every **meaningful detected market event** for every asset in the active scan universe. “Every movement” means event-driven market changes, not every raw tick or every repeated snapshot. Raw ticks are aggregated into short windows and material changes generate alerts; this prevents notification floods while preserving a live event timeline.

### 14.1 Movement event coverage

Generate timestamped events for:
- price change and acceleration (up/down, percentage and observation window);
- volume change and relative-volume multiple (1m/5m/15m versus comparable baseline);
- large executed buy/sell flow and verified DEX swaps;
- buyer/seller count and taker imbalance changes where source semantics support them;
- liquidity/depth/spread/estimated price-impact changes;
- breakout, breakdown, volatility expansion and failed breakout;
- whale accumulation/distribution evidence;
- token/pool security or holder-concentration risk changes;
- signal confirmation, score change, invalidation and expiry.

Every event record includes asset identity, venue/pool, observed and received timestamps, window, old/new values, percent/delta, source, freshness, quality, confidence/evidence, and a concise plain-language explanation. If a source is stale, unavailable or uncertain, explicitly say so.

### 14.2 Notification policy

- Telegram and PWA push are both supported delivery channels.
- All meaningful event classes appear in the in-app live activity feed.
- User-configurable alert levels: all events, important events only, or high-priority only. BOS default: all meaningful events.
- Aggregate micro-ticks into 1m/5m event summaries; notify immediately for high-impact events such as confirmed large flow, abrupt liquidity removal, security risk, breakout/breakdown, or setup invalidation.
- Deduplicate identical events, but do not suppress a materially new event merely because the asset has an active cooldown.
- Show delivery state (queued/sent/failed), retry safely and preserve the event in the feed if a channel is unavailable.
- Each alert says whether it is informational, watch, setup-ready, invalidated or risk warning. Never imply that every movement is a buy opportunity.

### 14.3 Standard alert payload

Every movement alert should answer:
1. Which coin, chain, contract, venue and pool?
2. What changed, by how much, over what period?
3. What evidence supports whale/volume/price/liquidity claims?
4. What could happen next (bullish, bearish, sideways or insufficient evidence), with scenario conditions and confidence label?
5. Is there a valid trading setup now, or should the user wait/avoid chasing?
6. If setup-ready: entry zone, maximum chase price, stop-loss/invalidation, TP1, TP2, TP3, estimated risk/reward, setup expiry and key assumptions.
7. What evidence would cancel the thesis?

### 14.4 Trading-plan calculation contract

A trading plan is conditional scenario analysis, not a promise or a command to buy.
- Entry zone must be derived from observed support/retest, VWAP/market structure, volatility and executable spread/slippage—not a fixed percentage guess.
- Provide a maximum chase price. If price has moved beyond it, mark “DO NOT CHASE / WAIT FOR RETEST” and withhold a fresh entry recommendation until recalculated.
- Stop-loss is tied to structural invalidation and volatility; include the exact price and percentage risk from the proposed entry.
- TP1/TP2/TP3 are derived from resistance/liquidity levels and risk multiples. Show exact price, percentage gain and planned partial-exit fraction; partials must sum to 100% if all targets are used.
- Show risk/reward after estimated fees and slippage where data exists. If fee/slippage data is missing, label the calculation gross/estimated.
- Include setup timestamp, data age, timeframe, scenario horizon, confidence/evidence grade and expiry.
- If identity, freshness, liquidity, security, or structure gates fail, do not fabricate entry/TP prices. Return “NO TRADE PLAN — insufficient/unsafe data” with reasons.
- Recalculate on meaningful market events. If the plan changes, send an update showing previous versus new levels and why. Send immediate invalidation when stop/structure/security thesis fails.
- No auto-trading, exchange order placement, wallet signing, custody or transfer capability.

### 14.5 Example (illustrative only)

```text
RADAR AI | MOVEMENT UPDATE | EXAMPLE ONLY
ASSET: COIN/USDT
PRICE: 0.0250 (+2.4% / 5m)
VOLUME: 5.8x baseline / 5m
FLOW: large taker-buy imbalance; whale identity not known (CEX)
OUTLOOK: bullish continuation conditional on holding VWAP and volume
SETUP: WAIT FOR RETEST
ENTRY: 0.0245–0.0250
MAX CHASE: 0.0255
STOP / INVALIDATION: 0.0235
TP1: 0.0270 | TP2: 0.0290 | TP3: 0.0320
RISK/REWARD: calculated from chosen entry after estimated costs
CONFIDENCE: evidence grade, not probability of profit
EXPIRES: recalculated on next material event / timeframe expiry
```

### 14.6 Additional QA acceptance gates

- Every configured event type is represented in the in-app activity feed and correctly routed to enabled notification channels.
- Price/volume percentages and time windows match replayed source events and are not mixed across venues or intervals.
- Notification latency is measured from provider event receipt to delivery; publish p50/p95 and source lag, do not claim “instant” without measurement.
- Event storms are bounded through aggregation without hiding material events.
- Entry/stop/targets are reproducible from versioned inputs and calculations; test gaps, slippage, fees, decimals and stale prices.
- No plan is produced when hard gates fail; “insufficient data” is an accepted result.
- Backtest/paper results include fees, slippage, missed fills and invalidated setups; never claim expected return from score alone.


## 15. Live chart and market-state visualization

The scanner detail view must include a genuinely data-driven live chart. Do not use a static illustration, simulated price motion, or decorative animation as a substitute for market data.

### 15.1 Primary chart
- Live candlesticks with selectable 1m/5m/15m/1h/4h intervals, using the same canonical venue/pool as the selected signal. Clearly label the venue, market type, quote currency and source.
- Live price line/last-price marker, candle countdown where meaningful, volume histogram, and event markers for large executed trades/swaps, relative-volume spikes, breakouts, failed breakouts, liquidity changes and signal invalidations.
- Optional overlays: VWAP, EMA 9/21/50/200, support/resistance zones and ATR bands. Indicator values and settings must be inspectable; avoid clutter by allowing overlays to be toggled.
- Momentum panel: RSI and MACD with divergence annotations only when the pivot rules and timeframe are satisfied.
- Order-flow panel when supported: taker buy/sell volume, delta/CVD and imbalance. Label CEX taker flow correctly; do not label it as identified whale wallets.
- Perpetual-only panel when a verified derivatives feed exists: open interest, funding rate, basis and liquidation events. Never infer these from spot data.
- DEX-only context where available: pool liquidity, swap counts, price impact, decoded swap direction and tracked-wallet evidence. A heatmap/depth view must be omitted when no reliable depth feed exists.

### 15.2 Live-data integrity
- The visual must update from the server's real provider stream or documented polling cadence, not from client-side interpolation that implies new market events.
- Display last source timestamp, last received timestamp, connection state, selected provider, timeframe and a visible stale-data warning. Show gaps/disconnects; do not silently draw a continuous line across missing data.
- Preserve source/venue separation. Do not combine CEX and DEX candles into one synthetic OHLC candle. Cross-venue comparison may be a separate synchronized panel.
- On reconnect, reconcile candle boundaries and deduplicate event IDs. Mark provisional/current candles as unclosed until provider confirmation.
- Desktop and mobile layouts must remain legible; mobile can simplify secondary panels but must retain price, volume, freshness and critical event markers.
- Chart QA must replay recorded streams and verify candle OHLCV, timestamps, event marker placement, reconnect behavior, stale state, interval switching and mobile rendering.

## 16. Bearish exhaustion, reversal risk and short-side evidence

The detector must evaluate both bullish continuation and downside/reversal risk continuously. A bullish score must be reduced or superseded by a bearish warning when price/flow evidence indicates that upward momentum is exhausting. Do not treat one indicator or one large trade as proof of reversal.

### 16.1 Bullish exhaustion / distribution signals
Detect and explain, where source coverage permits:
- Price makes a higher high while RSI or MACD momentum makes a lower high (bearish divergence), using confirmed swing pivots and a stated timeframe.
- Price rises or holds near highs while taker-buy volume/CVD weakens, buy delta fails to lift price, or repeated aggressive buys are absorbed.
- Relative volume spikes but candle bodies/range expansion and follow-through shrink; repeated upper wicks, failed breakout/reclaim, or close back below breakout/VWAP.
- Large executed sell flow, decoded DEX sell swaps, rising seller participation, or tracked-wallet distribution; distinguish observed wallet sells from inferred market-wide distribution.
- Perpetual market warning, only when derivatives data is available: open interest expands while price stalls/falls, funding becomes crowded/positive, basis stretches, long liquidations cluster, or aggressive sell flow increases.
- Liquidity/depth shifts against continuation, such as bid depth disappearing, spread widening, or executable exit impact rising. An order-book wall alone is not proof of a real seller because displayed orders can be cancelled.

### 16.2 Short-side evidence and wording rules
- Spot CEX trades do not expose a trader's open short position. A taker-sell trade is executed sell flow, not proof that a whale opened a short.
- A claim such as “large whale short” is allowed only when the source directly exposes a verifiable derivatives position/trade or a reliably attributed tracked account with documented methodology. Otherwise use precise labels such as “large taker-sell flow”, “bearish derivatives positioning signal”, or “tracked wallet sold”.
- Funding rate, open interest and liquidation feeds are contextual derivatives evidence, not direct proof of a named whale's position. State source, market and timestamp.
- DEX spot pools generally do not expose native short positions. Do not invent short activity from transfers, sells, token price drops or wallet balance changes.
- Where short evidence is unavailable, state “short positioning not observable from available sources”; still report bearish price/flow warnings if independently supported.

### 16.3 Scenario and price-level response
When BOS asks what a coin's move to a specific price could mean, evaluate that price against current structure and return conditional scenarios:
- Support holds: conditions for bounce/continuation, confirmation needed, invalidation level and resistance/targets.
- Support breaks: confirmation by close/volume/flow, next observable support/liquidity zones, downside risk and conditions for a bearish setup.
- False breakdown/reclaim: evidence required before changing bias back to bullish.
- If price is between levels or data is weak, say “WAIT / NO CONFIRMED SETUP”. Do not claim a future price or date as certain.

### 16.4 Bias state machine and warning priority
- Maintain a multi-timeframe state: bullish continuation, bullish weakening, neutral/compression, bearish reversal watch, bearish confirmed, or insufficient data.
- A bullish setup must be downgraded to “BULLISH EXHAUSTION — REVERSAL RISK” when multiple independent exhaustion signals align. Upgrade to “BEARISH CONFIRMED” only after defined price-structure confirmation (for example, support/VWAP loss or lower-low confirmation) plus corroborating flow/volume evidence.
- For a high-severity reversal warning, require at least two independent evidence families where possible (price/momentum, executed flow/CVD, derivatives positioning, liquidity/order book, verified tracked-wallet activity). Avoid counting correlated indicators as independent proof.
- Show bullish evidence and bearish counter-evidence side by side, with each source's freshness and coverage. Explicitly list what would invalidate the bearish warning and what would restore bullish bias.
- Trigger an immediate Telegram/PWA warning when an active bullish plan is materially invalidated or bearish risk crosses the configured threshold. Update the plan and preserve the prior version in the signal journal.

### 16.5 Additional QA fixtures and acceptance gates
- Replay bullish continuation, higher-high/lower-RSI divergence, buy-volume absorption, CVD divergence, failed breakout, VWAP loss, support breakdown/reclaim, OI expansion with stalled price, funding extremes and long-liquidation cascades.
- Verify a spot-only feed never emits a confirmed “whale short” label or displays OI/funding/liquidations as if observed.
- Verify single-indicator false positives do not trigger confirmed reversal; require pivot confirmation, timeframe labels and multi-source corroboration.
- Verify stale/missing derivatives data is shown as unavailable and cannot be interpreted as zero or neutral.
- Verify the live chart does not animate fabricated ticks, blend venues, hide gaps, or display stale data without warning.
- Verify a specified price level produces conditional support/breakdown/reclaim scenarios, not guaranteed forecasts.
- Verify bullish-to-bearish state transitions update Telegram, PWA, live feed and trading-plan invalidation exactly once per material event.
