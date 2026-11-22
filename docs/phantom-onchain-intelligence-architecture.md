# Phantom & On-chain Intelligence — Architecture Decision

Date: 2026-11-22 (Asia/Jakarta)
Status: Approved for staged implementation planning; not implemented.
Tracking issue: https://github.com/rohman35819/radar-ai-v2/issues/47

## Product intent

Add a dedicated **Phantom & On-chain Intelligence** workspace to RADAR AI. Phantom is the wallet identity/connection entry point for Solana; it is not the data provider for all blockchain intelligence. RADAR must combine attributable on-chain RPC/indexer data, DEX market data, and later other chain adapters into one normalized intelligence layer for research, alerts, dashboards and trading analysis.

The existing Exchange Hub remains separate. Phantom connection must not be conflated with exchange API credentials or exchange account identity.

## User experience

A new navigation entry opens a dedicated page and later a dashboard summary widget.

Initial page:
- Phantom availability / install state.
- Connect and disconnect actions.
- Connected public wallet address (shortened, copyable) and explicit network/cluster.
- Clear read-only status and last refresh/source timestamps.
- Empty, denied, locked, unsupported-browser, disconnected, rate-limited and RPC-error states.

Dashboard summary (later stage):
- Connected wallet count and watchlist count.
- SOL/token portfolio snapshot (with valuation source/time).
- Recent wallet activity and whale movements.
- Alert counts and top tracked tokens/pools.
- Source health, data freshness and degraded state.

Do not display fabricated/demo wallet balances as live data. Every metric must show its chain, source and last-updated time.

## Data-source architecture

Use provider adapters behind a normalized server-side contract; avoid coupling the UI to one vendor.

### Solana base data
- Solana JSON-RPC: getBalance, getTokenAccountsByOwner, getSignaturesForAddress, and getTransaction where supported.
- Configure RPC endpoint server-side. A public Solana endpoint may be a best-effort, rate-limited fallback only; do not assume production-grade uptime or unlimited free use.
- Validate base58 public keys and bound address count, page size, response bytes, timeout and refresh frequency.

### Enhanced transaction interpretation
- Add an adapter for a transaction indexing provider only after Division 08 verifies current free-tier quotas, retention, rate limits, commercial/redistribution terms and data provenance.
- Normalize transfers, swaps, fees and token movements; retain raw provider payloads only transiently and only when required for parsing. Do not persist full raw payloads by default.
- Mark labels such as whale, smart wallet, exchange, insider or bot as heuristic/provider-derived, never as verified facts unless the source provides verifiable evidence.

### DEX / market context
- Use DEX market data (initial candidate: GeckoTerminal public API) for pools, token price, liquidity, volume and price changes.
- Join wallet events to token/pool market context using mint address and timestamps, with source attribution.
- DEX market data does not prove wallet ownership, intent, token safety or future performance.

### Extensibility
- Model chain and provider separately (solana, later EVM networks; rpc, indexer, dex_market).
- Add other wallet ecosystems only through separately tested adapters; do not imply Phantom supports every chain or every data category.
- Provider outage must not block other healthy sources.

## Normalized record contract

Every persisted observation should include:
- chain, network, source_provider, source_endpoint_kind
- wallet_address, signature or stable event identifier
- slot / block number, block time and observed_at
- normalized event type and asset identifiers (mint/contract)
- quantity and decimals as exact strings/integers, not floating-point-only values
- market context with quote currency, source and timestamp where available
- fetched_at, source revision/provider version, confidence/quality flags
- deduplication key and provenance/reference

Separate immutable source observations from derived labels/scores/alerts. Derived analytics must be reproducible and carry model/rule version.

## Security and privacy boundaries

- Never ask for, read, transmit, log or store seed phrases or private keys.
- Use the official injected Phantom provider for public wallet address connection only (connect / disconnect); do not request transaction signing in the MVP.
- No swaps, approvals, transfers, staking, signing, transaction simulation that can trigger a wallet prompt, or live trading in the MVP.
- Wallet addresses are public blockchain identifiers but can be sensitive behavioral data. Do not publish a connected address to other users or use it for cross-user profiling without explicit product policy and owner approval.
- Separate connected wallet from manually watched public addresses; show which is which and allow removal.
- Do not put provider API keys in browser code. Keep secrets in server environment and redact logs.
- Enforce server-side validation, rate limits, per-user access control, timeout, pagination caps and request-size limits.
- No financial action or paid service provisioning without explicit BOS approval.

