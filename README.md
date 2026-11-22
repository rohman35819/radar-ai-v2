# RADAR AI V2.1

Tanpa dependensi npm (V2.2) (butuh Node >= 20). Backend + dashboard PWA dalam satu proses.

## Jalankan
    cp .env.example .env   # opsional; isi nilai lalu: export $(grep -v '^#' .env | xargs)
    npm test               # 99 test case di 10 file
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
| Logika screener, FDV, filter kategori, join gecko_id, parser RSS, validasi unlock, aturan alert + cooldown, server + rate limit + path traversal, kegagalan sumber, signature Binance/Bybit, normalisasi saldo/posisi, route Exchange Hub | **Diuji otomatis** (60 test case di delapan file; exchange memakai respons API mock, belum membuktikan koneksi akun Hostless/live) |
| Panggilan nyata ke CoinGecko, DeFiLlama, RSS | Jalankan `npm run live-check` di mesin ber-internet (tes API nyata). Telegram: belum diuji |
| Lonjakan volume | Estimasi dari selisih volume 24j bergulir antar refresh (~10 mnt) vs median selisih token itu sendiri; CoinGecko gratis tidak punya volume per-10-menit asli. Butuh ~1 jam riwayat sebelum aktif |
| Dashboard/PWA di perangkat Android | **Belum diuji di perangkat**; sintaks dan file statis diperiksa |
| Exchange Hub Binance/Bybit | Backend akun read-only dan ticker market publik tersedia; koneksi akun nyata menunggu verifikasi environment Hostless dan izin API |
| Token unlock | **Butuh konfigurasi**: tidak ada sumber gratis terverifikasi. Isi `data/unlocks.json` atau `UNLOCKS_URL` (array `[{id (gecko id), symbol, date, amount_usd, pct_supply, source}]`) |
| Telegram | **Butuh konfigurasi**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| CoinGecko Demo key | Disarankan (`COINGECKO_DEMO_KEY`); cek ToS jika komersial |
| Makro/ekonomi global | **Belum ada** modul khusus; hanya lewat `NEWS_FEEDS` |

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
