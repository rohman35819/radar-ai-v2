# Division 08 — Audit Sumber Data Gratis & Legal untuk RADAR AI V2
Tanggal verifikasi: 23 November 2026 (Asia/Jakarta)
Lead: Division 08 — Procurement & Tools
Supporting: Division 03 (market/exchange semantics), Division 04 (AI/news/macro), Division 01 (security/reliability), Division 05 (independent QA)

## Tujuan dan batas
Inventarisasi sumber data publik tanpa login/kartu kredit, dengan prioritas trading crypto dan makro. Endpoint publik tidak otomatis memberi hak komersial, redistribusi, AI, atau caching. Status membedakan akses teknis dari hak penggunaan. Pemeriksaan memakai dokumentasi/sumber publik; tidak ada akun baru, kartu, paket berbayar, secret, atau environment Hostless yang diubah.

## Ringkasan keputusan

| Sumber | Login/API key | Biaya/limit terverifikasi | Hak penggunaan | Status RADAR |
|---|---|---|---|---|
| Binance Spot/Futures public market data | Tidak perlu untuk public market endpoints | Rate limit berbasis request weight/IP | Dokumentasi resmi mengonfirmasi endpoint market-data-only tanpa auth; hak redistribusi/AI komersial belum diselesaikan dalam audit ini | Gunakan untuk analisis internal per-exchange; jangan resale/redistribute |
| BLS Public Data API v1 | Tidak perlu | 25 query/hari; beberapa series dapat dibatch | Tidak mengontrol end-use; wajib retrieval date dan disclaimer analisis pasca-unduh | Layak; disiapkan di PR #65 |
| New York Fed Markets API | Tidak perlu | Ikuti dokumentasi; gunakan cache/frekuensi wajar | Automated access, download/store/use/copy/distribute/derivative works untuk personal/business dengan attribution + disclaimer | Layak; disiapkan di PR #65 |
| U.S. Treasury Fiscal Data API | Tidak perlu akun/token | Open API; filter/pagination | Gratis tanpa pembatasan untuk copy/adapt/redistribute, komersial/non-komersial; jangan menyiratkan endorsement | Layak untuk adapter makro |
| World Bank Indicators API v2 | Tidak perlu API key/login | Hampir 16.000 indikator; kuota tetap tidak dinyatakan di docs yang ditinjau | Default dataset World Bank CC BY 4.0 termasuk komersial dengan atribusi; dataset pihak ketiga bisa berbeda | Layak untuk macro-regime historis; periksa metadata per indikator |
| ECB Data Portal SDMX API | Tidak perlu akun untuk public REST data | API SDMX 2.1; batas teknis mengikuti layanan | Statistik publik ECB/ESCB gratis untuk reuse komersial/non-komersial dengan atribusi; jangan mengubah statistik/metadata; third-party data dikecualikan tanpa izin | Layak untuk EUR rates, FX, yield curves, monetary/financial statistics; filter metadata/source |
| OECD Data Explorer API | Tidak perlu akun wajib; registrasi sukarela | API gratis; rate limiting berlaku, angka tetap tidak dipublikasikan pada halaman yang ditinjau | Terms mengizinkan extract/download/copy/adapt/distribute/share/embed untuk tujuan apa pun termasuk komersial, kecuali dataset/indikator pihak ketiga atau metadata dengan pembatasan | Layak untuk macro regime & leading indicators; periksa metadata |
| IMF Data API / statistical datasets | Beberapa akses API memakai beta portal account | API SDMX tersedia, akses/portal dapat memerlukan account | IMF meminta izin untuk potensi commercial reuse; melarang bulk automated download tanpa izin dan penggunaan konten untuk training LLM tanpa izin | HOLD; jangan gunakan untuk RADAR tanpa izin tertulis |
| GDELT Project DOC API/data files | Tidak perlu akun/API key | DOC API perlu throttle; jeda minimal 5 detik; raw files periodik | Unlimited/unrestricted academic, commercial, governmental use tanpa biaya; redistribusi dengan citation + link GDELT; hak artikel asli tetap milik publisher | Layak untuk news/event discovery + tone metadata; jangan salin isi artikel |
| SEC EDGAR data.sec.gov + RSS | Tidak perlu API key | Maksimum 10 req/detik; efisien dan bot harus teridentifikasi | SEC FAQ menyatakan government-created content dan public EDGAR filing content bebas diakses dan digunakan ulang; pengecualian sangat terbatas (mis. stock art). User-Agent harus mencantumkan identitas dan email kontak valid | Layak untuk filing catalyst setelah email kontak proyek ditetapkan |
| Solana public RPC | Tidak perlu login/API key | Shared endpoint, 429/403, no SLA | Dokumentasi Solana menyatakan public RPC bukan untuk aplikasi produksi | Dev/fallback ringan saja, bukan produksi/whale history |
| GoPlus Security API | API gratis; credential bergantung endpoint | Support menyebut 30 calls/menit untuk API gratis | Hak redistribusi/AI display belum dibuktikan tuntas | Lanjutkan endpoint yang direview; jangan expose raw API |
| GeckoTerminal public API | Tidak perlu key untuk public beta | API docs sekitar 10 calls/menit; support article 30 calls/menit; gunakan 10/min | API Terms berlaku; hak komersial belum dikonfirmasi | Owner-internal saja sampai public display rights dikonfirmasi |
| CoinGecko Demo API | Memerlukan Demo key | Kuota plan Demo; satu key dipakai bersama modul CoinGecko | Demo/free keyless tidak memberi commercial rights; paid plan memberi commercial display, redistribusi perlu custom rights | Batasi personal/internal; jangan jadikan feed publik/redistributable |
| DeFiLlama free API | Tidak perlu key untuk free endpoints | Free endpoints no-key; Pro berbayar | Terms membatasi personal/non-commercial; melarang republish, mirror, resale, competitive use dan commercial scraping tanpa izin tertulis | Compliance review integrasi existing; jangan perluas redistribusi |
| DEX Screener API | Tidak perlu key | Limit bergantung endpoint | Terms melarang membangun/meningkatkan/memasarkan produk yang bersaing langsung dan melarang penyediaan API ke pihak ketiga | BLOCK scanner RADAR tanpa izin tertulis; PR #60 jangan merge/deploy |
| CoinPaprika keyless | Tidak perlu key | 20.000 calls/bulan, 10 req/detik; refresh hingga 10 menit | Keyless hanya personal use; bukan commercial product/aggregator; raw redistribution dilarang | Tolak untuk produk RADAR |
| OKX public market endpoints | Tidak perlu API key untuk endpoint tertentu | Rate limit endpoint | API Agreement melarang penggunaan data untuk competing aggregator/analytics dan AI komersial/third-party; public endpoints tetap tunduk | Tolak untuk RADAR |
| Kraken public market endpoints | Tidak perlu akun untuk public data | Limit endpoint berlaku | Pricing data adalah Our Content; penggunaan selain approved purposes memerlukan izin sebelumnya | Tunda sampai izin market-data diperoleh |
| CoinMarketCap Keyless Public API | Tidak perlu key untuk subset endpoint | IP-based pool; subset routes; docs menyebut prototype/testing | Hak produksi/komersial dan redistribusi belum dikonfirmasi dari akses keyless | Prototype/shape test saja; jangan production |
| Honeypot.is API | Saat ini tidak butuh API key | Limit/premium dapat berubah | Terms melarang menyediakan bagian API/functionalities kepada pihak ketiga | Jangan tampilkan raw API ke pengguna; perlu izin khusus |
| FRED API | Key sudah ada di Hostless menurut laporan BOS | API key tidak memberi hak atas semua seri | Master section 70 mencatat larangan AI/software, cache/storage dan hak seri pihak ketiga; perlu izin tertulis eksplisit | BLOCK; jangan panggil API |

