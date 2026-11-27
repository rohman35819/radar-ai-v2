# Internal ExchangeGateway — Phase E1/E2/E3 (27 November 2026)

**Owner:** BOS · **Lead:** Grok (primary Quantum executor) · **Status:** implemented in `feat/exchange-gateway`; no production caller, no deployment, no live order.
**Authority:** BOS P0 WIP exception for Exchange Gateway (issue #154 comment 2026-11-27T07:43Z). Normal non-draft WIP toward `develop` was 4; this PR is the documented exception. PR #159 validation exception remains separately tracked.

## 1. What changed

- `lib/exchange-gateway.js` — narrow, frozen, in-process gateway factory wrapping only allowlisted read methods of the existing `createExchangeService()`:
  - `status()` — boolean configuration only.
  - `getMarketObservation(exchange, symbol)` — public ticker read, normalized into a versioned observation with provenance and checksum.
  - `getAccountSnapshot(exchange)` and `getPermissionStatus(exchange)` — read-only account/permission normalization, **risk-engine role only**.
  - Unauthorized roles denied; quantum-research role cannot read private account data; system-health role cannot read market or account data.
  - No `order`, `placeOrder`, `cancelOrder`, `transfer`, `withdraw`, `setLeverage`, `setMargin` or arbitrary signing method exists. Object keys are frozen and asserted in tests.
  - Upstream errors become `GatewayError` codes only; raw messages/secrets never propagate.
- `src/exchange/observation.mts` — `market-observation.v1` contract with `source`, `symbol`, `interval`, `observed_at`, `received_at`, `is_complete`, `freshness`, `provenance_ref`, `checksum`, `payload`; runtime guards reject malformed, stale, incomplete, duplicate-shaped or secret-bearing observations, and forbid private account keys in payload.
- `test/exchange-gateway.test.js` — 8 tests covering role denial, capability allowlist, no human token requirement, no order path, secret redaction (including bare secrets and compound keys), invalid venues/symbols, incomplete payloads, stale/malformed `checked_at`, partial futures reads, checksum binding and error sanitization.

## 2. Boundaries preserved

- **Dashboard/human route unchanged:** `GET /api/exchanges/:exchange/account` still requires `x-exchange-access-token`. Existing tests prove 401 without it; this branch does not modify `server.js`.
- **No HTTP bypass:** the gateway is dependency-injected in-process; no public unauthenticated internal route was added.
- **No token in Python/agents/CLI:** factory signature has no token parameter. `EXCHANGE_ACCESS_TOKEN` is never passed to the gateway, Python research, fixtures or artifacts.
- **Secrets stay server-side:** Binance key/secret remain inside `createExchangeService` environment; outputs and errors are scrubbed and asserted free of secret material.
- **Research input is market-only:** private balances/positions are never part of `market-observation.v1`; account snapshots go only to the risk-engine role.
- Read-only exchange permissions unchanged; no trading, withdrawal, transfer, leverage or margin mutation.

## 3. Verification

- `npm test`: **249 pass, 0 fail** (241 baseline + 8 gateway tests), including all existing exchange-route authorization tests.
- Two zero-cost independent reviewers were used: Nemotron 3.5 Lightning Free found no material issue; Flint 40B Free found a real P1 and several P2 gaps, all fixed before PR: unparseable `checked_at` no longer fails open; futures `null` no longer counts as complete; checksum now binds payload **and** timestamps; forbidden-key matching is segment-aware in both JS and TS; bare secrets are redacted; Bybit `contract_trading` and `transfers` are mapped correctly. Regression tests were added for every fixed gap.
- Strict `tsc --noEmit`: exit 0.
- `git diff --check`: clean; secret scan on added lines found only intentional synthetic test strings.
- Exact-head CI/security: to be recorded on the PR after push; no claim before inspection.

## 4. E3 — observation → quant research input

- `src/quant/market-observation-input.mts` is the **single entry point** from `market-observation.v1` into research. It emits `market-observation-input.v1` with source, symbol, interval, observed_at, received_at, accepted_at, provenance_ref, checksum, `kind='market_ticker'`, `is_ohlcv=false`, normalized public payload and limitations.
- Freshness is fail-closed with injectable `now`: malformed/no-timezone timestamps, future timestamps, reversed timestamp order, age above an explicit `maxAgeMs`, `freshness=unknown|stale`, and `is_complete=false` are all rejected with stable `QuantInputError` codes. `received_at` is never rewritten to make stale data look fresh.
- Symbol allowlist is explicit: **BTCUSDT and ETHUSDT only**, because those are the symbols actually used by registries v1–v5. SOL and other assets are not admitted merely because the gateway can fetch a ticker. Normalization is uppercase in gateway, TypeScript adapter and Python registries.
- Payload secret/private-account keys and values are rejected independently of the gateway; provenance/checksum must be 64-hex and equal. Strategies never receive gateway access or account snapshots.
- **Ticker is not OHLCV:** output is explicitly `market_ticker` with `is_ohlcv=false`; no candle object, no `open/high/low/close` candle fields, no Python backtest import. The existing Python OHLCV pipeline is untouched and historical reports unchanged.
- Regression tests (`test/quant-market-input.test.js`, 9 cases) cover acceptance, stale/future/malformed/unknown/stale/incomplete rejection, symbol allowlist/format, provenance/checksum, secret/private payload, ticker-not-candle, no order path, and stale-data non-mutation.

## 5. Command 08 — allowlist closure and deterministic shadow consumer

- **Allowlist closure:** `QuantInputOptions.allowedSymbols` was removed. `RESEARCH_ALLOWED_SYMBOLS` is now a fixed frozen boundary of `BTCUSDT` and `ETHUSDT`; a caller cannot extend or replace it. A regression test attempts `allowedSymbols: ['SOLUSDT']` and confirms the symbol is still rejected. Normalization (uppercase) was rechecked against registries v1–v5, which use only those two symbols.
- **Shadow consumer:** `src/quant/market-observation-shadow.mts` accepts only `market-observation-input.v1` and emits `market-observation-shadow.v1` with `decision='OBSERVE_ONLY'`. It revalidates schema version, symbol allowlist, provenance/checksum, injected `now`, future/stale/malformed timestamps, secret/private payload fields, and duplicate provenance via a deterministic `shadowDedupeKey`. Every rejection has a stable `ShadowInputError` code. No fetch, gateway, ledger, reconciliation, order, transfer, withdrawal, worker or storage path exists. Receipts contain identity/provenance and sanitized field names only — no price values, fills, TP/SL or profit claim.
- Tests: `test/quant-market-shadow.test.js` 9 cases; `npm test` **267/267**, Python **25/25**, strict TypeScript (cached pinned compiler) exit 0.

## 6. E4 — Hostless status (verified 2026-11-27T09:30:49Z)

Public sanitized probes returned HTTP 200:
- `GET /api/exchanges/status` → `status=success`, `binance.configured=true`, `mode=read-only`, products `spot` and `usd-m-futures`; `bybit.configured=false`; `access_configured=true`.
- `GET /api/ready` → `status=ready`, `storage.status=ok`, `code=null`.

No credential value, balance, position, private account payload or raw provider response was requested, displayed or stored. Configuration presence is **not** proof of a successful account connection; no private account read was performed.

## 7. AI Divisi 01 review and fixes

A separate read-only AI-assisted Divisi 01 review (not human sign-off) found one P1 and one P2 plus hardening items. All were fixed before the final head: the lossy replacer-array canonicalization was replaced by recursive key-sorted canonical JSON; gateway and TypeScript now compute the same SHA-256 digest; the adapter verifies the observation digest and re-signs its sanitized research input; the shadow consumer re-verifies that input digest. Payload mutation now changes the checksum, arbitrary 64-hex strings are rejected, and forged-checksum replay is rejected before dedupe. Caller-supplied `allowedSymbols` was removed, `maxAgeMs` capped at 24h (producer and consumers), Bybit UID labels filtered, gateway `scrub()` bounded by depth/keys/size with a per-branch cycle guard, and both spot and futures legs are required downstream. Tests were added for each fix, including gateway↔TypeScript digest parity and confirmation that changing harmless metadata does not change the replay key.

**Residual threat-model note:** the digest is an unkeyed SHA-256 consistency check. It guarantees integrity only while the internal ExchangeGateway remains the sole trusted producer. An actor able to edit an observation and recompute a digest can re-sign arbitrary content; it cannot escalate to orders, ledger or fund movement because no such path exists. If a malicious producer or tampering transport enters the threat model, an HMAC with a server-side key and durable replay state are required before relying on this provenance. Human Divisi 01 sign-off remains pending.

## 8. Limitations / blockers

- Gateway/adapter have no production caller; this is not an active autonomous worker.
- OHLCV/M5 candles remain a separate data pipeline (DeepSeek M5 branch); this gateway supplies 24h ticker observations only.
- Manual Divisi 01 security review not yet performed; self-review, two free-model reviews, exact-head CI and sanitized public status are the current evidence.
- `npm run typecheck` cannot resolve `tsc` via `npx` in this Termux session; the pinned TypeScript 5.9.3 compiler was executed directly from the local cache with exit 0, and CI runs the same pinned version.
- **Agent Platform readiness:** the shadow consumer is a valid observe-only boundary test, but it is not autonomous operation. Durable queue/state, worker runtime, permissions, approval gates, budgets, audit persistence and kill switch remain unimplemented/inactive (PR #153 foundation still open). Do not feed it to a scheduler or claim offline operation.

## 5. Next steps

1. Verify exact-head CI/security on the PR.
2. E3 extension: connect normalized market observations into the quant input schema with a versioned TS contract and fail-closed freshness gate (no private values).
3. E4: when Hostless access is available, check sanitized `/api/exchanges/status` only; never request credentials or account payloads in chat.
4. Keep worker, queue, paper ledger, live trading and withdrawal OFF; Rp0.
