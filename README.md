# RADAR AI V2.1

Tanpa dependensi npm (V2.2) (butuh Node >= 20). Backend + dashboard PWA dalam satu proses.

## Jalankan
    cp .env.example .env   # opsional; isi nilai lalu: export $(grep -v '^#' .env | xargs)
    npm test               # 99 test case di 12 file
    npm start              # http://localhost:3000

## Pasang
Host apa pun yang menjalankan Node (VPS kecil, Render/Railway/Fly dll; cek harga dan kebijakan terbaru masing-masing).
Start command: `npm start`. Set env dari `.env.example`. Host gratis yang tidur saat idle akan menghentikan refresh dan alert;
untuk alert 24 jam pakai instance yang selalu aktif. Pasang `DATA_DIR` pada disk persisten agar state/cooldown tidak hilang.
Di Android: buka URL di Chrome, menu > "Instal aplikasi".

PWA menyimpan shell halaman agar dapat dibuka kembali saat offline. Respons API tidak disimpan ke Cache Storage browser; data akun exchange harus selalu dimuat ulang dari server.

## Status fitur (hanya yang diuji = tercantum)
| Fitur | Status |
|---|---|
| Logika screener, FDV, filter kategori, join gecko_id, parser RSS, validasi unlock, aturan alert + cooldown, server + rate limit + path traversal, kegagalan sumber, signature Binance/Bybit, normalisasi saldo/posisi, route Exchange Hub | **Diuji otomatis** (99 test case di 12 file; exchange memakai respons API mock, belum membuktikan koneksi akun Hostless/live) |
| Panggilan nyata ke CoinGecko, DeFiLlama, RSS | Jalankan `npm run live-check` di mesin ber-internet (tes API nyata). Telegram: belum diuji |
| Lonjakan volume | Estimasi dari selisih volume 24j bergulir antar refresh (~10 mnt) vs median selisih token itu sendiri; CoinGecko gratis tidak punya volume per-10-menit asli. Butuh ~1 jam riwayat sebelum aktif |
| Dashboard/PWA di perangkat Android | **Belum diuji di perangkat**; sintaks dan file statis diperiksa |
| Exchange Hub Binance/Bybit | Backend akun read-only dan ticker market publik tersedia; koneksi akun nyata menunggu verifikasi environment Hostless dan izin API |
| Token unlock | **Butuh konfigurasi**: tidak ada sumber gratis terverifikasi. Isi `data/unlocks.json` atau `UNLOCKS_URL` (array `[{id (gecko id), symbol, date, amount_usd, pct_supply, source}]`) |
| Telegram | **Butuh konfigurasi**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| CoinGecko Demo key | Disarankan (`COINGECKO_DEMO_KEY`); cek ToS jika komersial |
| Makro/ekonomi global | **Belum ada** modul khusus; hanya lewat `NEWS_FEEDS` |

## Market Intelligence (CoinGecko)

Halaman `/market.html` menambahkan dashboard pasar global terpisah dari Market Screener kategori AI yang sudah ada.

Modul yang tersedia:
- Global market cap, volume 24 jam, BTC/ETH dominance, jumlah aset dan pasar.
- Global Coin Scanner Top 100 dengan harga USD dan IDR, perubahan 1 jam/24 jam/7 hari, market cap, volume, pencarian, Top Gainers dan Top Losers.
- Trending search coins dari CoinGecko.
- Momentum Detector lintas 1h/24h/7d, High Turnover Watch (volume 24 jam / market cap), dan Risk Monitor berbasis ambang heuristik.
- Sector Rotation dari perubahan market cap kategori.
- Exchange Intelligence: ranking exchange, volume BTC, trust score, dan trading pairs on-demand dengan harga, volume, serta bid/ask spread.
- Historical line charts untuk harga, market cap, dan volume pada rentang 1/7/30/90 hari.
- Market Regime berbasis aturan statistik RADAR; panel terpisah menampilkan laporan terakhir AI Council bila tersedia.