## Sumber paling bernilai untuk penambahan RADAR

### 1. GDELT Project — news catalyst global
- Official: https://www.gdeltproject.org/
- Data/API guide: https://www.gdeltproject.org/data.html
- DOC API guide: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- Hak penggunaan: unlimited/unrestricted academic, commercial, governmental use tanpa biaya; attribution + link wajib untuk penggunaan/redistribusi.
- No login, no API key, no card.
- Rekomendasi: discovery berita BTC, ETH, crypto, ETF, SEC, exchange, stablecoin, exploit, hack, regulation, macro. Simpan publisher URL, title, domain, published/seen timestamp, query time dan metadata tone/event jika tersedia.
- Throttle DOC API minimal 5 detik antar-request, bounded result, refresh konservatif. Utamakan metadata/event, bukan download isi artikel.
- Caution: tone/event adalah sinyal discovery, bukan fakta terkonfirmasi. Isi artikel/gambar tetap milik publisher dan tunduk pada hak publisher.

### 2. U.S. Treasury Fiscal Data — macro/interest/debt/FX
- Docs: https://fiscaldata.treasury.gov/api-documentation/
- Terms: https://www.treasurydirect.gov/legal-information/developers/web-api-terms/
- No login, API key, atau card.
- Docs mengizinkan penggunaan gratis, copy, adapt, redistribusi dan komersial/non-komersial. Cantumkan sumber; jangan menyiratkan endorsement Treasury.
- Kandidat dataset: average interest rates on Treasury securities, rates of exchange, public debt, Treasury cash balance, receipts/outlays, auction data bila dataset API resmi tersedia.
- Data bulanan/periodik tergantung dataset; jangan beri label real-time. Pilih dataset/field satu per satu, simpan record_date.

