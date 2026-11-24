# RADAR AI V2 — Procurement Registry & Macro Data Shortlist
Tanggal verifikasi: 24 November 2026 (Asia/Jakarta)
Lead: Division 08 — Procurement & Tools
Supporting: Division 04 (macro/news), Division 03 (trading semantics), Division 01 (security/compliance), Division 05 (QA)

## Tujuan
Registry ini mencegah riset dan integrasi berulang. Status akses, hak penggunaan, dan integrasi produksi dicatat terpisah. Tidak ada akun, API key, kartu, pembayaran, atau perubahan Hostless yang dilakukan.

## Shortlist makro gratis

| Kandidat | Akses & biaya | Batas/risiko | Nilai RADAR | Keputusan |
|---|---|---|---|---|
| U.S. Treasury Fiscal Data API | Gratis; tanpa akun, registrasi, token, atau API key. GET JSON/CSV/XML. | Default page 100; pagination dan update cadence per dataset. Bukan real-time. Attribution; jangan imply endorsement. | Debt, cash balance, interest rates, Treasury FX rates, receipts/outlays. | Layak untuk adapter internal |
| World Bank Indicators API v2 | Gratis; API key dan login tidak diperlukan. | Frekuensi rendah; per-dataset license wajib dicek karena tidak semua CC BY. Simpan period/release date untuk hindari look-ahead bias. | Global growth, inflation, reserves, current account, unemployment, energy/import context. | Layak dengan license metadata gate |
| OECD Data Explorer SDMX API | Gratis; registrasi sukarela. | 60 data downloads/hour; di atas limit dapat diblok sementara. Dataset pihak ketiga bisa punya batasan. Cache dan konsolidasikan query. | Leading indicators, industrial production, inflation, trade, labor, credit. | Layak dengan throttle konservatif |
| ECB SDMX 2.1 REST API | Statistik publik tanpa API key. | Reuse gratis dengan atribusi; statistik/metadata tidak boleh diubah; third-party data dikecualikan tanpa izin; kontinuitas tidak dijamin. | EUR reference FX, yield curves, policy/market rates, monetary statistics. | Layak untuk konteks EUR/global liquidity |
| GDELT Project DOC/GEO/TV + bulk data | Project menyatakan dataset gratis untuk penggunaan komersial/non-komersial; redistribusi dengan citation dan link. | DOC/Context endpoints rate-limit; gunakan minimal 5 detik antar-request, bounded results, backoff 429, cache. Publisher article/media rights tetap milik publisher. | News/event discovery: regulation, ETF, exchange, exploit, macro/geopolitics. | Layak untuk metadata discovery; perlu probe |
| GDELT Cloud (gdeltcloud.com) | Layanan berbeda dari GDELT Project; Free plan hanya personal evaluation. | Free plan bukan untuk produksi dan bukan untuk customer display. | Generated stories/summaries siap pakai tetapi tidak cocok dengan batas biaya RADAR. | Tolak untuk produksi gratis |

## Bukti sumber resmi

1. Treasury API docs: https://fiscaldata.treasury.gov/api-documentation/
   - API terbuka tanpa user account/token registration.
   - Data gratis dan dapat dicopy, diadaptasi, didistribusikan, serta digunakan komersial/non-komersial.
   - Metadata dataset menentukan frekuensi update; API menyediakan metadata, pagination, field types, links.
   - Terms: https://treasurydirect.gov/legal-information/developers/web-api-terms/

2. World Bank Indicators API v2: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
   - V2 menggantikan V1; API keys dan autentikasi tidak diperlukan.
   - License policy: https://datacatalog.worldbank.org/public-licenses
   - Default dataset produksi World Bank adalah CC BY 4.0, termasuk penggunaan komersial dengan atribusi; dataset tertentu bisa punya lisensi lain dan wajib diperiksa dari metadata.

3. OECD Data Explorer API: https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html
   - API gratis dan berbasis SDMX.
   - Rate limits/best practices: https://www.oecd.org/en/data/insights/data-explainers/2024/11/Api-best-practices-and-recommendations.html
   - Limit saat verifikasi: 60 data downloads/hour. OECD merekomendasikan contentconstraint checks dan caching.
   - Terms: https://www.oecd.org/en/about/terms-conditions.html
   - Data dapat digunakan komersial dan didistribusikan dengan atribusi kecuali ada restriction/third-party rights di metadata.

