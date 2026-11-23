# Marketlight integration — 23 November 2026

## Scope
- Added a read-only, no-login backend adapter at `lib/marketlight.js`.
- Exposed `GET /api/market-intelligence/marketlight?base=BTC&hours=24`.
- Added a Cross-Exchange Derivatives panel to `/market.html`.
- Data is requested only after the user presses **Muat data**; no automatic polling of all 24 assets.
- Supported base assets are an explicit allowlist of 24 coins. Liquidation windows are restricted to 1, 4, 12, or 24 hours.

## Provider contract
- Official docs: https://marketlight.ai/developers
- Public GET JSON; no account, API key, or payment method.
- CC BY 4.0, including commercial use, with visible attribution/link: https://marketlight.ai
- Derivatives OI/funding and Fear & Greed cache for 5 minutes; liquidation summary caches for 60 seconds.
- Adapter applies an 8-second timeout, redirect rejection, 1 MiB response limit, schema/numeric validation, shared cache, in-flight deduplication, and a 20-second global batch cooldown. The provider asks clients to keep requests to a few per minute.
- Data remains an aggregated corroboration source, not independent ground truth. Funding intervals remain exchange-specific and are not silently normalized or averaged.

## Files
- `lib/marketlight.js`: source adapter, validation, cache, cooldown and provenance.
- `server.js`: bounded read-only endpoint and per-IP request limit.
- `public/market.html`, `public/marketlight.js`: dashboard panel and explicit manual refresh.
- `test/marketlight.test.js`: fixture coverage for success, cache, invalid parameters, partial/malformed data, cooldown and response-size bounds.

## Safety and limitations
- No exchange credentials, trading permissions, API keys, Hostless variables, login, card, order, wallet signing, or withdrawal behavior is involved.
- The UI does not produce buy/sell signals or identify wallets/whales.
- Provider API live response and exact field schema are checked against its published developer documentation; end-to-end production behavior still requires CI and Hostless verification.
- This PR does not yet expand Binance endpoints; the existing Binance Futures adapter remains unchanged.

## Verification status
- GitHub Actions: pending for the final PR head until the workflow reports a result.
- Local `npm test`: not run in this connector-only session.
- Hostless Build and Live: not checked; no deployment claim.
- Independent Division 01 security review and Division 05 QA remain required before merge/release.
