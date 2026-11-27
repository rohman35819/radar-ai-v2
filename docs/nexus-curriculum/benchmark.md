# Benchmark Internal NEXUS — apa yang diukur dan apa yang tidak

`schema_version: radar-nexus-benchmark.v1` · status: **alat ukur kurikulum deterministik; bukan perbandingan dengan ChatGPT/DeepSeek/model eksternal lain.**

## Mengapa tidak ada klaim “mengalahkan ChatGPT”

Tidak ada task bersama, inference eksternal, atau evaluator netral yang saya jalankan terhadap ChatGPT. Karena itu klaim unggul/parity **tidak dapat dibuktikan** dan tidak saya buat. Yang bisa saya ukur hanyalah penguasaan NEXUS terhadap kurikulum RADAR AI V2 yang memang saya ajarkan — dan itu pun hanya pada fixture deterministik, bukan kemampuan umum, bukan model weights, dan bukan NEXUS yang berjalan mandiri.

## Apa yang diukur

- 30 task unik dari 6 pelajaran (5 soal per pelajaran), kategori = level pelajaran (fundamental/intermediate/advanced).
- Tiap task punya `required` concepts dan `forbidden` claims. Lulus jika semua konsep hadir dan tidak ada klaim terlarang.
- `runBenchmark({})` (belajar belum terjadi) → **0/100**. `runBenchmark(TRAINING_ANSWERS)` (jawaban kurikulum) → **100/100**.
- `selectWeakAreas` mengembalikan lessonId yang gagal, dipakai untuk koreksi terarah.
- `trainLoop` menjalankan ingest seluruh pelajaran lewat pipeline ber-approval, lalu mengukur ulang. Log dibatasi maksimal 5 epoch dan berisi skor + weak areas + tindakan koreksi.

## Apa yang tidak diukur

- Pengetahuan umum, penalaran lintas domain, atau kualitas jawaban bebas.
- Parsity/keunggulan terhadap model eksternal apa pun.
- Pembelajaran bobot model, pembelajaran persisten di Supabase, atau kerja/offline autonomy.

## Cara menjalankan

```
node --test test/nexus-benchmark.test.mjs
npm test   # mencakup benchmark + semua pelajaran + seluruh suite existing
```

## Hasil terverifikasi (commit ini)

- 5/5 tes benchmark lolos; task unik 30; baseline 0; trained 100.
- `npm test` 270/270 (termasuk benchmark); strict `tsc` exit 0; secret scan bersih; `fetch` di-stub melempar error saat training.
- Tidak ada provider eksternal, biaya, secret, worker, scheduler, trading, atau withdrawal.

## Batas lanjutan

Menjadikan metrik ini lebih bermakna memerlukan: benchmark eksternal yang disetujui BOS, evaluator independen, provider gratis terverifikasi, storage NEXUS durable, dan approval untuk runtime apa pun. Semua itu belum tersedia. Sampai saat itu, “latih terus” berarti menjalankan siklus kurikulum + koreksi berulang pada fixture deterministik di bawah grant RADAR — bukan continuous training latar belakang dan bukan klaim kemenangan atas model lain.