Backend:
- `GET /api/market-intelligence`: global, top markets USD/IDR, trending, categories, exchanges.
- `GET /api/market-intelligence/chart?coin=bitcoin&days=7`: historical market chart; coin ID dan rentang divalidasi.
- `GET /api/market-intelligence/exchange-tickers?exchange=binance`: trading pairs exchange; ID divalidasi.
- API key `COINGECKO_DEMO_KEY` hanya dikirim dari backend melalui header `x-cg-demo-api-key`; tidak pernah dikirim ke browser atau log.
- Cache server 60 menit untuk feed utama, chart, dan exchange tickers. Kegagalan upstream tanpa data cache diberi cooldown 5 menit agar polling UI tidak terus memukul endpoint yang sedang gagal. Polling UI 5 menit hanya membaca cache server selama TTL aktif; ini mengurangi pemakaian kuota Demo.
- Jika salah satu endpoint gagal, feed lain tetap ditampilkan dan status sumber menunjukkan error/stale. Data cache lama tidak diberi label fresh.
- Tidak ada dependency npm runtime baru.

Batasan:
- Market Regime, Momentum Detector, turnover watch, dan Risk Monitor adalah heuristik statistik/proxy, bukan output model AI, bukan deteksi anomali intraday, bukan audit keamanan token/likuiditas, bukan sinyal trading, dan bukan jaminan hasil. AI Council Summary adalah laporan AI terakhir yang tersimpan dan dapat berasal dari siklus analisis sebelumnya.
- Gainers/losers hanya dibandingkan di dalam Top 100 yang diminta dashboard, bukan seluruh pasar.
- CoinGecko Demo memiliki batas request dan histori menurut paket; kuota dipakai bersama oleh seluruh fitur CoinGecko RADAR. Pantau Developer Dashboard dan jangan menganggap refresh paksa bebas kuota.
- Data exchange adalah data agregat provider; spread dan trust score bukan audit likuiditas atau keamanan exchange.
- Tampilkan atribusi **Powered by CoinGecko** saat menggunakan data. Dokumentasi dan paket: https://docs.coingecko.com/ dan https://www.coingecko.com/en/api/pricing.

## Futures Flow Intelligence (free public market data)

Halaman Market Intelligence menambahkan panel **Futures Flow Intelligence**. Pair USDT dapat diperiksa manual melalui `GET /api/market-intelligence/derivatives?symbol=BTCUSDT`. Backend mengambil data publik Binance USDⓈ-M Futures:
- Funding rate dan mark price dari `/fapi/v1/premiumIndex`.
- Open interest terkini dari `/fapi/v1/openInterest`.
- Histori open interest 5 menit dari `/futures/data/openInterestHist`.
- Taker buy/sell volume dan ratio 5 menit dari `/futures/data/takerlongshortRatio`.

Tidak memerlukan API key. Respons tiap endpoint memiliki status terpisah; kegagalan parsial tetap ditampilkan sebagai N/A, bukan nol. Cache server 5 menit dan fetch hanya saat pengguna meminta pair agar tidak menghabiskan kuota/IP rate limit. Data hanya untuk pair USDⓈ-M USDT yang didukung Binance. Open interest tidak menunjukkan sisi long saja; setiap kontrak memiliki long dan short. Taker flow adalah volume agresor, bukan identitas wallet/whale. Tidak ada order/trading yang dikirim.

## Exchange Hub (read-only)

Halaman `/trading.html` menyediakan satu antarmuka untuk Binance, Bybit, dan integrasi berikutnya. Koneksi akun berjalan di backend; API key dan secret tidak pernah dikirim ke browser.

