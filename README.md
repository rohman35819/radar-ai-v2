# RADAR AI V2.1

Tanpa dependensi npm (V2.2) (butuh Node >= 20). Backend + dashboard PWA dalam satu proses.

## Jalankan
    cp .env.example .env   # opsional; isi nilai lalu: export $(grep -v '^#' .env | xargs)
    npm test               # 27 tes (21 core + 6 exchange)
    npm start              # http://localhost:3000

## Pasang
Host apa pun yang menjalankan Node (VPS kecil, Render/Railway/Fly dll; cek harga dan kebijakan terbaru masing-masing).
Start command: `npm start`. Set env dari `.env.example`. Host gratis yang tidur saat idle akan menghentikan refresh dan alert;
untuk alert 24 jam pakai instance yang selalu aktif. Pasang `DATA_DIR` pada disk persisten agar state/cooldown tidak hilang.
Di Android: buka URL di Chrome, menu > "Instal aplikasi".

## Status fitur (hanya yang diuji = tercantum)
| Fitur | Status |
|---|---|
| Logika screener, FDV, filter kategori, join gecko_id, parser RSS, validasi unlock, aturan alert + cooldown, server + rate limit + path traversal, kegagalan sumber, signature Binance/Bybit, normalisasi saldo/posisi, route Exchange Hub | **Diuji otomatis** (27 tes total; exchange memakai respons API mock, belum membuktikan koneksi akun Hostless/live) |
| Panggilan nyata ke CoinGecko, DeFiLlama, RSS | Jalankan `npm run live-check` di mesin ber-internet (tes API nyata). Telegram: belum diuji |
| Lonjakan volume | Estimasi dari selisih volume 24j bergulir antar refresh (~10 mnt) vs median selisih token itu sendiri; CoinGecko gratis tidak punya volume per-10-menit asli. Butuh ~1 jam riwayat sebelum aktif |
| Dashboard/PWA di perangkat Android | **Belum diuji di perangkat**; sintaks dan file statis diperiksa |
| Exchange Hub Binance/Bybit | Backend read-only dan UI account panel tersedia; koneksi nyata menunggu verifikasi environment Hostless dan izin API |
| Token unlock | **Butuh konfigurasi**: tidak ada sumber gratis terverifikasi. Isi `data/unlocks.json` atau `UNLOCKS_URL` (array `[{id (gecko id), symbol, date, amount_usd, pct_supply, source}]`) |
| Telegram | **Butuh konfigurasi**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| CoinGecko Demo key | Disarankan (`COINGECKO_DEMO_KEY`); cek ToS jika komersial |
| Makro/ekonomi global | **Belum ada** modul khusus; hanya lewat `NEWS_FEEDS` |

## Exchange Hub (read-only)

Halaman `/trading.html` menyediakan satu antarmuka untuk Binance, Bybit, dan integrasi berikutnya. Koneksi akun berjalan di backend; API key dan secret tidak pernah dikirim ke browser.

Environment server (Hostless):
- Binance: `BINANCE_API_KEY`, `BINANCE_API_SECRET`.
- Bybit: `BYBIT_API_KEY`, `BYBIT_API_SECRET`.
- Opsional: `BINANCE_API_BASE`, `BINANCE_FUTURES_BASE`, `BYBIT_API_BASE`, `BYBIT_ACCOUNT_TYPE`.

Gunakan kredensial dengan izin baca akun saja. Nonaktifkan withdrawal, spot trading, futures trading, dan transfer. Jangan memasukkan secret ke chat, frontend, repository, atau log.

Endpoint:
- `GET /api/exchanges/status`: hanya mengembalikan boolean konfigurasi (tidak mengembalikan nilai key/secret).
- `GET /api/exchanges/binance/account`: membaca saldo Spot dan, bila diizinkan, wallet/posisi USDⓈ-M Futures.
- `GET /api/exchanges/bybit/account`: membaca Unified Wallet dan posisi Linear melalui API V5.

Koneksi privat dilakukan hanya setelah pengguna menekan tombol pemeriksaan pada Exchange Hub. Data akun hanya diteruskan ke browser untuk ditampilkan dan tidak disimpan ke state RADAR AI. Endpoint ini tidak membuat, mengubah, atau membatalkan order. Koneksi dinyatakan berhasil hanya setelah permintaan privat ke exchange berhasil; keberadaan environment saja bukan bukti koneksi.

## Catatan
- Screener: ambil seluruh kategori AI CoinGecko (hingga `MAX_PAGES` x 250), lalu filter lokal. Token ditandai `stale`, `fdv_unknown`, dsb; data basi tidak memicu alert.
- Fundamental hanya tampil untuk token yang `gecko_id`-nya ada di DeFiLlama; selain itu `n/a` (bukan 0). Kecocokan fees/revenue memakai slug/nama dan bisa meleset untuk sebagian protokol.
- `POST /api/refresh` butuh `ADMIN_TOKEN` (header `x-admin-token`). Rate limit 60 req/menit/IP (di belakang proxy, IP dibaca dari `x-forwarded-for`).
- Watchlist tersimpan di browser perangkat, bukan server.
- Bukan saran keuangan.

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
