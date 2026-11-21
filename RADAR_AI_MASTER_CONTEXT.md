# RADAR AI — MASTER PROJECT CONTEXT

> Dokumen pegangan utama proyek. Baca dokumen ini sebelum menjawab atau mengubah kode.
> Terakhir diperbarui: 22 November 2026 (Asia/Jakarta).
> Repository: https://github.com/rohman35819/radar-ai-v2
> Aplikasi: https://radar-ai-v2.hostless.app/

## 1. ATURAN WAJIB UNTUK ASISTEN / PENGEMBANG BERIKUTNYA

1. **Jangan mulai dari nol.** Baca dokumen ini, lalu periksa keadaan repository dan commit terbaru pada branch `main`.
2. Jangan menganggap catatan ini selalu paling baru. Verifikasi file dan commit aktual sebelum bekerja.
3. Sebelum mengedit, pahami file yang terkait dan dependensinya. Jangan menimpa file penuh hanya untuk perubahan kecil.
4. Pertahankan seluruh fitur, menu, route, desain, dan perilaku yang sudah ada kecuali pemilik secara eksplisit meminta perubahan.
5. Jangan melakukan refactor besar, menghapus menu, mengganti arsitektur, atau mengubah dependency tanpa alasan dan persetujuan yang jelas.
6. Jangan pernah mengarang bahwa tes, deploy, atau verifikasi live berhasil. Laporkan terpisah: kode di GitHub, build Hostless, dan versi Live.
7. Setelah setiap tugas: jalankan tes yang tersedia; periksa diff; commit perubahan; perbarui bagian STATUS, RIWAYAT, dan NEXT TASK dalam dokumen ini.
8. Jangan pernah menaruh API key, API secret, token, password, atau data sensitif di repository, frontend, log, atau dokumen ini.
9. Untuk API exchange: rahasia hanya di environment server. Jangan meminta pemilik menempelkan API Secret ke chat. Jangan mengaktifkan withdraw. Jangan aktifkan trading live tanpa persetujuan eksplisit dan kontrol risiko.
10. Bila konteks obrolan baru tidak memiliki akses GitHub, minta akses/konektor yang sesuai atau minta pemilik memberi file/diff. Jangan berpura-pura sudah membaca repository.

## 2. IDENTITAS & TUJUAN

RADAR AI V2 adalah workspace intelijen pasar crypto yang sedang dikembangkan bertahap. Tujuan produk: dashboard market screener, data fundamental/news/unlock, alert, analisis AI, dan satu Exchange Hub multi-exchange (Binance, Bybit, exchange lain menyusul).

Pemilik ingin pengembangan berkelanjutan lintas obrolan. Prioritas: stabilitas, UI yang rapi dan responsif, data akurat, keamanan kredensial, dan perubahan kecil yang teruji. Jangan mengorbankan fitur lama demi tampilan baru.

## 3. REPOSITORY & DEPLOYMENT

- GitHub: `rohman35819/radar-ai-v2`
- Branch kerja utama: `main`
- Hosting: Hostless
- URL Live yang diketahui: https://radar-ai-v2.hostless.app/
- Runtime: Node.js >= 20
- Start command: `npm start` (lihat package.json)
- Test command: `npm test`
- Tidak ada dependensi npm runtime yang dinyatakan di README.
- Persistent storage: README menyarankan `DATA_DIR` pada disk persisten agar state/cooldown tidak hilang.
- Catatan deploy terakhir yang dilaporkan pemilik: Hostless menampilkan Live `6f62d53` dan Building `17afb97`. Setelah itu commit perbaikan CSS `f47b487d9fc160dd7d036d6cda728acc198e8867` dibuat di GitHub. **Status deployment Hostless untuk commit `f47b487` belum diverifikasi.** Jangan klaim sudah live.

## 4. STATUS KODE TERAKHIR YANG DIKETAHUI

Commit penting:
- `17afb978d218814f915a8dd5f0c67da15b1c1b07`: perubahan sidebar dan fondasi Exchange Hub; perubahan ini sempat mengakibatkan `public/style.css` tertimpa menjadi file sangat pendek.
- `f47b487d9fc160dd7d036d6cda728acc198e8867`: memulihkan stylesheet asli dari baseline `6f62d53` dan menambahkan aturan scroll sidebar independen. Verifikasi fetch menunjukkan CSS berisi kembali aturan dashboard (mis. `.stats-grid`) dan aturan sidebar `overscroll-behavior:contain`.

File penting:
- `server.js`: HTTP server, route API, static file serving, rate limit, scheduled AI jobs.
- `public/index.html`: shell dashboard, sidebar dan navigasi.
- `public/app.js`: render halaman dashboard dan interaksi frontend.
- `public/style.css`: stylesheet utama dashboard dan sidebar.
- `public/trading.html`: Exchange Hub, tab Binance/Bybit, kalkulator simulasi, status koneksi.
- `public/trading.js`: interaksi tab dan kalkulator simulasi.
- `public/trading.css`: styling Exchange Hub.
- `lib/...`: modul sumber data, ingest, AI dan integrasi backend.
- `test/...`: tes otomatis.
- `.env.example`: daftar konfigurasi environment (jangan pernah commit nilai rahasia).

### Dashboard dan menu
Dashboard saat ini memiliki menu: Ringkasan, Market Screener, Watchlist, Analitik Pasar, Exchange Hub (tautan `/trading.html`), Command Center (tautan `/command.html`), News Feed, Token Unlock, Alert Center, AI Council, AI Workspace, dan System Health. Jangan hilangkan menu-menu ini saat mengubah sidebar.

### Sidebar
Permintaan pemilik: sidebar harus bisa discroll sendiri tanpa menggerakkan halaman/dashboard; saat dibuka di mobile, dashboard tetap terlihat/tertata; animasi harus halus. CSS perbaikan terakhir menambahkan tinggi viewport, overflow-y auto, overscroll containment, momentum scrolling, dan transisi drawer mobile. **Masih perlu verifikasi visual pada perangkat/Hostless setelah deploy.**

### Exchange Hub
- Satu halaman untuk Binance dan Bybit, dengan tab; exchange lain menyusul.
- Ada kalkulator posisi yang hanya simulasi.
- UI menyatakan read-only/belum terhubung.
- Belum boleh menganggap akun Binance/Bybit, saldo, posisi, atau order sudah terhubung.
- Belum ada order live yang boleh dikirim oleh halaman ini.
- API key Binance disebut pemilik telah disimpan di Hostless dengan izin **Enable Reading only**. Jangan minta secret dikirim lewat chat dan jangan mengubah izin menjadi trading/withdrawal tanpa alasan, pengujian dan persetujuan eksplisit.
- Integrasi private account endpoints belum selesai/terverifikasi. Fondasi UI bukan integrasi API.

## 5. FITUR BACKEND YANG TERTERA DI README / KODE

- Node HTTP server tanpa framework.
- API routes yang diketahui dari `server.js`: `GET /api/health`, `GET /api/snapshot`, `GET /api/ai/group`, `GET /api/ai/workspace`; admin-protected POST routes termasuk refresh dan AI actions.
- Data pasar/fundamental/news melalui modul ingest/sources.
- AI Council / group review dan AI Workspace memakai provider keys melalui environment.
- Watchlist disimpan lokal di browser.
- Token unlock membutuhkan sumber/configuration yang valid.
- Telegram dan CoinGecko Demo key adalah konfigurasi opsional menurut README.
- Bukan saran keuangan.

Jangan menganggap endpoint yang disebut di atas lengkap; baca `server.js` terbaru sebelum mengembangkan.

## 6. INSIDEN / BUG YANG HARUS DIINGAT

### A. EROFS saat refresh state
Pemilik pernah melaporkan error Hostless: `EROFS: read-only file system, open '••••/state.json.tmp'`.
Ini menunjukkan proses yang mencoba menulis file pada filesystem read-only, tetapi penyebab dan lokasi pastinya belum diverifikasi. README menyebut `DATA_DIR` untuk persistent storage; belum boleh diasumsikan bahwa Hostless sudah memasang volume atau bahwa semua kode menggunakan `DATA_DIR` dengan benar.
NEXT: periksa implementasi path state di modul ingest/storage dan konfigurasi Hostless. Pastikan direktori writable dan persisten. Jangan hapus state.json atau mengubah API key sebagai langkah coba-coba.

### B. Build Hostless lama
Pemilik melaporkan revisi `17afb97` tertahan di Building sekitar 16 menit, sementara deployment biasanya kurang dari satu menit. Tidak ada log build Hostless yang berhasil dibaca pada saat catatan ini dibuat. Jangan simpulkan EROFS adalah penyebab build lambat tanpa log. Periksa status/log deployment yang aktual.

### C. Stylesheet tertimpa
Pada revisi `17afb97`, stylesheet yang diambil dari GitHub hanya 702 byte, padahal baseline lama 16,976 byte. Ini menghapus banyak aturan desain dashboard. Perbaikan `f47b487` mengembalikan stylesheet dari baseline dan menambahkan aturan sidebar. Selalu periksa ukuran/diff dan isi file sebelum update besar.

## 7. ROADMAP / NEXT TASK (URUTAN PRIORITAS)