Environment server (Hostless):
- Binance: `BINANCE_API_KEY`, `BINANCE_API_SECRET`.
- Bybit: `BYBIT_API_KEY`, `BYBIT_API_SECRET`.
- Akses privat halaman: `EXCHANGE_ACCESS_TOKEN` (jika kosong, backend memakai `ADMIN_TOKEN` sebagai fallback). Masukkan token tersebut pada kolom kunci akses di Exchange Hub; token hanya berada di memori halaman selama tab terbuka; pengguna dapat menampilkan atau menghapus token dari halaman.
- Opsional: `BINANCE_API_BASE`, `BINANCE_FUTURES_BASE`, `BYBIT_API_BASE`, `BYBIT_ACCOUNT_TYPE`, `BINANCE_ACCOUNT_LABEL`, `BYBIT_ACCOUNT_LABEL`.
- `BINANCE_ACCOUNT_LABEL` / `BYBIT_ACCOUNT_LABEL` adalah nama panggilan tampilan yang kamu tentukan sendiri di environment Hostless (contoh: `Akun Utama`). API exchange tidak menyediakan username/email pribadi melalui endpoint akun yang dipakai RADAR. Jika label tidak diisi, halaman menampilkan nama exchange dan fingerprint API Key SHA-256 10 karakter; fingerprint bukan API Key dan tidak dapat dipakai untuk autentikasi.

Gunakan kredensial dengan izin baca akun saja. Nonaktifkan withdrawal, spot trading, futures trading, dan transfer. Jangan memasukkan secret ke chat, frontend, repository, atau log.

Endpoint:
- `GET /api/exchanges/status`: hanya mengembalikan boolean konfigurasi (tidak mengembalikan nilai key/secret).
- `GET /api/exchanges/binance/account`: membaca saldo Spot dan, bila diizinkan, wallet/posisi USDⓈ-M Futures.
- `GET /api/exchanges/bybit/account`: membaca Unified Wallet dan posisi Linear melalui API V5 serta memeriksa status/permission API Key melalui signed `GET /v5/user/query-api`.
- `GET /api/exchanges/market?exchange=binance|bybit&symbol=BTCUSDT`: membaca ticker publik 24 jam Spot dan Futures/Linear; tidak memerlukan API key.

Rate limit exchange ditangani terpisah: HTTP 429/418, Binance `-1003`, dan Bybit `10006`/`10429` menghasilkan status `EXCHANGE_RATE_LIMITED` (HTTP 429). Header `Retry-After` diteruskan bila tersedia; Bybit `X-Bapi-Limit-Reset-Timestamp` dikonversi menjadi waktu tunggu, dan respons IP `access too frequent` memakai cooldown konservatif 600 detik bila header tidak tersedia. RADAR tidak melakukan retry otomatis setelah rate-limit agar tidak memperparah pembatasan atau IP ban; pengguna harus menunggu sebelum mencoba lagi.

Setelah koneksi akun berhasil, Exchange Hub menampilkan identitas akun, label opsional dari environment, serta fingerprint API Key satu arah untuk membedakan konfigurasi key tanpa mengirim key mentah ke browser. Ini bukan username resmi dari Binance/Bybit. Untuk Bybit, endpoint resmi GET /v5/user/query-api juga menyediakan UID akun, status readOnly, dan kategori permission; RADAR hanya mengembalikan UID dan permission yang sudah disanitasi, tidak pernah apiKey atau secret. Koneksi privat dilindungi token pemilik pada header `x-exchange-access-token`; tanpa token server yang dikonfigurasi endpoint akun menolak akses. Status konfigurasi hanya mengungkap boolean dan tidak mengembalikan nilai token atau kredensial exchange. Masukkan `EXCHANGE_ACCESS_TOKEN` (atau `ADMIN_TOKEN` fallback) pada kolom akses privat, lalu tekan tombol uji koneksi. Tombol Perbarui akun memakai token sesi yang sama, dan token dapat dihapus manual dari halaman. Token tidak disimpan ke localStorage/sessionStorage dan hanya digunakan selama halaman terbuka. Data akun hanya diteruskan ke browser untuk ditampilkan dan tidak disimpan ke state RADAR AI. Endpoint ini tidak membuat, mengubah, atau membatalkan order. Koneksi dinyatakan berhasil hanya setelah permintaan privat ke exchange berhasil; keberadaan environment saja bukan bukti koneksi. Untuk Binance, izin trading API Key diperiksa melalui endpoint resmi `GET /sapi/v1/account/apiRestrictions`, menggunakan field `enableSpotAndMarginTrading` dan `enableFutures`. Flag `canTrade` dari `/api/v3/account` atau `/fapi/v2/account` hanya menggambarkan kemampuan trading akun, bukan izin khusus API Key, sehingga tidak boleh dipakai untuk menyimpulkan izin Key. Bila endpoint izin tidak tersedia, UI menyatakan status izin belum terverifikasi dan tidak menganggapnya nonaktif. Izin withdrawal/transfer juga dibaca untuk transparansi; RADAR tidak menyediakan aksi tersebut. RADAR sendiri tetap read-only: seluruh request akun/market menggunakan HTTP GET dan tidak menyediakan endpoint order, transfer, atau withdrawal. Gunakan key dengan izin baca saja dan withdrawal/trading/transfer dinonaktifkan.