### 3. World Bank Indicators API — global macro regime
- API docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation
- License: https://datacatalog.worldbank.org/public-licenses
- No API key/login.
- Kandidat indikator: GDP growth, CPI inflation, unemployment, current account, reserves, broad money, trade, energy/import exposure.
- Cocok untuk historical/slow regime, bukan intraday. Hanya gunakan dataset dengan metadata CC BY 4.0 atau lisensi kompatibel. Simpan periode dan source metadata. Backtest wajib memakai publication/availability date untuk menghindari look-ahead bias.

### 4. BLS + New York Fed — primary US macro
- BLS: https://www.bls.gov/developers/ dan https://www.bls.gov/developers/termsOfService.htm
- NY Fed: https://markets.newyorkfed.org/static/docs/markets-api.html dan https://www.newyorkfed.org/privacy/termsofuse.html
- PR #65 menyiapkan BLS CPI, unemployment, payroll, hourly earnings; NY Fed SOFR/EFFR. PR #65 belum merged dan masih menunggu review independen serta readiness Hostless.

### 5. ECB + OECD — monetary and macro cross-check
- ECB SDMX API: https://data.ecb.europa.eu/help/getting-data-web-services-sdmx-0
- ECB reuse policy: https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html
- OECD API: https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html
- OECD terms: https://www.oecd.org/en/about/terms-conditions.html
- No API key or mandatory login for public endpoints; OECD API registration is voluntary.
- ECB permits free reuse of publicly released statistics for commercial/non-commercial purposes when source is quoted; do not modify statistics/metadata; third-party data requires originator permission. Useful fields include EUR reference FX rates, euro-area yield curves, policy/market rates and monetary statistics.
- OECD API is free; Terms permit extraction, download, copying, adaptation, distribution and embedding for any purpose including commercial use, unless dataset metadata or third-party ownership imposes restrictions. Useful macro/leading indicators, but lower frequency than market data.
- Both are macro-regime/context feeds, not intraday entry triggers. Preserve release/observation dates, source metadata and revisions.

### 6. SEC EDGAR — company/regulatory catalysts
- Docs: https://www.sec.gov/about/developer-resources
- No API key untuk data.sec.gov submissions/XBRL endpoints dan RSS.
- Fair access: max 10 req/sec total; efisien; identifikasi client dan jangan jalankan unclassified crawler.
- Use: filings issuer relevan untuk exchange, miner, ETF sponsor, stablecoin dan material disclosures. Simpan metadata filing, accession number, filed date, accepted timestamp, original URL. Jangan anggap dokumen issuer otomatis menjadi public-domain data.
- Sebelum implementasi: konfirmasi User-Agent/contact requirement, field coverage, source ownership dan retention.

### Excluded/held sources
- IMF: official copyright terms allow special treatment for published statistical Data, but request written permission for potential commercial reuse; prohibit systematic automated downloading without explicit permission and LLM training without permission. Do not add to RADAR unless permission is obtained.
- FAOSTAT: API documentation includes authenticated login; its database terms prohibit use of datasets to promote a commercial enterprise/product/service. Not suitable for RADAR commercial product.

## Existing integrations dan compliance actions