1. **Verifikasi deployment terbaru**: cek Hostless untuk commit `f47b487`. Jangan menganggap otomatis deploy hanya karena commit masuk `main`.
2. **QA dashboard setelah deploy**: pastikan semua menu tetap ada; dashboard render; tidak ada error console/network; CSS asli tampil; sidebar desktop/mobile scroll independen dan smooth.
3. **Audit state storage / EROFS**: baca implementasi `DATA_DIR`, file temporary `state.json.tmp`, dan konfigurasi volume Hostless. Buat perbaikan yang benar-benar berbasis kode/log.
4. **Audit Exchange Hub**: verifikasi endpoint market publik, lalu rancang koneksi Binance read-only server-side. Pastikan key hanya di environment Hostless dan tidak pernah masuk browser/log/repository.
5. Setelah Binance read-only teruji, rancang Bybit dengan pola keamanan yang sama.
6. Trading live bukan prioritas sampai koneksi read-only, testnet, validasi kuantitas/step size, SL/TP, reduce-only, idempotency, audit log, risk limit, dan kill switch selesai serta pemilik menyetujui.

## 8. PENGAMANAN TRADING (WAJIB)

Sebelum ada kemampuan order live:
- API secret hanya di server-side environment/secret store.
- Tidak ada withdraw permission.
- Default trading OFF; eksplisit opt-in.
- Testnet terlebih dahulu.
- Validasi symbol, tick size, step size, min notional, margin, leverage, posisi, dan mode akun.
- Validasi SL/TP dan close reduce-only.
- Idempotency agar retry tidak menggandakan order.
- Batas risiko/ukuran order, kill switch, audit log, dan error handling.
- Tampilkan biaya, funding, slippage, liquidation estimate dengan asumsi jelas.
- Minta persetujuan eksplisit pemilik sebelum mengaktifkan live trading.

## 9. CHECKLIST SEBELUM COMMIT / DEPLOY

- [ ] Baca file yang disentuh dan dependensinya.
- [ ] Pastikan tidak ada menu/fitur lama yang hilang.
- [ ] Jalankan `npm test` atau jelaskan jika tidak dapat dijalankan.
- [ ] Jalankan `node --check` untuk JS yang berubah jika relevan.
- [ ] Periksa `git diff` / perbandingan file untuk memastikan tidak ada overwrite tak sengaja.
- [ ] Pastikan tidak ada secret dalam diff.
- [ ] Commit ke branch yang benar.
- [ ] Catat SHA commit.
- [ ] Verifikasi Hostless build dan Live secara terpisah; jangan klaim tanpa bukti.

## 10. FORMAT UPDATE SETELAH SETIAP PEKERJAAN

Perbarui dokumen ini dengan:
- Tanggal.
- Perubahan yang dibuat dan alasan.
- File yang berubah.
- Hasil test (lulus/gagal/tidak dijalankan).
- Commit SHA.
- Status deployment Hostless (Building/Failed/Live/tidak diketahui).
- Bug yang masih terbuka.
- NEXT TASK berikutnya.

## 11. PROMPT PEMBUKA OBROLAN BARU

Gunakan pesan ini saat membuka obrolan baru:

> Kita melanjutkan proyek RADAR AI V2, bukan membuat proyek baru. Baca `RADAR_AI_MASTER_CONTEXT.md` dari repository `rohman35819/radar-ai-v2` terlebih dahulu. Setelah itu periksa branch `main`, commit terbaru, dan file yang relevan sebelum bertindak. Ikuti aturan wajib dalam dokumen. Jangan minta saya menjelaskan ulang hal yang sudah tercatat. Lanjutkan dari bagian NEXT TASK. Jangan mengklaim tes/deploy/live berhasil tanpa verifikasi. Setelah bekerja, perbarui dokumen master ini.

---

## 12. KEBIJAKAN PENGEMBANGAN JANGKA PANJANG — V2 SAMPAI V3

Bagian ini adalah aturan permanen proyek. Berlaku untuk semua obrolan, sesi pengembangan, kontributor AI/manusia, perubahan fitur, perbaikan, rilis, dan pergantian versi sampai RADAR AI V3 dirilis. Jangan menganggapnya selesai atau kedaluwarsa hanya karena satu task selesai.

### 12.1 Kesinambungan tanpa mengulang dari nol
1. RADAR AI adalah satu produk berkelanjutan. Setiap obrolan baru yang memiliki akses repository wajib membaca dokumen master ini dan `AGENTS.md`, lalu memeriksa kondisi aktual branch `main`, commit terbaru, dan file relevan.
2. Gunakan riwayat Project/percakapan sebagai konteks tambahan bila tersedia. Jangan meminta pemilik mengulang informasi yang sudah ada di dokumen atau riwayat yang dapat diakses.
3. Jika akses GitHub atau sumber konteks tidak tersedia, katakan dengan jelas apa yang tidak dapat dibaca. Jangan mengaku sudah memeriksa sesuatu yang belum diakses.
4. Setelah memahami status, langsung lanjutkan NEXT TASK yang paling relevan. Jangan mengulang audit dari awal tanpa alasan teknis.

### 12.2 Dokumentasi otomatis adalah bagian dari setiap pekerjaan
Setiap perubahan bermakna pada kode, konfigurasi, arsitektur, UI/UX, integrasi, keamanan, pengujian, atau deployment WAJIB diikuti pembaruan dokumen dalam siklus kerja yang sama:
- `RADAR_AI_MASTER_CONTEXT.md`: status terbaru, keputusan, progres, risiko, tes, commit, deployment, dan NEXT TASK.
- `AGENTS.md`: hanya jika aturan kerja permanen berubah atau perlu diperjelas.
- `README.md`: jika cara instalasi, konfigurasi, fitur publik, API, atau operasi pengguna berubah.
- Catatan rilis/changelog: jika perubahan layak menjadi catatan versi.

Jangan menunggu pemilik meminta dokumentasi. Jangan menulis status yang belum terbukti. Catat juga bila tes tidak dapat dijalankan dan alasannya.

### 12.3 Riwayat dan keputusan tidak boleh hilang
- Pertahankan riwayat keputusan penting, insiden, perubahan arsitektur, dan alasan teknis.
- Tambahkan entri bertanggal untuk perubahan penting. Jika keputusan diganti, tandai keputusan lama sebagai superseded dan tulis keputusan penggantinya; jangan diam-diam menghapus jejak.
- Sinkronkan master context, AGENTS, README, changelog, dan implementasi. Jika berbeda, verifikasi kode aktual lalu perbaiki dokumentasi.
- Jangan memasukkan API key, API secret, token, password, data pribadi, atau kredensial ke dokumentasi.

### 12.4 Standar perubahan dan kualitas
- Pahami dampak sebelum mengedit. Buat perubahan sekecil mungkin yang menyelesaikan masalah.
- Pertahankan fitur lama, route, kontrak API, data, dan alur kerja. Jangan melakukan refactor besar atau breaking change tanpa alasan kuat dan persetujuan pemilik.
- Jalankan tes yang relevan, pemeriksaan sintaks, dan pemeriksaan diff. Periksa penghapusan tak sengaja, kebocoran secret, kompatibilitas, dan regresi.
- Laporkan hasil faktual: berhasil, gagal, atau tidak dijalankan beserta alasan.
- Catat commit SHA yang benar. Bedakan tegas status GitHub, Hostless Building/Failed, dan Hostless Live yang sudah diverifikasi.
- Jika akses Hostless tidak tersedia, lanjutkan pekerjaan repository yang aman, catat blocker, dan jangan mengklaim deployment terverifikasi.

### 12.5 Keamanan exchange dan perlindungan dana
- Secret hanya berada di server-side environment/secret store; tidak boleh berada di frontend, GitHub, log, screenshot, atau chat.
- Tidak ada izin withdrawal.
- Koneksi read-only harus dibuktikan sebelum fitur private account dianggap selesai.
- Trading live selalu OFF secara default. Tidak boleh mengirim order atau melakukan tindakan finansial tanpa persetujuan eksplisit pemilik dan seluruh kontrol keselamatan yang relevan.
- Testnet, validasi order, SL/TP, reduce-only, idempotency, batas risiko, kill switch, audit log, dan rollback wajib disiapkan sebelum mempertimbangkan live trading.

### 12.6 Jalur evolusi V2 menuju V3
V3 adalah evolusi RADAR AI yang sama, bukan proyek baru dan bukan alasan untuk membuang hasil V2.
1. Pertahankan V2 sebagai baseline stabil dan catat versi/commit terakhir yang diketahui baik.
2. Sebelum memulai V3, dokumentasikan fitur V2, arsitektur, API/data contract, konfigurasi, penyimpanan data, keterbatasan, bug terbuka, dan keputusan yang masih berlaku.
3. Kembangkan V3 pada branch terpisah atau direktori/struktur versi yang terisolasi. Jangan merusak aplikasi V2 yang masih digunakan.
4. Tentukan perubahan skema dan migrasi data secara eksplisit. Sediakan backup, uji migrasi, kompatibilitas, dan rencana rollback sebelum perpindahan.
5. Buat daftar acceptance criteria V3 yang dapat diuji. Uji fungsi inti, keamanan, performa, UI desktop/mobile, integrasi, dan pemulihan data.
6. Jangan mengganti versi Live ke V3 sampai kriteria penerimaan terpenuhi, jalur rollback siap, dan pemilik menyetujui rilis.
7. Setelah V3 dirilis, pertahankan catatan V2 sebagai arsip baseline dan terus gunakan master context ini untuk kesinambungan lintas versi.

### 12.7 Format catatan riwayat
Untuk setiap pekerjaan penting, tambahkan ringkasan dengan format:
- Tanggal (Asia/Jakarta):
- Tujuan:
- Perubahan dan file:
- Tes/check dan hasil:
- Commit SHA:
- GitHub:
- Hostless build:
- Hostless Live:
- Risiko/bug terbuka:
- NEXT TASK:

