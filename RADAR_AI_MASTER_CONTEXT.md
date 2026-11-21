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
- GitHub: perubahan storage, tes, README, dan master context tersimpan pada branch `main`. Commit README: `b104dcaf3f576421220ceaf2e4afc84b356a1cd3`; commit master context final tercatat pada HEAD setelah pembaruan ini.
- Hostless build: tidak diketahui. Pemilik mengonfirmasi mekanisme auto-deploy dari `main`; tidak ada akses status/log Hostless pada sesi ini.
- Hostless Live: tidak diketahui / belum diverifikasi. Belum ada pemeriksaan sukses terhadap homepage atau `/api/health` yang dapat dikaitkan dengan SHA terbaru.

### 14.4 Risiko dan NEXT TASK
- Risiko tersisa: lokasi volume writable dan nilai `DATA_DIR` runtime Hostless belum terbukti; bila tidak dipasang ke volume persisten yang writable, EROFS tetap akan muncul dengan pesan error yang kini tidak lagi disamarkan.
- NEXT TASK:
  1. Verifikasi CI `npm test` untuk commit terbaru di GitHub Actions.
  2. Verifikasi Hostless build dan versi LIVE terhadap SHA `main` terbaru; kemudian lakukan QA visual dashboard/sidebar dan Exchange Hub di desktop/mobile.
  3. Audit konfigurasi Hostless untuk memastikan `DATA_DIR` menunjuk ke mount persisten writable; jangan ubah path tanpa bukti konfigurasi volume.
  4. Setelah storage dan UI stabil, lanjutkan implementasi Binance read-only server-side dan uji tanpa mengaktifkan trading.