1. CoinGecko sudah ada di lib/market-intelligence.js dan lib/sources.js; Demo key hanya server-side. Free Demo tidak memberi commercial rights. Batasi pada analisis pribadi/internal BOS kecuali lisensi komersial diperoleh; jangan expose raw reusable data endpoint.
2. DeFiLlama sudah ada di lib/sources.js (protocols, fees, revenue). Free API no-key, tetapi Terms membatasi commercial use/republishing. Flag dashboard display untuk review Divisi 01/04; jangan perluas customer-facing delivery tanpa izin.
3. GeckoTerminal pool discovery saat ini memakai CoinGecko on-chain API melalui lib/onchain.js. Terapkan 10 calls/min sebagai batas konservatif karena docs/support berbeda. Jangan perluas public/commercial display sebelum hak API dikonfirmasi.
4. DEX Screener PR #60 masih open/draft. Direct-competition restriction material karena RADAR memiliki scanner/analytics. Jangan merge/deploy tanpa izin tertulis atau scope yang ditinjau ulang.
5. Binance Futures public market data sudah ada di lib/derivatives.js dan digunakan PR #66. Tetap read-only; simpan venue, instrument type dan timestamps.
6. Solscan server-side API key integration ada di main. Hanya panggil endpoint yang masuk paket/CU aktual; jangan tambah fan-out tanpa verifikasi penggunaan.
7. GoPlus PR #62 mencakup chain support dan PR #63 signature decode. Support menyebut 30 calls/min gratis; Hostless credentials dan live response tetap gate terpisah.
8. RSS TechCrunch AI dan Cointelegraph sudah ada. GDELT melengkapi discovery global, bukan menggantikan publisher link.

## Data quality & trading safety contract

- Canonical identity: chain_id + contract_address untuk token; exchange + market_type + symbol untuk CEX. Jangan join hanya dengan ticker.
- Tiap observation: source, source_url, observed_at, provider_updated_at bila tersedia, retrieved_at, timeframe, units, venue, instrument_type, stale_after, quality_flags.
- Pisahkan spot, perpetual, mark, index, last trade, oracle price, candle volume, rolling 24h volume, open interest dan funding.
- Missing/invalid tetap null; jangan fallback ke nol. Konflik antar-sumber harus terlihat, bukan diam-diam dirata-rata.
- Konfirmasi harga dari beberapa venue independen jika hak penggunaan memungkinkan; likuiditas DEX harus terikat ke exact pool + chain.
- Hindari look-ahead bias: gunakan publication/availability time, bukan hanya observation period. Macro series bisa direvisi.
- AI boleh menjelaskan data terverifikasi, tetapi tidak boleh mengarang wallet attribution, volume, funding, liquidity, entry, stop atau target.
- Tidak ada live order execution. Trading OFF sampai risk controls dan persetujuan eksplisit BOS.

## Test dan deployment evidence
- Main HEAD diaudit: 4a08855cf22c94c18c97ed550de3ba0706095d44.
- PR relevan: #65 BLS/NY Fed, #60 DEX Screener compliance hold, #62/#63 GoPlus, #66 entry/SL/TP. PR #65 dan #66 belum memiliki independent review evidence dalam audit ini.
- Combined status GitHub untuk main HEAD kosong; bukan bukti pass/fail.
- npm test lokal tidak dijalankan karena working copy/runtime tidak tersedia.
- Hostless build/live tidak diperiksa. EROFS/DATA_DIR tetap blocker; tidak ada klaim sumber baru live.
- Tidak ada login, akun baru, kartu, pembayaran, secret, atau perubahan Hostless env.

## Handoff / next actions
1. Divisi 04: implementasi adapter GDELT metadata/event dan World Bank + Treasury macro secara terisolasi; gunakan PR #65 branch untuk macro setelah base/diff diverifikasi.
2. Divisi 03: validasi field Binance spot/futures dan mapping instrumen; jangan onboard Bybit/OKX/Kraken/Hyperliquid sebelum data rights clear.
3. Divisi 01: review SSRF/allowlist, timeout, response size, rate-limit/cache bounds, provenance, serta exposure CoinGecko/DeFiLlama/GeckoTerminal/DEX Screener.
4. Divisi 05: fixtures untuk stale, partial, conflicting, revised, missing observations; exact-head CI + regression.
5. Divisi 08: lanjutkan official ToS review Bybit/Hyperliquid/indexers.
6. Executive Office: prioritaskan dan koordinasikan independent reviews. Production deployment dan financial actions tetap di approval gates.