## Catatan

- Market Screener mempertahankan kata kunci/filter/sort saat data otomatis diperbarui dan menyediakan ekspor CSV untuk hasil yang sedang difilter. CSV menggunakan UTF-8 BOM dan perlindungan formula pada sel teks.
- Screener: ambil seluruh kategori AI CoinGecko (hingga `MAX_PAGES` x 250), lalu filter lokal. Token ditandai `stale`, `fdv_unknown`, dsb; data basi tidak memicu alert.
- Fundamental hanya tampil untuk token yang `gecko_id`-nya ada di DeFiLlama; selain itu `n/a` (bukan 0). Kecocokan fees/revenue memakai slug/nama dan bisa meleset untuk sebagian protokol.
- `POST /api/refresh` butuh `ADMIN_TOKEN` (header `x-admin-token`). Rate limit 60 req/menit/IP dengan tabel identitas dibatasi 5.000 entri; ketika penuh, identitas baru ditolak sementara sampai entri kedaluwarsa dibersihkan (bucket aktif tidak dihapus massal). Secara default identitas IP memakai koneksi socket dan tidak mempercayai `x-forwarded-for`; bila aplikasi berada di belakang reverse proxy yang menghapus header masuk lalu menambahkan rantai `X-Forwarded-For` yang benar, set `TRUSTED_PROXY_HOPS` sesuai jumlah proxy tepercaya (default `0`). Jangan menaikkan nilainya tanpa memastikan rantai proxy Hostless. Semua endpoint admin menggunakan pembandingan token waktu-konstan di server; jangan bagikan token melalui chat atau menyimpannya di frontend.
- Watchlist tersimpan di browser perangkat, bukan server.
- Bukan saran keuangan.

- Moderator fallback menggunakan OpenRouter Free Models Router (`openrouter/free`) secara paksa; `OPENROUTER_MODEL` berbayar tidak dipakai untuk jalur moderator. Kuota model gratis dapat dibatasi; jika Groq dan OpenRouter tidak tersedia, hasil tetap WAIT. Tidak ada fallback berbayar otomatis.

## Command Center
- Halaman `/command.html` menjalankan rapat multi-agent melalui `POST /api/ai/command`; pilih Gemini, Groq, OpenRouter, dan/atau OpenAI.
- Masukkan `ADMIN_TOKEN` pada kolom akses halaman. Token hanya dipakai di header permintaan, tidak disimpan di localStorage/sessionStorage, dan dikosongkan setelah proses. Jangan kirim token melalui chat.
- Hasil dipantau melalui `GET /api/ai/workspace` berdasarkan `command_id`; halaman menampilkan putaran diskusi, usulan, error provider, dan notulen.
- Command Center hanya menghasilkan analisis/usulan. Tidak mengubah kode, merge, atau mengirim order trading otomatis.

## AI Group (uji coba)
- Env: `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY` (jangan commit key).
- Model OpenAI default: `gpt-6-luna`; dapat diganti dengan `OPENAI_MODEL`. OpenAI API berbayar sesuai token yang digunakan; pantau biaya/budget project.\n- Model Groq default: `openai/gpt-oss-20b`; dapat diganti dengan `GROQ_MODEL`.
- Model OpenRouter default: `openrouter/free`; dapat diganti dengan `OPENROUTER_MODEL`. Pastikan model yang dipilih memang gratis; free routing memiliki batas provider.
- Laporan grup otomatis sekali sehari pukul 09.00 WIB (dapat diubah dengan `AI_REPORT_HOUR`, angka 0-23). Endpoint manual: `POST /api/ai/group/run` dengan header `x-admin-token`; hasil terakhir: `GET /api/ai/group`.
- Diskusi memakai satu snapshot ringkas, tiga analisis independen, lalu satu review moderator Groq. Jika kurang dari dua analisis valid atau snapshot basi, hasil akhir WAIT.
- Fitur ini hanya analisis dan laporan. Tidak mengirim order trading. Pastikan `DATA_DIR` persisten agar laporan terakhir tidak hilang setelah restart.