### 12.8 Definisi selesai untuk setiap task
Task belum dianggap selesai hanya karena kode telah ditulis. Selesai berarti perubahan relevan sudah diuji sejauh akses memungkinkan, diff diperiksa, dokumentasi diperbarui, commit dicatat, status deployment dinyatakan secara jujur, dan NEXT TASK ditinggalkan dengan jelas.

### 12.9 Catatan penerapan aturan
Aturan jangka panjang ini ditambahkan pada 22 November 2026. Aturan berlaku untuk pengembangan berikutnya sampai RADAR AI V3 keluar dan tetap menjadi pedoman kesinambungan setelah rilis V3.

---
## 13. AUDIT LANJUTAN — 22 NOVEMBER 2026 (ASIA/JAKARTA)

### 13.1 Verifikasi repository dan CI
- Branch default repository terkonfirmasi main; commit terbaru saat audit: 8e5c3cab154c547176c71c11de48a319cf431e0c (docs: define RADAR AI V2 to V3 continuity policy).
- GitHub Actions workflow RADAR AI tests untuk commit tersebut berstatus completed / success (run #114, 21 November 2026 19:51:21 UTC). Ini bukti CI untuk commit tersebut; bukan hasil menjalankan tes lokal pada sesi ini.
- package.json menyediakan npm test (syntax check server/app/AI + Node test runner) dan npm run live-check.
- Ukuran stylesheet public/style.css pada main terverifikasi 17,565 byte; file tidak lagi berada pada kondisi terpotong 702 byte yang tercatat pada insiden sebelumnya.

### 13.2 Hasil audit penyimpanan / EROFS
- lib/ingest.js membaca DATA_DIR melalui path.resolve(env('DATA_DIR', './data')).
- load() membaca state.json; semua error baca/parse ditangkap dan menghasilkan emptyState(). Dampak: kegagalan baca atau JSON rusak tidak dibedakan dari state baru pada log/status.
- save() menjalankan fs.mkdirSync(dataDir, { recursive: true }), menulis state.json.tmp, lalu fs.renameSync(tmp, state.json). Tidak ada pengecekan writable pada startup dan tidak ada fallback jika filesystem read-only.
- Tes integrasi yang ada menulis ke direktori sementara OS (fs.mkdtempSync); tes tersebut membuktikan alur save pada filesystem lokal yang writable, bukan mount Hostless.
- Kesimpulan: implementasi mendukung konfigurasi DATA_DIR, tetapi error EROFS tetap mungkin bila Hostless tidak memasang direktori tersebut sebagai volume writable. Belum ada bukti yang menentukan path atau konfigurasi volume Hostless yang salah. Jangan melakukan fallback ke direktori ephemeral atau menghapus state sebagai solusi.
- Perbaikan berikutnya perlu didasarkan pada lokasi volume Hostless yang benar dan log runtime. Setelah itu tambahkan tes untuk kegagalan tulis/rename dan observabilitas error storage tanpa membocorkan data sensitif.

### 13.3 Status deployment dan QA visual
- Akses Hostless dashboard/log/deployment tidak tersedia melalui koneksi yang ada pada sesi audit.
- Pemeriksaan halaman publik dan /api/health melalui sumber web juga tidak berhasil diakses. Karena itu status Hostless build dan versi Live tetap tidak diketahui / belum terverifikasi.
- Tidak ada klaim bahwa commit f47b487 atau commit terbaru telah LIVE. QA visual desktop/mobile, console, dan network masih menunggu akses browser/deployment Hostless yang dapat diverifikasi.
- GitHub Actions CI hijau tidak membuktikan deployment Hostless.

### 13.4 Catatan sesi
- Tujuan: melanjutkan NEXT TASK dengan memverifikasi repository, CI, dan meninjau jalur storage aktual.
- File kode ditinjau: package.json, server.js, lib/ingest.js, scripts/live-check.js, test/radar.test.js, .env.example, public/style.css.
- File dokumentasi: RADAR_AI_MASTER_CONTEXT.md, AGENTS.md, README.md.
- Perubahan kode: tidak ada. Perubahan sesi ini hanya catatan audit dalam dokumen master.
- Tes lokal: tidak dijalankan karena sesi ini tidak memiliki working copy/runtime repository. CI GitHub untuk commit 8e5c3cab lulus.
- Commit dokumentasi audit utama: 20aa7a95c20d51625f44759f01b6df8df3c04549.
- GitHub: temuan audit tersimpan pada branch main. Referensi metadata audit diperbarui pada commit a1ee1fc2eba2c376b6986d21be4ddba66ba04a15.
- Hostless build: tidak diketahui.
- Hostless Live: tidak diketahui / belum diverifikasi.
- Risiko terbuka: volume writable Hostless dan penyebab EROFS belum diketahui; halaman live dan UI belum dapat diuji.
- NEXT TASK:
  1. Dapatkan bukti status deployment Hostless untuk commit f47b487 dan commit terbaru; periksa build log serta URL live.
  2. Jalankan QA visual dashboard/sidebar desktop dan mobile setelah deployment terkonfirmasi.
  3. Konfirmasi mount volume Hostless dan nilai DATA_DIR (tanpa membagikan secret); lalu perbaiki storage secara terukur dan tambahkan tes untuk kondisi filesystem gagal.
  4. Lanjutkan audit Exchange Hub dan Binance read-only setelah prioritas di atas selesai.


---
## 14. PERBAIKAN STORAGE & QA SOURCE — 22 NOVEMBER 2026 (ASIA/JAKARTA)

### 14.1 Perbaikan DATA_DIR / EROFS
- Pemeriksaan ulang branch main menemukan implementasi `DATA_DIR` tetap menggunakan `path.resolve(env('DATA_DIR', './data'))`; belum ada bukti mount volume Hostless atau nilai runtime `DATA_DIR`.
- `lib/ingest.js`: `load()` sekarang hanya memperlakukan `ENOENT` pada `state.json` sebagai instalasi baru. Error lain (termasuk EACCES, EIO, EROFS) dan JSON tidak valid diteruskan agar tidak disamarkan menjadi state kosong.
- `save()` tetap menggunakan pola tulis file sementara lalu atomic rename di direktori DATA_DIR yang sama. Bila tulis/rename gagal, error diteruskan dan file sementara dibersihkan best-effort; tidak ada fallback ke filesystem ephemeral dan file state lama tidak ditimpa sebelum rename berhasil.
- Tes baru di `test/radar.test.js`: state belum ada, state valid dipulihkan, JSON rusak ditolak, simulasi EROFS saat rename diteruskan, state lama tetap utuh, dan file sementara dibersihkan. Jumlah kasus pada file tes menjadi 21.
- `README.md` diperbarui dari 18 menjadi 21 tes dan menyebut cakupan storage.
- Perubahan kode: commit `1a0041dc8cb7c2b295bc0f5d3754583b75a4f215`; tes: `c64bc60dc3330b81a603e92474be6a35e083b520`.

### 14.2 QA Dashboard dan Exchange Hub (review source)
- Dashboard: semua menu yang didokumentasikan masih ada di `public/index.html` (Ringkasan, Market Screener, Watchlist, Analitik Pasar, Exchange Hub, Command Center, News Feed, Token Unlock, Alert Center, AI Council, AI Workspace, System Health). `public/app.js` masih memasang navigasi, refresh, theme, dan mobile menu; CSS memuat breakpoint tablet/mobile serta sidebar fixed dengan scroll vertikal independen dan overscroll containment.
- `public/style.css` terambil utuh (17,563 karakter dari konten UTF-8 yang di-fetch); tidak kembali menjadi stylesheet terpotong. Review source tidak dapat membuktikan tampilan aktual, overflow di perangkat, console, atau network.
- Exchange Hub: tab Binance/Bybit, kalkulator simulasi, penanganan input tidak valid, dan disclosure bahwa belum ada koneksi akun/order live ditemukan pada `public/trading.html/js/css`. Tidak ditemukan panggilan API akun/private endpoint atau order pada file UI yang ditinjau. Koneksi Binance read-only belum boleh dinyatakan selesai.
- QA visual/browser desktop dan mobile belum dijalankan karena akses browser/Hostless tidak tersedia dalam sesi ini. Ini dicatat sebagai batas verifikasi, bukan lulus QA visual.

### 14.3 Hasil pengujian dan deployment
- Tes lokal belum dijalankan: sesi tidak memiliki working copy/runtime repository. Tes regresi storage ditambahkan agar GitHub Actions `npm test` dapat mengeksekusinya setelah push.
- Pemeriksaan CI commit baru melalui status-check connector belum menampilkan status (daftar status kosong); workflow run untuk commit juga tidak dikembalikan oleh endpoint connector yang tersedia. Karena itu CI untuk perubahan ini belum terverifikasi.
- GitHub: perubahan storage, tes, README, dan master context tersimpan pada branch `main`. Commit README: `b104dcaf3f576421220ceaf2e4afc84b356a1cd3`; commit master context pertama sesi ini: `2a7c4ea40b30cb041b8e545f14a95b2041c8045e`; sinkronisasi lanjutan: `1cf7e1789bca49a332bcc08cb5c87cd24d033053`.
- Hostless build: tidak diketahui. Pemilik mengonfirmasi mekanisme auto-deploy dari `main`; tidak ada akses status/log Hostless pada sesi ini.
- Hostless Live: tidak diketahui / belum diverifikasi. Belum ada pemeriksaan sukses terhadap homepage atau `/api/health` yang dapat dikaitkan dengan SHA terbaru.

### 14.4 Risiko dan NEXT TASK
- Risiko tersisa: lokasi volume writable dan nilai `DATA_DIR` runtime Hostless belum terbukti; bila tidak dipasang ke volume persisten yang writable, EROFS tetap akan muncul dengan pesan error yang kini tidak lagi disamarkan.
- NEXT TASK:
  1. Verifikasi CI `npm test` untuk commit terbaru di GitHub Actions.
  2. Verifikasi Hostless build dan versi LIVE terhadap SHA `main` terbaru; kemudian lakukan QA visual dashboard/sidebar dan Exchange Hub di desktop/mobile.
  3. Audit konfigurasi Hostless untuk memastikan `DATA_DIR` menunjuk ke mount persisten writable; jangan ubah path tanpa bukti konfigurasi volume.
  4. Setelah storage dan UI stabil, lanjutkan implementasi Binance read-only server-side dan uji tanpa mengaktifkan trading.


---
## 15. VERIFIKASI LANJUTAN CI & AKSES LIVE — 22 NOVEMBER 2026 (ASIA/JAKARTA)

### 15.1 Repository dan CI
- Branch `main` diperiksa langsung melalui GitHub API; HEAD terkonfirmasi `6278e19708017c488bf780648e29b5098b702c9b` (docs: record exact audit documentation commits).
- GitHub Actions run #123 untuk SHA tersebut: status `completed`, conclusion `success`; job `test` dan langkah `Run npm test` juga `completed / success` (run ID `44944757638`, 21 November 2026 20:09 UTC).
- Ini membuktikan workflow menjalankan `npm test` dan lulus pada commit HEAD. Tes lokal tetap tidak dijalankan karena sesi tidak memiliki working copy/runtime repository.
- Pemeriksaan ulang source menunjukkan perbaikan storage pada `lib/ingest.js` masih berlaku: hanya ENOENT yang menjadi state kosong; error baca lain diteruskan; penyimpanan memakai temporary file + rename atomik dan cleanup best-effort. Tes storage tercakup dalam `test/radar.test.js`.
- Dashboard dan Exchange Hub source masih memuat menu/tab serta kalkulator simulasi; tidak ditemukan implementasi private account endpoint/order live di `public/trading.js`. Ini source review, bukan QA browser.

### 15.2 Hostless / LIVE
- Upaya membuka `https://radar-ai-v2.hostless.app/` dari sesi ini gagal karena akses web ke host dinonaktifkan oleh lingkungan (DisabledError). Endpoint `/api/health` juga belum dapat diverifikasi.
- Endpoint deployment Hostless tidak tersedia melalui koneksi GitHub yang digunakan. Status Hostless build dan SHA yang sedang LIVE tetap **tidak diketahui / belum terverifikasi**. CI GitHub sukses tidak membuktikan deploy Hostless.
- Tidak ada perubahan kode aplikasi pada sesi verifikasi ini; tidak ada klaim QA visual desktop/mobile, console, network, atau runtime storage.

### 15.3 Catatan sesi dan NEXT TASK
- Tujuan: lanjutkan NEXT TASK dengan verifikasi CI terbaru dan pemeriksaan ulang jalur storage, Dashboard, serta Exchange Hub.
- File source ditinjau: `lib/ingest.js`, `test/radar.test.js`, `server.js`, `public/index.html`, `public/app.js`, `public/style.css`, `public/trading.html`, `public/trading.js`, `public/trading.css`, `package.json`, `README.md`, `AGENTS.md`.
- File yang diubah: `RADAR_AI_MASTER_CONTEXT.md` (catatan verifikasi ini saja).
- Tes: GitHub Actions `npm test` PASS pada HEAD; tes lokal tidak dijalankan.
- Commit dokumentasi sesi: `421bca232444067c20398d0b176120e868b86047` (catatan audit bagian ini).
- Hostless build: tidak diketahui. Hostless Live: tidak diketahui / belum terverifikasi.
- Risiko terbuka: bukti konfigurasi volume writable dan nilai `DATA_DIR` runtime Hostless belum tersedia; QA visual/browser belum dapat dilakukan; koneksi Binance read-only belum diimplementasikan/teruji.
- NEXT TASK:
  1. Dapatkan akses/status Hostless untuk memastikan build dan SHA Live; lakukan QA browser dashboard/sidebar dan Exchange Hub desktop/mobile.
  2. Verifikasi mount volume persisten writable dan nilai `DATA_DIR` runtime sebelum perubahan konfigurasi storage.
  3. Setelah storage dan UI terverifikasi, implementasikan Binance read-only server-side dengan secret tetap di environment dan uji tanpa mengaktifkan trading.


---
## 16. AUDIT KELANJUTAN REPOSITORY & AKSES HOSTLESS — 22 NOVEMBER 2026 (ASIA/JAKARTA)

### 16.1 Kondisi repository terkini
- Repository terkonfirmasi `rohman35819/radar-ai-v2`, default branch `main`.
- HEAD kode/dokumentasi sebelum catatan sesi ini: `5ade61c8b693324716330eca1614f2d7b590cabe` (docs: finalize audit commit reference). Setelah audit didokumentasikan, commit baru dibuat pada main: `270c61ef834eab86762dfc18f3a8674021f60e71`.
- `RADAR_AI_MASTER_CONTEXT.md`, `AGENTS.md`, `package.json`, dan `README.md` dibaca dari branch main. File kode `lib/ingest.js` dan `server.js` juga diperiksa ulang.
- Repository tidak memiliki working copy lokal dalam sesi ini; tes lokal dan git diff lokal tidak dapat dijalankan.

### 16.2 Status CI untuk HEAD terbaru
- Pemeriksaan combined commit status pada SHA `5ade61c8b693324716330eca1614f2d7b590cabe` mengembalikan daftar status kosong.
- Endpoint konektor workflow-run yang tersedia mengembalikan daftar kosong; keterbatasan endpoint ini tercatat hanya mencakup run yang dipicu pull request. Karena itu hasil tersebut TIDAK membuktikan bahwa workflow push tidak berjalan atau gagal.
- Hasil GitHub Actions `npm test` PASS yang tercatat sebelumnya berlaku untuk SHA `6278e19708017c488bf780648e29b5098b702c9b`, bukan otomatis untuk HEAD terbaru `5ade61c`.
- Kesimpulan: CI untuk HEAD terbaru belum terverifikasi. Jangan membawa status PASS commit sebelumnya ke HEAD baru tanpa bukti.

### 16.3 Hostless: jalur akses dan batas verifikasi
- Homepage `https://radar-ai-v2.hostless.app/` dan `/api/health` dicoba melalui akses web; keduanya tidak berhasil diambil oleh lingkungan ini. Ini bukan bukti bahwa aplikasi down.
- Dokumentasi Hostless resmi yang ditemukan menjelaskan MCP remote di `https://mcp.hostless.app`: endpoint dokumentasi publik `/mcp/docs`, sedangkan pengelolaan resource memakai `/mcp` yang memerlukan autentikasi dan scope akun.
- Dokumentasi API Hostless menjelaskan API key dengan scope terpisah. Pembacaan app/deployment/log memerlukan izin read yang sesuai; token harus tetap privat dan tidak boleh ditempelkan di chat atau repository.
- Tidak ada konektor Hostless terpasang/tersedia di sesi ini dan tidak ada kredensial Hostless yang dapat digunakan. Tidak ada upaya menebak, meminta, atau mengubah konfigurasi rahasia.
- Status Hostless build, deployment SHA, runtime logs, mount volume, nilai `DATA_DIR`, serta versi LIVE tetap tidak diketahui / belum terverifikasi. Tidak ada klaim QA visual desktop/mobile.

### 16.4 Audit kode berkelanjutan
- `lib/ingest.js` dikonfirmasi masih menggunakan `DATA_DIR` (default `./data`), memperlakukan hanya `ENOENT` sebagai state baru, meneruskan error baca lain, dan menyimpan melalui temporary file + atomic rename.
- `server.js` memanggil `ingest.load(cfg)` saat membuat aplikasi; refresh dan job AI menyimpan state melalui `ingest.save(cfg, st)`. Dengan demikian kesalahan mount/path akan muncul pada jalur startup atau operasi simpan dan harus ditangani berdasarkan runtime logs serta konfigurasi volume Hostless.
- Tidak ada perubahan kode aplikasi pada sesi audit ini. Tidak ada alasan aman untuk mengganti path DATA_DIR tanpa bukti mount volume Hostless.

### 16.5 Catatan sesi dan NEXT TASK
- Tujuan: melanjutkan verifikasi CI dan deployment Hostless sesuai NEXT TASK sebelumnya.
- File yang ditinjau: `RADAR_AI_MASTER_CONTEXT.md`, `AGENTS.md`, `package.json`, `README.md`, `lib/ingest.js`, `server.js`.
- File yang diubah: `RADAR_AI_MASTER_CONTEXT.md` (catatan audit sesi ini).
- Tes: tidak dijalankan lokal karena working copy/runtime tidak tersedia. CI HEAD terbaru belum terverifikasi. Hasil PASS sebelumnya hanya untuk SHA yang disebut pada bagian 15.
- Commit dokumentasi sesi: `270c61ef834eab86762dfc18f3a8674021f60e71` (audit bagian 16).
- Hostless build: tidak diketahui. Hostless Live: tidak diketahui / belum terverifikasi.
- GitHub: catatan audit bagian 16 tersimpan pada branch `main` melalui commit `270c61ef834eab86762dfc18f3a8674021f60e71`; setelah commit dokumentasi ini, HEAD main berubah ke SHA tersebut.
- Risiko terbuka: akses Hostless authenticated read-only belum tersedia; CI HEAD terbaru belum terverifikasi; volume writable dan nilai runtime `DATA_DIR` belum diketahui; QA browser desktop/mobile belum dilakukan.
- NEXT TASK:
  1. Hubungkan akses Hostless read-only yang sesuai (MCP atau API) agar deployment, app config tanpa nilai secret, runtime logs, dan volume dapat diperiksa. Jangan kirim API key melalui chat.
  2. Verifikasi GitHub Actions `npm test` secara spesifik untuk SHA HEAD `5ade61c8b693324716330eca1614f2d7b590cabe` atau HEAD terbaru saat pemeriksaan berikutnya.
  3. Setelah ada akses Hostless, cocokkan SHA deployment, status build, dan versi LIVE; cek `/api/health`, dashboard, sidebar, serta Exchange Hub pada desktop dan mobile.
  4. Periksa mount volume dan nilai `DATA_DIR` runtime tanpa mengekspos nilai rahasia; baru lakukan perubahan storage bila ada bukti teknis.
  5. Setelah storage dan UI terverifikasi stabil, lanjutkan implementasi Binance read-only server-side. Trading tetap OFF.


---
## 17. VERIFIKASI CI HEAD TERBARU — 22 NOVEMBER 2026 (ASIA/JAKARTA)

### 17.1 Repository dan CI
- Branch `main` diperiksa melalui GitHub API; HEAD terkonfirmasi `724d4a6d930749f63516105ccb27032f5154d9e4` (docs: finalize Hostless audit commit record), parent `270c61ef834eab86762dfc18f3a8674021f60e71`.
- GitHub Actions run #127 (run ID `44948166299`) untuk SHA HEAD tersebut berstatus `completed / success`; job `test` dan langkah `Run npm test` juga `completed / success` pada 21 November 2026 20:48 UTC.
- Dengan demikian CI `npm test` untuk HEAD aktual `724d4a6` terverifikasi PASS. Ini menggantikan status CI-belum-terverifikasi yang dicatat pada bagian 16 untuk HEAD sebelumnya `5ade61c`; catatan historis bagian 16 tetap dipertahankan.
- Workflow `.github/workflows/test.yml` menjalankan Node.js 24 dan `npm test` pada push ke `main` serta pull request. `package.json` mengonfirmasi tes mencakup pemeriksaan sintaks server/frontend/AI dan Node test runner.

### 17.2 Audit storage dan batas QA
- Source `lib/ingest.js` diperiksa ulang pada HEAD: `DATA_DIR` tetap dibaca melalui `path.resolve(env('DATA_DIR', './data'))`; hanya `ENOENT` saat load yang diperlakukan sebagai state baru; error lain diteruskan; save memakai temporary file dan atomic rename serta cleanup best-effort.
- Tes `test/radar.test.js` mencakup pemulihan state, JSON rusak, simulasi EROFS saat rename, preservasi state lama, dan penghapusan temporary file. Tes ini berjalan dalam CI pada HEAD tersebut; ia tidak membuktikan mount volume Hostless writable/persisten.
- Source review Dashboard dan Exchange Hub sebelumnya tetap menjadi bukti pemeriksaan struktur kode saja. Tidak ada browser QA desktop/mobile, console/network inspection, atau validasi visual pada sesi ini.
- Homepage Hostless dan `/api/health` kembali tidak dapat diambil dari lingkungan ini (cache miss / URL tidak accessible). Ini bukan bukti aplikasi down. Status build Hostless, deployment SHA, runtime logs, mount volume, nilai runtime `DATA_DIR`, dan versi LIVE tetap tidak diketahui / belum terverifikasi.

### 17.3 Catatan sesi dan NEXT TASK
- Tujuan: menuntaskan verifikasi CI untuk HEAD aktual dan melanjutkan audit storage/QA tanpa mengulang pekerjaan sebelumnya.
- File source ditinjau ulang: `package.json`, `lib/ingest.js`, `test/radar.test.js`, `.github/workflows/test.yml`, serta metadata branch dan Actions run.
- File kode aplikasi diubah: tidak ada. Dokumentasi yang diubah: `RADAR_AI_MASTER_CONTEXT.md`.
- Tes lokal: tidak dijalankan karena sesi tidak memiliki working copy/runtime repository. GitHub Actions `npm test`: PASS pada SHA `724d4a6d930749f63516105ccb27032f5154d9e4` (run #127).
- GitHub HEAD sebelum catatan sesi ini: `724d4a6d930749f63516105ccb27032f5154d9e4`; commit dokumentasi sesi dicatat setelah commit.
- Commit dokumentasi hasil verifikasi CI bagian 17: `8e166a6697ffe2d920fe31b9f3af06ab945b3861`; commit sinkronisasi catatan SHA ini menyusul.
- Hostless build: tidak diketahui. Hostless Live: tidak diketahui / belum diverifikasi.
- Risiko terbuka: belum ada akses Hostless authenticated read-only; mount volume writable/persisten dan runtime `DATA_DIR` belum terbukti; QA visual/browser desktop/mobile belum dilakukan; koneksi Binance read-only belum diimplementasikan/teruji.
- NEXT TASK:
  1. Hubungkan Hostless MCP/API read-only melalui mekanisme koneksi akun yang aman; jangan mengirim API key/token melalui chat. Periksa deployment SHA, build, logs, konfigurasi `DATA_DIR` (tanpa nilai rahasia), dan volume.
  2. Verifikasi endpoint `/api/health` dan versi LIVE terhadap SHA main; lakukan QA browser dashboard/sidebar dan Exchange Hub pada desktop/mobile.
  3. Pastikan lokasi volume persisten writable sebelum mengubah `DATA_DIR`; uji restart/persistensi dan EROFS berdasarkan log aktual.
  4. Setelah storage dan UI stabil, lanjutkan Binance read-only server-side. Trading tetap OFF.


---
## 18. AUDIT LANJUTAN DASHBOARD, EXCHANGE HUB, DAN HEAD MAIN — 22 NOVEMBER 2026 (ASIA/JAKARTA)

### 18.1 Repository dan commit
- Pemeriksaan branch mengembalikan branch `main`; pencarian commit terbaru pada repository menemukan `327ad19753cafdc523b18d61a65307128de7dab5` (`docs: record CI audit commit reference`, 21 November 2026 20:48:43 UTC).
- Fetch commit mengonfirmasi perubahan commit tersebut hanya satu baris dokumentasi di `RADAR_AI_MASTER_CONTEXT.md`, dengan parent `724d4a6d930749f63516105ccb27032f5154d9e4`. Jadi tidak ada perubahan source aplikasi di antara dua SHA itu.
- Combined commit status untuk `327ad197` mengembalikan daftar status kosong. Ini bukan bukti CI gagal maupun berhasil. Ketersediaan API GitHub yang terhubung tidak menyediakan listing workflow push-run terbaru; CI untuk `327ad197` tetap belum terverifikasi.

### 18.2 Audit storage / EROFS
- `lib/ingest.js` pada `main` tetap memakai `path.resolve(env('DATA_DIR', './data'))`, hanya memperlakukan `ENOENT` saat load sebagai state awal, dan meneruskan error lain. Save menggunakan `state.json.tmp`, atomic rename, dan cleanup best-effort.
- Tes `test/radar.test.js` masih memuat skenario state awal, pemulihan state, JSON rusak, simulasi EROFS saat rename, preservasi state lama, dan cleanup file sementara.
- Tidak ada bukti baru mengenai mount volume Hostless atau nilai runtime `DATA_DIR`; tidak dilakukan perubahan path atau fallback karena berisiko memindahkan state ke filesystem ephemeral.

### 18.3 QA source-level Dashboard
- `public/index.html` mempertahankan struktur shell dashboard dan navigasi; `public/app.js` menjadi pengendali render/interaksi; `public/style.css` berisi stylesheet dashboard lengkap serta aturan sidebar independen.
- CSS pada `main` memuat `height:100vh/100dvh`, `overflow-y:auto`, `overscroll-behavior:contain`, momentum scrolling, dan drawer overlay pada breakpoint mobile. Ini mengonfirmasi implementasi CSS ada, bukan bukti visual atau perilaku runtime.
- Tidak ditemukan perubahan source Dashboard pada commit terbaru yang diperiksa. QA browser desktop/mobile, console, network, dan verifikasi menu melalui runtime masih belum dilakukan.

### 18.4 QA source-level Exchange Hub
- `public/trading.html`, `public/trading.js`, dan `public/trading.css` membentuk Exchange Hub dengan tab Binance/Bybit, kalkulator posisi simulasi, status koneksi belum terhubung, dan daftar gerbang keamanan.
- `public/trading.js` hanya menghitung estimasi notional, kuantitas, PnL pada SL/TP, dan risk/reward di browser. Tidak ditemukan pemanggilan endpoint akun/private API atau pengiriman order pada file ini; UI secara eksplisit menyatakan belum terhubung dan tidak mengirim order.
- Kalkulator menyederhanakan kontrak sebagai notional linear dan telah menampilkan catatan bahwa fee, funding, slippage, aturan ukuran kontrak, dan estimasi likuidasi belum dihitung. Hasilnya tidak boleh diperlakukan sebagai kalkulasi exchange yang presisi.
- Tidak ada implementasi koneksi Binance read-only yang dapat dinyatakan selesai berdasarkan source yang diperiksa. API key/secret tidak diperiksa atau ditampilkan; tidak ada perubahan kredensial.

### 18.5 Catatan sesi dan NEXT TASK
- Tujuan: melanjutkan audit repository terbaru dan memeriksa ulang jalur storage, Dashboard, serta Exchange Hub tanpa mengubah perilaku yang belum dapat diuji.
- File yang diperiksa: `RADAR_AI_MASTER_CONTEXT.md`, `AGENTS.md`, `README.md`, `package.json`, `lib/ingest.js`, `server.js`, `public/index.html`, `public/app.js`, `public/style.css`, `public/trading.html`, `public/trading.js`, `public/trading.css`, `test/radar.test.js`, dan `.github/workflows/test.yml`.
- File source aplikasi diubah: tidak ada. File dokumentasi yang diubah: `RADAR_AI_MASTER_CONTEXT.md`.
- Tes lokal: tidak dijalankan; sesi tidak memiliki working copy/runtime Node repository. CI untuk `327ad197`: belum terverifikasi (combined status kosong, bukan status gagal).
- GitHub HEAD terbaru yang ditemukan sebelum catatan ini: `327ad19753cafdc523b18d61a65307128de7dab5`; commit dokumentasi sesi ini dicatat setelah commit.
- Hostless build: tidak diketahui. Hostless Live: tidak diketahui / belum terverifikasi. Akses halaman publik dan `/api/health` tidak tersedia dari lingkungan pemeriksaan ini; ini bukan bukti aplikasi down.
- Risiko terbuka: Hostless deployment/logs dan volume writable belum dapat diperiksa; QA visual desktop/mobile belum dilakukan; koneksi Binance read-only belum diimplementasikan/diuji.
- NEXT TASK:
  1. Dapatkan akses Hostless read-only melalui koneksi akun/integrasi yang tersedia; periksa deployment SHA, build, runtime logs, mount volume, dan konfigurasi `DATA_DIR` tanpa membuka nilai secret.
  2. Jalankan verifikasi browser desktop/mobile untuk Dashboard, sidebar, dan Exchange Hub; cek console/network serta `/api/health` terhadap deployment SHA yang benar.
  3. Verifikasi CI `npm test` untuk HEAD `327ad197` atau HEAD terbaru pada saat pemeriksaan berikutnya melalui GitHub Actions push workflow.
  4. Uji persistensi setelah restart dan perilaku EROFS hanya setelah lokasi volume Hostless terkonfirmasi; jangan mengubah storage path secara spekulatif.
  5. Setelah storage dan UI stabil, lanjutkan Binance read-only server-side dengan secret tetap di Hostless environment. Trading tetap OFF.


---

## 19. PEMERIKSAAN LANJUTAN DAN BATAS VERIFIKASI — 22 NOVEMBER 2026 (ASIA/JAKARTA)

### 19.1 HEAD dan integritas repository
- Branch aktif dikonfirmasi `main`; commit terbaru sebelum catatan ini adalah `e5fbb62ddb1ce742d94c6858f0014540fb47315d` (`docs: record dashboard and exchange hub audit`).
- Fetch commit menunjukkan `e5fbb62` hanya menambahkan bagian 18 ke dokumen master; tidak ada perubahan kode aplikasi pada commit tersebut.
- `AGENTS.md` dibaca ulang dan tetap konsisten dengan kebijakan kesinambungan V2→V3, dokumentasi otomatis, dan larangan klaim deployment tanpa bukti.
- Repository publik dapat diakses melalui konektor GitHub; working copy lokal tidak tersedia. Percobaan `git ls-remote` dari runtime lokal gagal karena DNS/network tidak dapat menyelesaikan `github.com`. Karena itu tes lokal tidak dapat dijalankan pada sesi ini.

### 19.2 Audit ulang DATA_DIR / EROFS
- `lib/ingest.js` pada HEAD tetap membentuk `dataDir` dari `path.resolve(env('DATA_DIR', './data'))`.
- `load()` hanya menganggap `ENOENT` sebagai state baru; error lain termasuk `EACCES`, `EIO`, `EROFS`, dan JSON rusak diteruskan.
- `save()` membuat direktori, menulis `state.json.tmp`, lalu atomic rename ke `state.json`; file sementara dibersihkan best-effort jika gagal.
- Tes storage pada `test/radar.test.js` mencakup state awal, pemulihan state/JSON rusak, dan simulasi EROFS saat rename dengan preservasi state lama.
- Kesimpulan tetap: source dan tes lokal/CI tidak dapat membuktikan mount Hostless writable/persisten. Tidak ada perubahan path/fallback yang dibuat tanpa bukti mount/runtime karena dapat memindahkan state ke disk ephemeral.

### 19.3 QA source-level Dashboard
- File aktual diperiksa: `public/index.html` (3,136 byte), `public/app.js` (24,732 byte), dan `public/style.css` (17,563 byte).
- Struktur shell dashboard dan script frontend tetap ada. CSS memuat sidebar fixed dengan `height:100dvh`, `overflow-y:auto`, `overscroll-behavior:contain`, serta drawer transform pada breakpoint mobile. Aturan responsive untuk konten, tabel, grid, dan sidebar tetap ada.
- Pemeriksaan ini hanya source-level. Belum ada browser render, interaksi scroll, console/network inspection, atau QA visual pada desktop/mobile; jangan menandai UI lulus runtime.

### 19.4 QA source-level Exchange Hub
- File aktual diperiksa: `public/trading.html` (5,519 byte), `public/trading.js` (3,769 byte), dan `public/trading.css` (2,383 byte).
- UI tetap menyatakan koneksi akun belum aktif; kalkulator posisi hanya estimasi simulasi. Pemeriksaan `trading.js` tidak menemukan pemanggilan `fetch`, route `/api/`, penanganan API key/secret, signature, atau pengiriman order.
- Peringatan kalkulator tetap menyebut fee, funding, slippage, ukuran kontrak, dan likuidasi belum dihitung. Tidak ada perubahan integrasi atau kredensial.

### 19.5 CI dan Hostless
- Combined commit status untuk HEAD `e5fbb62` mengembalikan array status kosong. Endpoint workflow-run yang tersedia untuk commit ini juga mengembalikan daftar kosong karena wrapper tersebut hanya menampilkan run pull-request. Dengan demikian CI push `npm test` untuk `e5fbb62` belum terverifikasi; hasil PASS pada SHA lama tidak boleh dipindahkan ke HEAD ini.
- Homepage Hostless dan `/api/health` tidak dapat diambil dari lingkungan pemeriksaan (cache miss / URL tidak accessible). Ini bukan bukti aplikasi down.
- Tidak ditemukan integrasi Hostless pada daftar konektor yang tersedia. Deployment SHA, status build, versi LIVE, runtime logs, mount volume, dan nilai runtime `DATA_DIR` tetap tidak diketahui.
- Pencarian plugin hosting tidak menemukan integrasi Hostless yang cocok; plugin penyedia hosting lain bukan pengganti yang aman untuk akun Hostless proyek ini.

### 19.6 Catatan sesi dan NEXT TASK
- Tujuan: meneruskan audit dari bagian 18, memeriksa ulang source storage, Dashboard, Exchange Hub, status CI, dan jalur akses deployment.
- File source aplikasi diubah: tidak ada. File dokumentasi yang diperbarui: `RADAR_AI_MASTER_CONTEXT.md`.
- Tes lokal: tidak dijalankan karena working copy tidak tersedia dan koneksi GitHub dari runtime lokal gagal.
- CI HEAD `e5fbb62`: belum terverifikasi (status kosong dan workflow-run pull-request-only tidak menyediakan bukti push run).
- Commit GitHub sebelum pembaruan catatan ini: `e5fbb62ddb1ce742d94c6858f0014540fb47315d`. Commit pembaruan bagian 19: `19f5125b3dadc693dab105f141807557b82ff086`.
- Hostless build: tidak diketahui. Hostless Live: tidak diketahui / belum terverifikasi.
- Risiko terbuka: akses Hostless read-only tidak tersedia; mount volume writable/persisten dan runtime `DATA_DIR` belum terbukti; QA visual/browser desktop/mobile belum dilakukan; CI push untuk HEAD ini belum terverifikasi; koneksi Binance read-only belum diimplementasikan/diuji.
- NEXT TASK:
  1. Sediakan koneksi Hostless read-only yang resmi/terotorisasi agar deployment SHA, build, runtime logs, volume, dan konfigurasi `DATA_DIR` dapat diperiksa tanpa membuka secret.
  2. Verifikasi CI push `npm test` untuk HEAD terbaru melalui GitHub Actions run/job, lalu catat SHA dan hasil job.
  3. Jalankan QA browser dashboard/sidebar dan Exchange Hub pada desktop serta mobile; periksa console, network, dan `/api/health` terhadap deployment SHA yang sama.
  4. Uji volume writable dan persistensi lintas restart setelah mount Hostless teridentifikasi; jangan mengganti storage path secara spekulatif.
  5. Setelah storage dan UI stabil, implementasikan Binance read-only server-side dengan secret tetap di Hostless environment; trading tetap OFF.


---
## 20. PERBAIKAN SIDEBAR SCROLL & DRAWER MOBILE — 22 NOVEMBER 2026 (ASIA/JAKARTA)

### 20.1 Masalah dan diagnosis source
- Pemilik melaporkan saat menggeser menu sidebar ke atas, halaman dashboard ikut bergeser dan sidebar tidak terasa menjadi area scroll yang mandiri.
- Pemeriksaan source menunjukkan aturan lama memberi `overflow-y:auto` pada seluruh `.sidebar`, sedangkan `.side-nav` masih menjadi flex child/grid tanpa batas tinggi dan tanpa scroll container internal yang eksplisit. Pada perangkat sentuh, scroll chaining/gesture dapat membuat halaman utama menerima gerakan.
- Perubahan ini memperjelas kepemilikan scroll: sidebar menjadi viewport dengan overflow tersembunyi; hanya daftar menu `.side-nav` yang menjadi area scroll vertikal dengan `min-height:0`, `flex:1 1 0`, `overscroll-behavior-y:contain`, momentum scrolling iOS, dan `touch-action:pan-y`. Header brand dan status engine tetap di luar area scroll.

### 20.2 Perubahan implementasi
- `public/style.css`:
  - Memindahkan scroll internal ke `.side-nav`, bukan seluruh panel sidebar.
  - Menahan overscroll chaining dan memberi area sentuh menu minimal 44px.
  - Drawer mobile tetap fixed dengan tinggi dynamic viewport, animasi halus, safe-area padding, dan backdrop.
  - Ketika drawer terbuka, body dikunci dari scroll; daftar menu tetap dapat discroll secara internal.
  - Menambahkan focus-visible untuk aksesibilitas keyboard.
- `public/index.html`:
  - Tombol hamburger diperjelas menjadi tombol "Menu" dengan ikon, label, `aria-controls`, dan `aria-expanded`.
  - Menambahkan backdrop tombol untuk menutup drawer saat area luar disentuh.
  - Seluruh 12 entri navigasi lama tetap dipertahankan.
- `public/app.js`:
  - Menambahkan satu pengendali buka/tutup sidebar yang menyelaraskan class drawer, body scroll lock, dan atribut ARIA.
  - Backdrop, tombol menu, Escape, resize ke desktop, dan navigasi halaman menutup drawer dengan konsisten.
  - Tidak mengubah route, data, atau fitur dashboard.

### 20.3 Tes dan verifikasi
- Pemeriksaan ulang GitHub memastikan aturan CSS baru, backdrop HTML, dan pengendali JS sudah berada di branch `main`.
- Commit implementasi berurutan:
  - CSS: `2de0f930e0d8d63282aed47ee4d4169ef2d3be41`
  - HTML: `d5f1eea36929e846be3447fb6bfbdbbaba07c7b2`
  - JS / HEAD kode: `cb75d088155282481b442b256775a9b65e3a2acb`
- Combined commit status untuk HEAD `cb75d08` kosong. Konektor workflow-run yang tersedia hanya mengembalikan workflow pull-request, sehingga hasil CI push belum terverifikasi.
- Tes lokal `npm test` dan `node --check public/app.js` tidak dapat dijalankan: working copy tidak tersedia dan `git clone` gagal karena DNS/runtime tidak dapat mengakses github.com.
- Browser/device QA belum dapat dilakukan dalam sesi ini. Perubahan adalah perbaikan source-level; scroll behavior pada perangkat fisik dan Hostless Live belum boleh dinyatakan lulus.
- Hostless build dan versi Live tetap tidak diketahui / belum diverifikasi. Commit masuk ke GitHub `main`; jangan menyamakan commit dengan deployment.
- Catatan audit bagian 20 disimpan melalui commit dokumentasi `4c7d740e590cecb06c1d0b0ae2902de02a5377bf`; setelah commit dokumentasi ini, HEAD `main` berubah ke SHA dokumentasi tersebut.

### 20.4 NEXT TASK
1. Verifikasi GitHub Actions `npm test` untuk SHA `cb75d088155282481b442b256775a9b65e3a2acb` melalui run/job push yang sesuai.
2. Verifikasi Hostless build dan deployment SHA Live setelah auto-deploy.
3. Uji di ponsel: buka Menu, swipe di daftar menu sampai item terbawah, pastikan hanya daftar sidebar yang bergerak; swipe halaman utama setelah drawer tertutup; pastikan backdrop dan tombol Menu menutup/membuka dengan benar.
4. QA desktop: sidebar tetap stabil, daftar menu dapat discroll dengan mouse wheel/trackpad, konten utama tidak ikut bergerak.
5. Jika perangkat masih meneruskan gesture, ganti ke layout menu alternatif berbasis kategori/accordion atau rail navigasi dengan tombol yang tetap mudah dijangkau; jangan menghapus menu/fitur.


---

## 21. EXCHANGE HUB — BACKEND READ-ONLY BINANCE / BYBIT — 22 NOVEMBER 2026 (ASIA/JAKARTA)

### 21.1 Tujuan dan diagnosis
- Pemilik menetapkan Exchange Hub sebagai tanggung jawab pengembangan khusus: satu halaman untuk Binance, Bybit, dan integrasi exchange/aplikasi berikutnya.
- Pemeriksaan HEAD sebelum perubahan menunjukkan `public/trading.js` hanya mengganti tab dan menghitung simulasi posisi; belum ada request akun privat. `server.js` belum menyediakan route exchange dan belum ada adapter signature.
- Pemilik menyampaikan API key sudah dipasang di Hostless. Nilai environment Hostless tidak dapat dibaca pada sesi ini; keberadaan key/secret, nama variabel, izin API, IP whitelist, serta koneksi aktual belum diverifikasi. Tidak ada nilai kredensial yang diminta atau disimpan dalam dokumentasi.

### 21.2 Implementasi
- Menambahkan `lib/exchanges.js` sebagai lapisan adapter read-only tanpa dependency tambahan:
  - Binance Spot signed account request dengan HMAC-SHA256 dan header API key.
  - Binance USDⓈ-M Futures account serta open positions; kegagalan izin Futures dipisahkan agar saldo Spot tetap dapat dibaca.
  - Bybit V5 Unified Wallet dan Linear positions dengan signature HMAC-SHA256.
  - Normalisasi dan pembatasan jumlah saldo/posisi yang dikirim ke browser.
  - Timeout 10 detik, penanganan error generik, validasi bentuk response, dan tidak meneruskan response error upstream/secret.
- `server.js` menyediakan:
  - `GET /api/exchanges/status`: boolean konfigurasi saja, tanpa nilai key/secret.
  - `GET /api/exchanges/binance/account` dan `GET /api/exchanges/bybit/account`: permintaan akun read-only saat pengguna menekan tombol di UI.
  - `GET /api/exchanges/market?exchange=binance|bybit&symbol=BTCUSDT`: ticker publik 24 jam Spot dan Futures/Linear, tanpa API key.
  - Response privat memakai `Cache-Control: no-store`; route tunduk pada rate limit API yang sudah ada.
- `public/trading.html`, `public/trading.js`, `public/trading.css`: panel status konfigurasi, tombol uji koneksi, ringkasan akun, tabel aset/saldo, posisi terbuka, ticker publik 24 jam, tombol isi harga kalkulator dari ticker derivatif, state error, dan layout responsif. Data DOM dibuat dengan `textContent`/node, bukan memasukkan data exchange sebagai HTML.
- `package.json`: `npm test` kini memeriksa sintaks `lib/exchanges.js` dan `public/trading.js`.
- `test/exchanges.test.js`: 10 tes tambahan untuk status tanpa secret, signature Binance/Bybit, normalisasi saldo/posisi, kredensial tidak lengkap, error upstream, route server, ticker publik, konversi persentase, dan validasi simbol. Total test case repository menjadi 31 (21 core + 10 exchange).
- `.env.example` mendokumentasikan nama environment yang diharapkan: `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BYBIT_API_KEY`, `BYBIT_API_SECRET`, serta base URL opsional. Backend juga menerima alias secret `*_SECRET_KEY` dan `*_SECRET`. File hanya berisi placeholder kosong.
- `README.md` menjelaskan cara konfigurasi dan batas read-only.

### 21.3 Keamanan dan batas fitur
- Secret tetap server-side; tidak dikirim ke frontend, tidak dikembalikan route status, tidak dicatat ke log, dan tidak disimpan ke state RADAR AI.
- Tidak ada endpoint create/cancel order, transfer, withdrawal, atau live trading. Tidak ada izin trading/withdrawal yang dibutuhkan.
- Tombol UI hanya memicu pembacaan akun saat diminta pengguna; keberadaan environment saja tidak dianggap sebagai koneksi berhasil.
- Gunakan izin read/account saja dan nonaktifkan withdrawal, spot trading, futures trading, serta transfer. Jika Hostless menggunakan nama variabel berbeda, status UI akan menunjukkan konfigurasi belum lengkap sampai nama environment diselaraskan.
- Binance Futures mungkin memerlukan izin baca terpisah; bila gagal, data Spot tetap bisa ditampilkan dengan status Futures tidak tersedia.
- Bybit dapat diaktifkan dengan pasangan environment tersendiri. Integrasi exchange/aplikasi lain belum dibuat; adapter module menjadi titik perluasan berikutnya.
- Market quotes publik Spot dan Futures/Linear sudah tersedia. Exchange instrument metadata (tick/step/min-notional), histori transaksi, dan kalkulator posisi berbasis aturan kontrak exchange belum diimplementasikan pada tahap ini. Kalkulator lama tetap simulasi generik dan tidak boleh dianggap presisi exchange.

### 21.4 Pengujian dan deployment
- Source serta diff diperiksa melalui GitHub setelah setiap perubahan; tidak ada perubahan pada Dashboard utama atau route lama yang dimaksudkan.
- Tes lokal tidak dijalankan karena sesi tidak memiliki working copy Node repository. Tes otomatis baru ditambahkan; belum ada bukti hasil GitHub Actions untuk push HEAD terbaru pada sesi ini (combined status kosong dan konektor workflow run yang tersedia tidak menampilkan push runs).
- Tes adapter memakai mocked fetch/response; ini membuktikan pembentukan signature dan normalisasi data pada unit test, bukan validasi kredensial nyata ke Binance/Bybit.
- Hostless build, deployment SHA, runtime env presence, IP whitelist, dan versi LIVE belum dapat diakses/dikonfirmasi. Jangan klaim akun sudah tersambung sebelum tombol uji koneksi berhasil pada versi Hostless yang ter-deploy.
- File yang berubah: `lib/exchanges.js`, `server.js`, `public/trading.html`, `public/trading.js`, `public/trading.css`, `test/exchanges.test.js`, `package.json`, `.env.example`, `README.md`, dan dokumen master ini.
- Commit implementasi berurutan mencakup `dc6411a` (adapter), `9a32870` (API route), `a83a3f5` (account UI), `faa4e06` (frontend binding), `a0eebed` (route tests), `4d32a06` (syntax checks), `68039cb` (env template), `1ade6d2` (README), serta perbaikan lanjutan sampai HEAD implementasi `6b773f8385c0b050635b420c53851e11cc0067a1`. README/test-count sync berlanjut pada `e689a153a98d05db83caf2f552fde6f90c3d6600`. Commit dokumentasi bagian 21: `47cafafcaf3ec702a9cba1eb7a723adb658a8446`.
- Hostless build: tidak diketahui. Hostless Live: tidak diketahui / belum diverifikasi.

### 21.5 NEXT TASK — TANGGUNG JAWAB EXCHANGE HUB
1. Verifikasi push CI `npm test` untuk HEAD dokumentasi terbaru; jika gagal, perbaiki sebelum aktivasi akun.
2. Setelah Hostless deploy, periksa `GET /api/exchanges/status`. Jika Binance belum terkonfigurasi, selaraskan nama environment `BINANCE_API_KEY` dan `BINANCE_API_SECRET` di Hostless tanpa mengirim nilainya melalui chat.
3. Jalankan tombol uji koneksi Binance read-only dan verifikasi Spot; uji Futures secara terpisah. Cocokkan hasil hanya dari response aplikasi yang sudah disaring.
4. Verifikasi Bybit read-only setelah pasangan environment Bybit tersedia; uji Unified Wallet dan Linear positions melalui UI.
5. Tambahkan instrument metadata (tick size, step size, min notional), riwayat transaksi read-only, dan kalkulator posisi yang memakai aturan exchange aktual.
6. Bangun registry/adapter untuk exchange dan aplikasi tambahan, sambil mempertahankan kontrak data dan UI bersama.
7. Jalankan QA visual/browser desktop/mobile, console/network, dan pengujian error/timeout/rate-limit. Jangan aktifkan live trading; tetap OFF sampai ada permintaan dan persetujuan eksplisit beserta seluruh pengaman order.


### 21.6 Pembaruan lanjutan ticker publik dan partial-read — 22 November 2026
- Exchange adapter kini menyediakan `market(exchange, symbol)` untuk ticker publik 24 jam Binance Spot/USDⓈ-M Futures dan Bybit Spot/Linear. Validasi simbol dilakukan sebelum request; ticker publik tidak mengirim API key.
- Route tambahan: `GET /api/exchanges/market?exchange=binance|bybit&symbol=BTCUSDT`. UI menyediakan tombol ambil harga market; harga Futures/Linear digunakan untuk mengisi harga masuk kalkulator jika field masih kosong. Kalkulator tetap simulasi, bukan order.
- Tes exchange bertambah menjadi 10 (total repository 31): Binance/Bybit ticker, konversi perubahan harga Bybit ke persen, simbol tidak valid, serta route market.
- Environment menerima pasangan `*_API_KEY` dan secret `*_API_SECRET`, dengan alias umum `*_SECRET_KEY` / `*_SECRET`; nilai kredensial tidak dibaca ke dokumen.
- Commit kode ticker: `2580c882b7c879b4940f94b388d5b709b93791a0`; route market: `ae64aa90884b49ee1f06962009e620bfdb935a8e`; UI ticker: `0b5a7c49d956a01171a33e959f0ad46f18e88bbb`; test ticker: `662abbc44d763f40c2d96cdf044e45388296205d`; perbaikan kalkulator: `87932f47a29fd456791986305b56d20aa5c7f2c5`.
- Perbaikan tambahan untuk menandai kegagalan pembacaan posisi parsial dibuat pada commit `7f882b45f80f464d4b4b5e51097a02355b657efa`; dashboard refresh failure diperbaiki pada commit terpisah `70b8a6b41fcc38f6321295a6b8bee4f10a35ea74` oleh perubahan lain di branch dan bukan bagian scope Exchange Hub sesi ini.
- HEAD dokumentasi sebelum catatan lanjutan ini: `a2f13860ebcde9162907cb2793fe97f9354ed555` untuk perubahan template environment; catatan lanjutan ticker disimpan pada `436be39bf6d01389af4807fc427f874ed8b511c6`. Sinkronisasi status Exchange Hub dan NEXT TASK dicatat pada commit `d134691b7709bd23bbab93e39134e771e9f5651d`. Status CI push dan Hostless deployment masih belum dapat diverifikasi dari koneksi yang tersedia.


---

## 22. AUDIT UI & FUNGSI DASHBOARD / EXCHANGE HUB — 22 NOVEMBER 2026 (ASIA/JAKARTA)

### 22.1 Temuan source-level
- Dashboard: load() sebelumnya tidak mengembalikan status kegagalan snapshot; refreshNow() selalu menampilkan notifikasi berhasil setelah load() selesai, sekalipun /api/snapshot gagal. Ini menyesatkan ketika data lama masih tampil.
- Exchange Hub: adapter sudah membedakan positions_available, tetapi tampilan tabel posisi masih menulis “Tidak ada posisi terbuka” ketika endpoint posisi gagal. Pengguna tidak dapat membedakan posisi kosong dari pembacaan yang gagal.
- Binance: respons akun Spot menyediakan can_trade, tetapi UI belum memberi peringatan eksplisit jika API key memiliki izin Spot Trading. Prinsip least-privilege mengharuskan izin trading tetap dinonaktifkan.
- Kalkulator: validasi awal hanya memastikan margin/leverage/harga masuk positif; SL/TP belum divalidasi terhadap arah Long/Short. Harga SL/TP yang berada di sisi yang salah dapat menghasilkan estimasi PnL/R:R yang membingungkan.
- Batas kalkulator tetap berlaku: simulasi belum memakai instrument metadata tick/step/min-notional, fee, funding, slippage, dan liquidation calculation exchange. Jangan menganggapnya sebagai kalkulator order presisi.

### 22.2 Perbaikan yang dikirim ke main
- public/app.js — load() kini mengembalikan status keberhasilan snapshot. Jika fetch gagal, UI menampilkan banner bahwa data lama mungkin masih terlihat; tombol Refresh tidak lagi mengklaim berhasil dan memberi notifikasi gagal secara jujur. Commit 70b8a6b41fcc38f6321295a6b8bee4f10a35ea74.
- lib/exchanges.js — response Binance Futures dan Bybit menyertakan kode positions_error terpisah dari saldo jika endpoint posisi gagal atau bentuk respons tidak valid. Commit 7f882b45f80f464d4b4b5e51097a02355b657efa.
- public/trading.js — tabel posisi membedakan hasil kosong yang valid dari kegagalan pembacaan; status parsial diperlihatkan; izin Spot Trading Binance yang aktif menghasilkan peringatan; kalkulator menolak pair tidak valid dan SL/TP yang berada pada sisi salah untuk Long/Short. Commit 58caf2a69a980c028bf19a1bb2725fd0fdc680ac.
- public/trading.css — menambahkan gaya peringatan untuk izin API dan data parsial. Commit db7ab58817492d060e9241c30c3732425be7001b.
- test/exchanges.test.js — menambahkan dua tes untuk kegagalan endpoint posisi Binance dan Bybit saat wallet/saldo berhasil. Commit a40acd1a7986986549f4fedde9b2d5e286d132b3.
- Total test case yang tercatat menjadi 33 (21 core + 12 Exchange Hub).

### 22.3 Verifikasi
- GitHub Actions push workflow untuk public/app.js commit 70b8a6b: completed / success (run #172).
- GitHub Actions untuk public/trading.js commit 58caf2a: completed / success (run #177).
- GitHub Actions untuk public/trading.css commit db7ab58: completed / success (run #178).
- Saat catatan ini disusun, workflow npm test untuk commit test a40acd1 masih in progress (run #179); jangan tandai tes tambahan sebagai lulus sebelum run selesai.
- Tes lokal tidak dijalankan karena working copy Node repository tidak tersedia dalam sesi ini.
- Pemeriksaan source dan diff dilakukan melalui GitHub. Belum ada browser/device QA, pemeriksaan console/network, atau uji kredensial privat ke exchange.
- Hostless build dan versi LIVE tetap tidak diketahui / belum terverifikasi. GitHub Actions hijau bukan bukti deploy Hostless.

### 22.4 NEXT TASK
1. Tunggu dan verifikasi GitHub Actions run #179 untuk a40acd1; jika gagal, perbaiki sebelum task berikutnya.
2. QA browser desktop/mobile untuk Dashboard, sidebar, ticker publik, kalkulator, status parsial, dan tabel akun Exchange Hub.
3. Uji endpoint market publik dan status API pada Hostless yang benar-benar ter-deploy; jangan menganggap environment credentials tersedia hanya dari source.
4. Uji Binance read-only Spot dan Futures secara terpisah, lalu Bybit Unified Wallet/Linear. Periksa izin key tetap read-only dan tidak ada withdrawal/trading.
5. Lanjutkan instrument metadata dan kalkulator berbasis tick size, step size, min notional, fee/funding serta risiko likuidasi setelah hasil read-only tervalidasi.
6. Lanjutkan audit Dashboard lain: Watchlist/localStorage, Screener/filter/export CSV, News/Unlock/Alerts, AI Council/Workspace, System Health dan Command Center. Pastikan semua menu lama tetap berfungsi.
7. Verifikasi deployment Hostless, DATA_DIR/EROFS dan persistensi lintas restart hanya setelah akses deployment/log/mount tersedia.
