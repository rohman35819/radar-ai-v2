# Pelajaran 02–06 — ringkasan terstruktur

Sumber mesin: `src/nexus/curriculum/lessons-02-06.mjs` · engine: `src/nexus/curriculum/engine.mjs` · ujian: `test/nexus-lessons-02-06.test.mjs`.
Setiap pelajaran memakai siklus yang sama dengan lesson-01: materi → contoh → latihan → ujian → evaluasi → koreksi. Semua artefak bisa di-ingest ke Knowledge Memory NEXUS lewat `runLearningPipeline` dengan fixture deterministik.

## lesson-02 — Python, TypeScript, engineering & debugging
- **Materi:** L2.1 pembagian bahasa (TS untuk kontrak/API/UI, Python untuk riset kuant), L2.2 konvensi tes (`npm test`, `typecheck`, unittest, CI), L2.3 reproduce→isolate→fix→regression→diff review, L2.4 review diff & secret, L2.5 studi kasus error TPM.
- **Contoh:** perbaiki tes dengan regression test (benar) vs ubah ekspektasi tes (salah).
- **Latihan:** pilih bahasa per lapisan; telusuri bug drawdown; tinjau diff yang menghapus validasi secret.
- **Ujian:** pemilihan bahasa, perintah tes, urutan debugging, isi diff review, penanganan TPM tanpa biaya.
- **Koreksi:** baca bagian yang ditandai, tulis ulang jawaban, ujian ulang sebelum promosi.

## lesson-03 — AI Agent, autonomous systems & orkestrasi
- **Materi:** L3.1 BOS→RADAR→NEXUS, L3.2 kontrak antrean (idempotency, lease, fencing, dead-letter, approval), L3.3 default paused/kill switch/budget 0 & worker 2 jam, L3.4 orkestrasi DAG, L3.5 bukti otonomi offline.
- **Contoh:** NEXUS menolak eskalasi diri (benar) vs mengambil izin karena mendesak (salah).
- **Latihan:** alur grant; fungsi lease/fencing/dead-letter; bukti minimum otonomi.
- **Ujian:** issuer grant, default platform control, periodisitas worker, fungsi lease, syarat klaim offline.
- **Koreksi:** sama, ditambah larangan eskalasi diri.

## lesson-04 — Knowledge engineering, memory & pembelajaran mandiri
- **Materi:** L4.1 taksonomi & scope, L4.2 provenance wajib, L4.3 lifecycle status, L4.4 konflik/duplikat/stale, L4.5 pembelajaran ringkas via ringkasan + source_refs.
- **Contoh:** sumber bertentangan ditandai dan diverifikasi (benar) vs disimpan semua sebagai approved (salah).
- **Latihan:** field provenance; beda rejected/superseded; ringkas dokumen besar.
- **Ujian:** provenance, status otoritatif, supersedes, yang dilarang di memori, ukuran memori.
- **Koreksi:** versi baru, bukan menimpa; tidak ada transkrip chat/rahasia di memori.

## lesson-05 — Quantitative research & quantum trading
- **Materi:** L5.1 validation-v1 tetap, L5.2 pre-registrasi, L5.3 OOS & walk-forward, L5.4 biaya & anti look-ahead, L5.5 paper ledger terkunci.
- **Contoh:** OOS +46% dengan WF 3/6 tetap ditolak (benar) vs turunkan ambang (salah).
- **Latihan:** urutan registrasi; return penuh vs WF; ticker ≠ OHLCV.
- **Ujian:** kriteria tidak diubah, urutan pre-registrasi, syarat promosi, biaya per sisi, status ledger.
- **Koreksi:** tidak ada klaim profit/live order.

## lesson-06 — Keamanan, keputusan & operasional
- **Materi:** L6.1 ancaman & rahasia server-side, L6.2 tata kelola cabang & WIP 3, L6.3 exact-head CI, L6.4 beda commit/PR/CI/Build/LIVE, L6.5 rollback & approval BOS.
- **Contoh:** CI hijau bukan bukti LIVE (benar) vs klaim LIVE otomatis (salah).
- **Latihan:** tempat terlarang secret; merge vs build vs LIVE; rollback release.
- **Ujian:** lokasi kunci, syarat CI, batas PR, beda CI/LIVE, rollback aman.
- **Koreksi:** tidak ada klaim tanpa bukti dan tidak ada force-reset shared branch.

## Transfer pengetahuan Grok
`docs/nexus-curriculum/grok-knowledge-transfer.md` merangkum 15 bagian pengetahuan durable dari dokumen repository (identitas, startup, loop kerja, risiko, eksperimen, wewenang, branch/CI, QA, dokumentasi, konstitusi 12 area, divisi, fakta kemampuan, fakta kuant, NEXUS saat ini, target gated). **Tidak ada transkrip chat, prompt/response, reasoning log, kredensial, atau data privat** yang dipindahkan. Detail tetap di `source_refs` dokumen asal.

## Batas
Materi ini tidak mengubah kebijakan, memberi izin, mengaktifkan worker/provider, atau membuktikan NEXUS belajar mandiri. `validation-v1` dan aturan keamanan tidak dilonggarkan untuk membuat ujian lolos.
