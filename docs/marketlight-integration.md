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
- Response shape is checked against the provider's published developer documentation and deterministic fixtures. The public JSON endpoints could not be independently fetched through the browsing probe, so actual provider response semantics/freshness still require runtime validation after an approved deployment.
- This PR does not yet expand Binance endpoints; the existing Binance Futures adapter remains unchanged.

## Verification status
- GitHub Actions exact head `ed20d134cf9c18e133c6e077cc95225ad29fdb12`: test run #786 / ID `45216629631` success — 143 passed, 0 failed, 0 skipped.
- Security run #786 / ID `45216629543` success: Gitleaks no leaks; Trivy secret scan no findings. Trivy vulnerability scanner did not run because zero supported language-specific files were found, so dependency CVE coverage is unavailable.
- `package.json` checks syntax for both Marketlight modules; PWA shell advanced to `radar-shell-v13` and precaches `/marketlight.js`.
- Hostless Build and Live: not checked; no deployment claim.
- Independent Division 01 security review and Division 05 QA remain required before merge/release.
