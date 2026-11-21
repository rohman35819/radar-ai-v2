# RADAR AI V2.1

Tanpa dependensi npm (V2.2) (butuh Node >= 20). Backend + dashboard PWA dalam satu proses.

## Jalankan
    cp .env.example .env   # opsional; isi nilai lalu: export $(grep -v '^#' .env | xargs)
    npm test               # 18 tes
    npm start              # http://localhost:3000

## Pasang
Host apa pun yang menjalankan Node (VPS kecil, Render/Railway/Fly dll; cek harga dan kebijakan terbaru masing-masing).
Start command: `npm start`. Set env dari `.env.example`. Host gratis yang tidur saat idle akan menghentikan refresh dan alert;
untuk alert 24 jam pakai instance yang selalu aktif. Pasang `DATA_DIR` pada disk persisten agar state/cooldown tidak hilang.
Di Android: buka URL di Chrome, menu > "Instal aplikasi".

## Status fitur (hanya yang diuji = tercantum)
| Fitur | Status |
|---|---|
| Logika screener, FDV, filter kategori, join gecko_id, parser RSS, validasi unlock, aturan alert + cooldown, server + rate limit + path traversal, kegagalan sumber | **Diuji** (18 tes, sumber dimock) |
| Panggilan nyata ke CoinGecko, DeFiLlama, RSS | Jalankan `npm run live-check` di mesin ber-internet (tes API nyata). Telegram: belum diuji |
| Lonjakan volume | Estimasi dari selisih volume 24j bergulir antar refresh (~10 mnt) vs median selisih token itu sendiri; CoinGecko gratis tidak punya volume per-10-menit asli. Butuh ~1 jam riwayat sebelum aktif |
| Dashboard/PWA di perangkat Android | **Belum diuji di perangkat**; sintaks dan file statis diperiksa |
| Token unlock | **Butuh konfigurasi**: tidak ada sumber gratis terverifikasi. Isi `data/unlocks.json` atau `UNLOCKS_URL` (array `[{id (gecko id), symbol, date, amount_usd, pct_supply, source}]`) |
| Telegram | **Butuh konfigurasi**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| CoinGecko Demo key | Disarankan (`COINGECKO_DEMO_KEY`); cek ToS jika komersial |
| Makro/ekonomi global | **Belum ada** modul khusus; hanya lewat `NEWS_FEEDS` |

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