## CI evidence update (23 November 2026)
- Exact head tested: c810426d9449c43a5eb8d60927f6c1bf4d499474.
- GitHub Actions test run #743 / ID 45192843609: npm test **135 passed, 0 failed, 0 skipped**.
- Security run #286 / ID 45192843607: Gitleaks success, no leaks; Trivy secret scanner success, no findings. Trivy vulnerability scanner did not run because there were zero supported language-specific files. Dependency vulnerability coverage is **NOT AVAILABLE**, not a clean scan.
- Documentation-only branch; no runtime source adapter was deployed and Hostless Build/LIVE remain unverified.


## 23 November 2026 — additional trading-data candidates

### Marketlight public derivatives API — candidate, not yet activated
- Developer documentation: https://marketlight.ai/developers
- States: no API key or signup, read-only JSON, CC BY 4.0 with attribution to Marketlight.
- Documented coverage: current/historical funding and open interest for Binance, Bybit, OKX, Bitget, Gate, MEXC and Hyperliquid; public liquidation summaries and historical daily aggregates; 24 listed base assets.
- Useful RADAR endpoints include `/api/public/derivatives?base=BTC`, `/bt/api/public/funding`, and `/bt/api/public/liquidations/summary?hours=24`.
- Decision: **controlled probe only**. Before production, independently verify uptime, update timestamps, field definitions, exchange provenance, symbol coverage, response-size limits, rate behavior, provider rights over normalized exchange data, and attribution. Keep venue-specific rows separate. Aggregated liquidations are not wallet identities or proof of whale activity. A live API response was not verified during this audit.

### Jupiter Tokens API v2 — Solana candidate, not yet activated
- Official docs: https://developers.jup.ag/ and https://developers.jup.ag/docs/tokens
- Documented fields include token metadata, verification/organic score, mint/freeze authority, holder count, market cap/FDV, liquidity and buy/sell statistics over 5m/1h/6h/24h.
- Official developer guide states keyless access for testing at 0.5 requests/second; a free developer API key raises this to 1 request/second without payment.
- Decision: technical access is free, but **production use remains on hold** until current API terms and commercial/display/cache rights are checked. If approved, use exact Solana mint address, keep the source's quality flags distinct from GoPlus, and do not treat Organic Score as a security audit. A live API response was not verified during this audit.

### Expand existing Binance USDⓈ-M Futures data before adding more vendors
- Official docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data
- RADAR currently fetches latest funding/mark, current open interest, OI history and taker flow. Official public market-data docs additionally expose funding history, global long/short account ratio, top-trader account and position ratios, order-book depth and mark/index price klines.
- Decision: highest-value incremental derivatives work after review of PR #65. Add on-demand, bounded/cached fields with exchange, instrument type, interval, provider timestamp and freshness flags. Keep account ratios explicitly exchange-specific; do not describe them as wallet cohort/whale flows. Do not add order placement or authenticated trading routes.

### Prioritization update
1. Review/merge BLS + New York Fed PR #65 only after independent Divisi 01/02/05 review and exact-head CI.
2. Implement Treasury Fiscal Data + selected World Bank Indicators macro series in isolated PRs; use publication/availability dates and per-dataset license metadata.
3. Implement GDELT Project event metadata (not GDELT Cloud) with publisher links and source timestamps; do not copy publisher article content.
4. Expand Binance Futures public positioning/funding/depth metrics.
5. Probe Marketlight and Jupiter under controlled limits after terms/security checks.

No candidate above has been activated in production by this addendum. No credentials, accounts, payment methods, Hostless environment, or trading permissions were changed.


## Additional free trading sources — reviewed after initial audit

### Marketlight public derivatives API — approved for controlled use with attribution
- Docs: https://marketlight.ai/developers
- No login, sign-up, API key or card; read-only GET JSON.
- API documentation explicitly states CC BY 4.0, including commercial use, provided RADAR credits Marketlight and links to marketlight.ai.
- Coverage: 24 coins; liquidations from Binance/Bybit/OKX; open interest and funding across seven venues; hourly/daily history; Fear & Greed and weekly reports.
- Freshness: liquidation summary/hourly cache 60 seconds; cross-venue OI/funding cache 5 minutes; Fear & Greed cache 5 minutes. Provider asks clients to keep calls to a few per minute.
- Accuracy caveat: this is an aggregator of exchange feeds, not an independent venue. Use for cross-check/coverage, not as the sole source. Verify updatedMs/ts, venue, funding intervalHours and coverage; do not mix 1h Hyperliquid funding with 8h venue funding. Keep CC BY attribution visible.
- Initial API endpoint probe: web access reached the documented JSON endpoints (HTTP response body was not parsed by the browsing interface); this is not a full schema/accuracy/live production verification.