## Storage and operations

- Persistent history, watchlists, alerts and audit records require durable writable storage.
- Existing Hostless readiness is blocked by EROFS; /tmp is ephemeral and is not acceptable for durable tracking, memory or audit.
- Do not activate history persistence until the Hostless storage decision is resolved or an approved durable storage backend is available.
- Start with read-only/manual refresh; bounded polling only after rate-limit and cost behavior is measured.
- Expose source health, last successful fetch, last error code and staleness in the UI.

## Delivery phases and owners

1. **UI shell + Phantom connect** — Divisi 02 lead, Divisi 03 domain support. No backend history yet.
2. **Solana RPC read-only adapter** — Divisi 03 lead, Divisi 01 security review, Divisi 05 tests.
3. **Watchlists + normalized durable event history** — Divisi 03/01/07; gated on durable storage.
4. **Indexer + DEX enrichment + whale/flow alerts** — Divisi 08 source evaluation, Divisi 04 signal logic, Divisi 03 integration, Divisi 05 QA.
5. **Additional chains/providers** — only after Solana MVP has freshness, accuracy, cost and reliability evidence.

Executive Office coordinates work and avoids parallel edits to the same files. Chief Strategy Advisor owns architecture and stage gates.

## Acceptance gates

- Existing dashboard menu, Exchange Hub, API contracts and trading safeguards remain intact.
- Phantom absent, denied, locked, unsupported and disconnected cases do not break RADAR.
- Only public addresses are queried; no signing or secret access.
- Source/chain/network/time/freshness is visible for all material metrics.
- Rate limiting, pagination, timeouts, provider errors, malformed addresses and duplicate events are tested.
- Provider terms and quotas are documented before production use.
- No paid provider or infrastructure is enabled without BOS approval.
- npm test, relevant integration tests, security scan and independent Divisi 01/05 reviews pass.
- GitHub, Hostless Build and verified Live status are reported separately.

## Decision

Proceed with a staged Phantom/Solana read-only integration, then expand through provider adapters. Do not treat Phantom itself as a universal data source: wallet connection is identity/access; blockchain RPC, indexers and DEX data supply the intelligence. Trading actions remain out of scope.
## Verified integration constraints (research, 2026-11-22)

- Phantom's official Solana integration supports direct injected-provider integration through `window.phantom` and connect/disconnect. A connection grants the dApp access to the public address; signing is a separate capability and is excluded from the MVP. Reference: https://docs.phantom.com/solana/integrating-phantom and https://github.com/phantom/docs/blob/master/getting-started-with-solana/establishing-a-connection.md.
- Phantom mobile connection is supported inside the Phantom in-app browser; Phantom's help documentation says ordinary mobile browsers such as Chrome/Safari do not support connecting this way. The UI must detect and explain this, and provide instructions to open the RADAR URL from Phantom's in-app browser. Reference: https://help.phantom.com/articles/how-to-connect-to-dapps-using-phantom-wallet-29995498642195.
- Solana public RPC is shared, rate-limited infrastructure and is explicitly not intended for production applications; HTTP JSON-RPC supports the required read methods such as getBalance, getTokenAccountsByOwner, getSignaturesForAddress and getTransaction. Treat public RPC as development/fallback only, not a reliability promise. References: https://solana.com/docs/rpc and https://solana.com/docs/rpc/http.
- GeckoTerminal Public API is beta and cached at approximately one minute; its official API docs currently describe an approximate 10 calls/minute limit that may fluctuate. A support article mentions 30 calls/minute. Use the stricter ~10 calls/minute as the planning ceiling until the live terms are reconciled. References: https://api.geckoterminal.com/docs/index.html and https://support.coingecko.com/articles/6867086195-does-geckoterminal-have-an-api.
- Do not bundle a Phantom SDK or add dependencies until the browser target, mobile in-app-browser behavior, and bundle/runtime compatibility are tested. A no-dependency direct provider integration is a viable first-stage candidate.