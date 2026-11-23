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