## Ruang Kerja AI (review mandiri)
- Tab **Ruang Kerja** menampilkan temuan dan proposal mandiri dari Gemini, Groq, OpenRouter, dan OpenAI.
- Setiap agen memakai sudut pandang berbeda: UX/produk, reliability/QA, arsitektur/riset, dan engineering/keamanan. Mereka mengusulkan maksimal tiga perbaikan dan menyertakan manfaat, risiko, file terkait, serta kriteria penerimaan.
- Review otomatis sekali sehari pukul 10.00 WIB (ubah dengan `AI_WORKSPACE_HOUR`, angka 0-23). Set `AI_WORKSPACE_ENABLED=0` untuk menonaktifkan. Endpoint manual: `POST /api/ai/workspace/run` dengan header `x-admin-token`; hasil: `GET /api/ai/workspace`.
- Review memerlukan API key provider. Satu siklus dapat memanggil maksimal empat provider; OpenAI API dapat menimbulkan biaya token. Pantau anggaran provider.
- Review hanya menghasilkan usulan. Belum ada agen yang mengubah kode otomatis; setiap implementasi harus melewati Direktur Utama, pengujian, draft PR, dan persetujuan pemilik.


### News feed diagnostics

Run `npm run news-check` to test configured RSS/Atom sources and print sanitized per-source status without exposing feed query strings or credentials. GitHub Actions runs this as a non-blocking diagnostic only for the News fix PR.


### Hostless deployment diagnostics

Run `npm run hostless-check` to probe the public `/api/ready` and `/api/snapshot` endpoints. The report contains only HTTP/readiness, storage state, News count and sanitized source health; it never prints response bodies or environment values. Set `RADAR_LIVE_URL` to probe a different public deployment.

## Solana Large Transfer Watch

Market Intelligence provides an on-demand large-transfer view for one explicitly supplied Solana wallet. It uses Solscan Pro API v2.0 `GET /account/transfer/export`, whose CSV includes transfer USD value and token decimals. The UI defaults to a $100,000 threshold and 24-hour window; the user may select a $10,000–$1,000,000 threshold and up to seven days.

The backend validates the Solana base58 address, threshold and time window; limits export size to 5 MiB, caches each address/window for five minutes, caps per-user requests at one per minute and global requests at five per minute, and filters by the USD value reported by Solscan. Exports may contain up to 5,000 rows; if the cap is reached the response flags possible truncation. No extra API key or new environment variable is introduced.

This is a **large transfer detector**, not a smart-money labeler or proof of whale ownership, accumulation, exchange flow, or intent. USD values depend on Solscan's provider valuation. If the existing Solscan plan does not allow the export endpoint, the API returns a plan-access error; no upgrade is requested or assumed.

## Solana On-Chain Intelligence (Solscan)

- Set `SOLSCAN_API_KEY` in Hostless server-side Environment Variables. The key is sent only from the Node.js backend in the `token` request header; it is never returned to the browser.
- Dashboard: `/solscan.html`. The main overview includes a Solscan source-status summary.
- Overview endpoints: chain information, 30-day network transaction/stake/fee/DeFi/compute analytics, Solscan Pro API v2 trending tokens, latest transactions, and latest blocks. Requests are cached in process for five minutes; dashboard polling is every five minutes.
- Wallet lookup is on-demand and read-only: account detail, portfolio, token accounts, transactions, transfers, DeFi activities, and staking, subject to the API plan's endpoint access. No signing or transaction execution.
- API routes: `GET /api/solscan/overview` and `GET /api/solscan/wallet?address=<base58>`. Wallet queries are rate-limited and validated server-side.
- Solscan data availability and freshness depend on endpoint coverage, indexing delay, plan permissions, and CU quota. Missing fields remain unavailable (not zero); partial endpoint failures are shown separately.
- Official API docs: https://pro-api.solscan.io/pro-api-docs/v2.0/docs