### Jupiter Tokens API v2 — keyless prototype only; production hold
- Docs: https://developers.jup.ag/docs/tokens and https://developers.jup.ag/
- No sign-up access at 0.5 requests/second; a free API key raises the rate to 1 request/second but requires developer registration. No payment required for free tier.
- Potential token metadata, verified lists, organic score and market/liquidity information can help Solana token discovery. These scores are provider-defined discovery signals, not independent security audits.
- API-specific data reuse/redistribution terms were not located/confirmed in this review. Keep it probe-only; do not persist, publish, or use it in production scoring until Division 08 confirms rights and Division 01 reviews endpoint security. No account/key registration was performed.

### Binance USDⓈ-M Futures — expand existing source before adding another vendor
- Official docs: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data
- Existing main adapter (lib/derivatives.js) already calls current funding/mark, current open interest, open-interest history and taker long/short flow.
- Additional no-auth endpoints worth adding:
  - GET /fapi/v1/fundingRate — funding history.
  - GET /futures/data/globalLongShortAccountRatio — all-trader account-count ratio.
  - GET /fapi/v1/depth — bounded order-book snapshot.
  - GET /fapi/v1/markPriceKlines and /fapi/v1/indexPriceKlines — mark/index price history.
- Do not add top-trader long/short account/position ratio endpoints in the no-login task: official docs mark those as MARKET_DATA and require X-MBX-APIKEY. Those require account/API key setup and are excluded.
- Semantic guardrail: global long/short ratio is account counts, not wallet balances or whale flows. Order-book depth is a snapshot, not executed volume. Preserve raw exchange fields and timestamps.
- Prioritize these incremental Binance fields over duplicating already-present sources.

### Additional exclusions / holds
- Hyperliquid Info API is public and documented, but the Foundation non-validating node is best-effort with no guarantees for availability, latency, performance or completeness and must not be the sole/authoritative source for trading or time-sensitive activity. API data rights/redistribution were not confirmed. Do not rely on it as primary source.
- Coinbase public exchange endpoints exist, but Coinbase Institutional identifies authorized redistribution partners for exchange market data. Do not republish Coinbase market data in RADAR without the relevant market-data permission.
- Bybit public market endpoints may not require authentication, but the API terms prohibit unapproved redistribution/commercial exploitation/competing use. Keep out of public-facing RADAR unless a permitted personal-only scope or written permission is confirmed.


## Official terms follow-up — Jupiter and Coin Metrics (23 November 2026)

### Jupiter Tokens API — technical access is public; legal scope remains unresolved
- Token API docs: https://developers.jup.ag/docs/tokens. Keyless search works for prototyping at 0.5 req/s; free API key gives 1 req/s.
- Jupiter SDK & API License Agreement: https://developers.jup.ag/docs/legal/sdk-api-license-agreement
- The published agreement is fee-bearing, restricts sublicensing/transferring API content to third parties, and reserves written consent for uses not prescribed. Its formal API definition focuses on the routing API; the docs do not unambiguously establish whether all Token API data fields are covered by that agreement or a separate data license.
- Decision: **HOLD production/customer-facing use** until Jupiter confirms in writing the Token API's specific license, commercial use, caching, display/redistribution, and any fee. Do not treat keyless access as a grant of data rights. No account/key registration was done.

### Coin Metrics Community API — no key but non-commercial license
- Official API docs: https://docs.coinmetrics.io/api/v4 and community offering: https://github.com/coinmetrics/product-docs/blob/master/docs/packages/coin-metrics-community-data.md
- Community endpoints do not require an API key; published IP limit is 10 requests per 6-second sliding window.
- Official API docs describe Community API data as free for **non-commercial use** under a Creative Commons license; product docs identify the community dataset. This is not an acceptable production feed for a commercial RADAR service without an alternative written commercial license. Exclude from commercial/customer-facing RADAR. It may be used only in a clearly non-commercial research context after checking the specific dataset license and attribution.


## Audit repository open-source untuk komponen RADAR AI — 23 November 2026

