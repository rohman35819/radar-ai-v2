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
- Adapter applies an 8-second timeout, redirect rejection, a streaming 1 MiB byte cap (cancels the reader immediately when exceeded), schema/numeric/timestamp validation, shared cache, in-flight deduplication, and a 20-second global batch cooldown. The provider asks clients to keep requests to a few per minute.
- Data remains an aggregated corroboration source, not independent ground truth. Funding intervals remain exchange-specific and are not silently normalized or averaged. Global liquidation totals are explicitly labeled as global rather than as the selected asset's liquidations. The UI separates retrieval time from each feed's provider observation timestamp.

## Files
- `lib/marketlight.js`: source adapter, validation, cache, cooldown and provenance.
- `server.js`: bounded read-only endpoint and per-IP request limit.
- `public/market.html`, `public/marketlight.js`: dashboard panel and explicit manual refresh.
- `test/marketlight.test.js`: fixture coverage for success, cache, invalid parameters, partial/malformed data, cooldown, source-vs-retrieval timestamps, streaming response-size bounds, and reader cancellation.

## Safety and limitations
- No exchange credentials, trading permissions, API keys, Hostless variables, login, card, order, wallet signing, or withdrawal behavior is involved.
- The UI does not produce buy/sell signals or identify wallets/whales.
- Response shape is checked against the provider's published developer documentation and deterministic fixtures. The public JSON endpoints could not be independently fetched through the browsing probe, so actual provider response semantics/freshness still require runtime validation after an approved deployment.
- This PR does not yet expand Binance endpoints; the existing Binance Futures adapter remains unchanged.

## Verification status
- GitHub Actions exact head `ed20d134cf9c18e133c6e077cc95225ad29fdb12`: test run #786 / ID `45216629631` success — 143 passed, 0 failed, 0 skipped.
- Security run #335 / ID `45223502740` on code head `d55edc4e3555506bf4abbf3b4eb96ad269d88aa4`: Gitleaks no leaks; Trivy secret scan no findings. Trivy vulnerability scanner did not run because zero supported language-specific files were found, so dependency CVE coverage is unavailable.
- `package.json` checks syntax for both Marketlight modules; PWA shell advanced to `radar-shell-v13` and precaches `/marketlight.js`.
- Hostless Build and Live: not checked; no deployment claim.
- Procurement review from Division 08 is conditional; independent Division 01 security review, Division 05 QA, and Division 03 provider-semantic validation remain required before merge/release.