## Early Gem Scanner — GeckoTerminal
Dashboard menu **Early Gem Scanner** mengambil pool DEX terbaru (jendela provider sekitar 48 jam) dan pool trending 24 jam melalui CoinGecko Onchain API/GeckoTerminal. Data meliputi chain, DEX, alamat token/pool, umur pool, harga, likuiditas, volume, transaksi, FDV, dan market cap. Pool baru tidak sama dengan token baru dibuat dan feed hanya mencakup pool yang sudah diindeks.
- `EARLY_GEMS_ENABLED=1`, `ONCHAIN_PAGES=3` (maksimum 10), `ONCHAIN_REFRESH_MIN=60` (10–1440 menit).
- Memakai `COINGECKO_DEMO_KEY` server-side yang sudah ada; default maksimal 4 request/jam (3 halaman new pools + 1 trending), sekitar 2.880 request/30 hari. Kuota Demo tetap dibagi dengan endpoint CoinGecko lain.
- Trending merupakan ranking provider, bukan bukti keamanan. Flags hanya menandai kualitas data, bukan audit kontrak atau honeypot detection.


## Cross-validation DEX & token security
- Early Gem Scanner menyediakan validasi on-demand dengan DEX Screener berdasarkan chain ID + alamat token, bukan simbol/nama. Hasil menampilkan pair, likuiditas, volume, perubahan harga, transaksi, dan apakah alamat pool sama dengan GeckoTerminal. Tidak ada pair bukan bukti scam.
- DEX Screener API tidak membutuhkan API key untuk endpoint publik; aplikasi hanya meminta data saat tombol validasi ditekan dan menyimpan cache 2 menit.
- GoPlus Token Security bersifat opsional dan hanya dipanggil atas permintaan pengguna. Paket gratis tersedia, tetapi endpoint token-security saat ini mensyaratkan Bearer access token. Konfigurasi server: `GOPLUS_APP_KEY` + `GOPLUS_APP_SECRET` untuk mint token otomatis, atau `GOPLUS_ACCESS_TOKEN` pre-generated. Jangan pernah menaruh nilai ini di frontend/Git.
- GoPlus dibatasi konservatif 5 panggilan/menit, 1.000/hari, dan 5.000/bulan secara internal (cache 5 menit). Batas internal ini berada di bawah kuota free tier GoPlus: 150.000 CU/bulan, 30.000 CU/hari, 150 CU/menit; endpoint token-security tercantum 25 CU/call. Data kosong/parsial tidak ditampilkan sebagai "aman". Solana API ditandai beta oleh provider.


### API usage and commercial review
DEX Screener public pair endpoint is used only for on-demand cross-validation by chain and token address. It documents 300 requests/minute; the application enforces stricter local limits and short caching. Review the [DEX Screener API terms](https://docs.dexscreener.com/api/api-terms-and-conditions) before commercializing this integration because the terms restrict using its API to build a product whose primary purpose directly competes with DEX Screener.
GoPlus free Token Security access requires Console credentials to mint a Bearer token. Keep `GOPLUS_APP_KEY`, `GOPLUS_APP_SECRET`, or `GOPLUS_ACCESS_TOKEN` in Hostless server secrets only. Do not commit credentials or expose them to browser code.


## Hostless persistent storage (required)
Hostless uses a read-only root filesystem. RADAR AI writes `state.json` under `DATA_DIR`; the default `./data` path is therefore not writable on Hostless and produces `EROFS`.
1. In Hostless, open the app's **Storage → Disks** and attach an existing persistent disk (or create one after checking its displayed cost).
2. Set its mount path to `/data`.
3. In app server environment variables, set `DATA_DIR=/data`, then redeploy.
4. Verify `/api/ready` returns HTTP 200 with `status: ready` and `storage.status: ok`.
Do not use `/tmp` for RADAR AI state: Hostless clears it when the process starts again.
