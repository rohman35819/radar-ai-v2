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