4. ECB SDMX REST: https://data.ecb.europa.eu/help/getting-data-web-services-sdmx-0
   - SDMX 2.1 REST menyediakan retrieval data dan metadata discovery.
   - Reuse policy: https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html
   - Public ESCB statistics gratis untuk reuse; kutip sumber, jangan modifikasi statistik/metadata, third-party data memerlukan izin.

5. GDELT Project: https://gdeltproject.org/data.html dan https://gdeltproject.org/about.html
   - Project menyatakan dataset gratis/open dan penggunaan komersial tanpa biaya; redistribusi wajib mencantumkan citation dan link GDELT Project.
   - DOC API guide: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
   - Operasional: throttle minimal 5 detik antar-request, bounded query, check Content-Type, backoff 429. Jangan menyimpan/menayangkan full article text tanpa memeriksa hak publisher.

6. GDELT Cloud (layanan berbeda): https://gdeltcloud.com/acceptable-use
   - Free plan hanya untuk personal evaluation; bukan produksi dan bukan customer display.

## Existing integrations — deduplication snapshot

| Provider / component | Evidence in current main | Cost / credential status | Follow-up |
|---|---|---|---|
| Binance USDⓈ-M Futures public market data | lib/derivatives.js; live monitor BTCUSDT probe | Public market endpoints; no user secret for probe. Rate limits per endpoint/IP. | Read-only; label venue/instrument/timeframe and provider timestamps. |
| CoinGecko Demo / Onchain + GeckoTerminal | lib/market-intelligence.js, lib/sources.js, lib/onchain.js | Demo key configured in live; quota and commercial display rights constrain use. | Keep internal; no public redistribution before terms approval. |
| DeFiLlama | lib/sources.js | Free endpoints available; terms restrict commercial republishing/use. | Compliance review before external display. |
| DEX Screener | lib/dexscreener.js; live monitor probe | Public API no key; direct-competition restriction is material. | Controlled validation only; no production-facing expansion without permission/legal review. |
| GoPlus | lib/goplus.js | Credentials not configured in latest live probe; monitor intentionally does not consume quota. | Optional; confirm quota and rights before activation. |
| Solscan | lib/solscan.js | API key server-side; plan/CU usage depends on Hostless environment/account. | Audit actual quota and endpoint plan access; no secret sharing. |
| RSS TechCrunch + Cointelegraph | lib/sources.js | Public RSS, no key; publisher rights apply. | Keep title, source URL, publisher and timestamp; avoid republishing article bodies. |

## Procurement rules
- Search this registry by provider + product + endpoint before new research.
- Record exact endpoint/dataset, not only brand name.
- Each observation preserves source, retrieved_at, provider_updated_at/record_date, period, unit, timezone and freshness.
- Macro series are context/regime features, not intraday triggers. Use publication/availability date in backtests.
- Missing, revised, delayed or conflicting values remain visible; never silently convert null to zero.
- Apply provider-specific throttles, cache TTL, bounded page size, timeout, response-size cap and retry/backoff.
- No new provider enters production until license/terms, schema, live probe, security review, QA and rollback are complete.
- No paid service, card or paid plan without BOS approval.

## Recommended acquisition order
1. Treasury Fiscal Data — strongest immediate macro addition: no key, free commercial reuse, structured API, debt/interest/FX data.
2. World Bank Indicators v2 — global macro regime; no key; default CC BY with per-dataset verification.
3. ECB SDMX — official EUR/yield/money data; attribution and no-modification constraint.
4. OECD Data Explorer — useful leading indicators, strict 60/hour cap; cache-first.
5. GDELT Project — high-value news/event discovery; distinguish from GDELT Cloud and throttle conservatively.

## Handoff
- Division 04: select exact Treasury, World Bank, ECB and OECD series; define normalized schema and publication-date semantics.
- Division 03: define how macro indicators are displayed beside derivatives/market structure; do not turn slow series into entry signals.
- Division 01: review endpoint allowlists, SSRF, response size, timeouts, cache, attribution and provider rights.
- Division 05: fixtures for delayed/revised/missing observations and exact-head QA.
- Division 06: scheduler/queue only after procurement registry and worker permissions are defined.
- No new source was integrated or deployed in this registry update.