### Prinsip pemilihan
RADAR AI V2 saat ini adalah aplikasi Node.js >=20 dengan `package.json` menyatakan `zero dependencies` dan `UNLICENSED/private`. Karena itu, menambahkan framework besar atau menyalin kode copyleft ke aplikasi inti bukan keputusan otomatis. Open-source tidak berarti data/API gratis, tidak berarti bebas redistribusi data, dan tidak menghilangkan biaya server/node. Kandidat dinilai berdasarkan kecocokan Node, lisensi, status pemeliharaan, risiko operasi, dan apakah fungsi yang sama sudah tersedia di RADAR.

### Shortlist repository dan keputusan

| Repository | Lisensi GitHub | Kegunaan | Kecocokan / risiko | Keputusan RADAR |
|---|---|---|---|---|
| [ccxt/ccxt](https://github.com/ccxt/ccxt) | MIT | Unified REST client untuk 100+ exchange, JavaScript/TypeScript dan bahasa lain | Paling relevan untuk adapter CEX multi-venue; core open-source, streaming `watch*` tertentu berada pada CCXT Pro berbayar; tiap exchange tetap memiliki rate limits/terms sendiri | **Kandidat Divisi 03 untuk fase Bybit/multi-exchange**. Jangan tambahkan dependency sekarang: Binance public feed sudah native dan package RADAR sengaja zero-dependency. Uji hanya pada branch terisolasi setelah Divisi 03 menetapkan endpoint/market type |
| [bennycode/trading-signals](https://github.com/bennycode/trading-signals) | Tidak teridentifikasi oleh metadata lisensi yang diperiksa | Indikator teknikal TypeScript | Repository aktif, tetapi lisensi belum dapat dipastikan dari metadata audit | **HOLD** sampai file LICENSE dan dependency/transitive license diverifikasi |
| [TA-Lib/ta-lib](https://github.com/TA-Lib/ta-lib) | BSD-3-Clause | Indikator teknikal dan candlestick, native C | Memerlukan native build/binding untuk Node; menambah kompleksitas deploy Hostless dan bukan plug-in murni JS | **Tidak dipasang sekarang**; gunakan sebagai referensi validasi hasil indikator jika diperlukan |
| [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade) | GPL-3.0 | Bot crypto Python, backtesting, hyperparameter optimization, dry-run, FreqAI | Sangat berguna sebagai benchmark metodologi backtest dan risk controls, tetapi bukan library Node drop-in; GPL-3.0 memerlukan review sebelum integrasi/derivative work ke aplikasi private | **Gunakan sebagai referensi riset terpisah saja**. Jangan salin kode atau embed ke server RADAR tanpa review legal. Backtest tidak membuktikan profit masa depan |
| [hummingbot/hummingbot](https://github.com/hummingbot/hummingbot) | Apache-2.0 | Framework Python untuk market making/arbitrage dan connectors CEX/DEX | Project standalone dan fokus execution; membutuhkan runtime/operasi tambahan serta berpotensi menempatkan dana pada risiko jika live | **Tunda**. Berguna sebagai referensi arsitektur connector/paper trading, bukan diaktifkan pada RADAR yang masih read-only |
| [nautechsystems/nautilus_trader](https://github.com/nautechsystems/nautilus_trader) | LGPL-3.0 | Event-driven trading engine dengan core Rust dan deterministic simulation | Kapabilitas backtest/live kuat tetapi stack jauh lebih berat dari Node monolith; perlu review kewajiban LGPL dan service boundary | **Riset fase lanjutan** untuk backtest terisolasi; bukan dependency V2 saat ini |
| [solana-foundation/solana-web3.js](https://github.com/solana-foundation/solana-web3.js) | MIT | Solana JavaScript SDK untuk RPC, transaksi, account dan program | Cocok jika RADAR perlu parsing transaksi/account lebih dalam; menambah dependency dan public RPC tetap rate-limited | **Kandidat Divisi 03/04** hanya untuk fitur Solana yang belum ditangani Solscan adapter. Jangan duplikasi fetch/RPC yang sudah ada |
| [anza-xyz/agave](https://github.com/anza-xyz/agave) | Apache-2.0 | Solana validator dan RPC client/node | Self-hosting memerlukan hardware, bandwidth, disk, operasi validator dan sinkronisasi chain | **Tidak layak untuk Hostless saat ini**; pertimbangkan hanya jika ada anggaran infrastruktur dan kebutuhan node sendiri |
| [rpcpool/yellowstone-grpc](https://github.com/rpcpool/yellowstone-grpc) | AGPL-3.0 | Streaming Solana Geyser/gRPC berlatensi rendah | Membutuhkan Geyser-enabled validator/provider dan ada implikasi AGPL; bukan sumber data mandiri | **HOLD** sampai kebutuhan real-time Solana terbukti, provider/node tersedia, dan Divisi 01/legal menyetujui AGPL boundary |
| [tradingview/lightweight-charts](https://github.com/tradingview/lightweight-charts) | Apache-2.0 | Financial chart UI ringan berbasis canvas | Hanya visualisasi, bukan data/alpha; wajib mengikuti attribution/license notice; perlu cek apakah chart existing sudah memadai | **Opsional untuk Divisi 02** bila ada gap chart yang terukur; bukan prioritas intelijen |
| [blockscout/blockscout](https://github.com/blockscout/blockscout) | NOASSERTION pada metadata API | Explorer/indexer untuk jaringan EVM | Lisensi belum dapat dipastikan; deployment membutuhkan database/indexing infra besar | **Tolak untuk integrasi sekarang** sampai lisensi dan biaya infra terverifikasi |

### Prioritas yang benar-benar dapat ditindaklanjuti
1. **Divisi 03:** buat evaluasi CCXT di branch terisolasi untuk satu adapter Bybit public market-data saja, setelah terms/redistribution per exchange diperiksa. Bandingkan dengan implementasi native; jangan mengganti Binance adapter yang telah terbukti.
2. **Divisi 04 + Divisi 05:** gunakan Freqtrade sebagai referensi metodologi, lalu rancang backtest internal RADAR yang bebas look-ahead bias, memasukkan fee, funding, slippage, partial fills, delisting/survivorship dan out-of-sample/walk-forward. Jangan mengambil kode GPL.
3. **Divisi 03/04:** pertimbangkan Solana web3.js hanya untuk kebutuhan parsing account/transaction yang tidak tersedia melalui Solscan. Gunakan exact mint/account signature, pagination dan provenance; public RPC bukan production SLA.
4. **Divisi 02:** pertimbangkan Lightweight Charts hanya bila chart yang sekarang benar-benar kurang; jangan mengganti UI hanya karena repository populer.
5. **Divisi 01:** review license notices, dependency supply-chain, network egress/SSRF, rate limits dan secret boundaries sebelum dependency baru.
6. **Divisi 05:** QA independen, test fixture dan benchmark data sebelum adapter dipromosikan.

### Kebijakan implementasi
- Tidak ada repository eksternal yang di-clone, dijalankan, atau kodenya disalin ke main dalam audit procurement ini.
- Tidak ada dependency baru, perubahan runtime, credential, Hostless env, atau permission yang diubah.
- Lisensi yang tercatat adalah metadata repository saat audit; sebelum memakai kode, periksa file LICENSE pada exact tag/commit yang akan dipakai, lisensi dependency transitif, attribution/NOTICE, dan kewajiban distribusi.
- Semua adapter data harus tetap read-only, bounded, timeout-protected, cached sesuai terms, dan menampilkan sumber/timestamp/freshness.
- Tidak ada live order, wallet signing, withdrawal, atau eksekusi dana.
- Link sumber utama: https://github.com/ccxt/ccxt ; https://github.com/freqtrade/freqtrade ; https://github.com/hummingbot/hummingbot ; https://github.com/nautechsystems/nautilus_trader ; https://github.com/solana-foundation/solana-web3.js ; https://github.com/anza-xyz/agave ; https://github.com/rpcpool/yellowstone-grpc ; https://github.com/tradingview/lightweight-charts ; https://github.com/TA-Lib/ta-lib ; https://github.com/blockscout/blockscout .

### Kesimpulan procurement
Tidak ada alasan aman untuk menambahkan banyak framework sekaligus ke runtime V2. **CCXT adalah kandidat kode paling praktis untuk evaluasi multi-exchange berikutnya**, sementara Freqtrade/Hummingbot/NautilusTrader berguna sebagai referensi riset/backtest/arsitektur yang berdiri terpisah. Solana web3.js hanya ditambahkan bila ada kebutuhan parsing yang tidak tertangani. Prioritas immediate tetap menyelesaikan sumber data yang sudah diotorisasi, review provider rights, dan memperbaiki blocker storage Hostless sebelum memperbesar beban sistem.
