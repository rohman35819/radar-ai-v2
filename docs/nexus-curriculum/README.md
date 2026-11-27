# Kurikulum NEXUS — metode mengajar dan pembuktian

Tujuan: mendidik NEXUS secara bertahap dengan bukti, bukan sekadar informasi. Setiap pelajaran wajib memiliki **materi, contoh, latihan, ujian, evaluasi, dan koreksi**.

## Siklus satu pelajaran

1. **Materi** — artefak terstruktur (`src/nexus/curriculum/lesson-NN.mjs`) dengan bagian bernomor dan `source_refs` ke repository.
2. **Contoh** — satu jawaban benar dan satu jawaban salah yang disertai alasan.
3. **Latihan** — pertanyaan reflektif tanpa kunci otomatis.
4. **Ujian** — pertanyaan dengan `required` concepts dan `forbidden` claims; grader deterministik `gradeExam`.
5. **Evaluasi** — skor per pertanyaan + total; ambang lulus 80 dan semua pertanyaan lulus.
6. **Koreksi** — `correctionFor` menghasilkan bagian remedial; materi gagal tidak dipromosikan menjadi approved knowledge. Versi baru menggantikan versi lama lewat mekanisme `supersedes`.

## Integrasi dengan Knowledge Memory

Artefak pelajaran memuat `provenance`, `claims`, dan `evidence` sehingga bisa dijalankan lewat pipeline yang sudah ada:

```
ingest → provenance → evaluate → approve/reject → versioned store → retrieve
```

`docs/nexus-curriculum/lesson-01.md` adalah tampilan manusia; modul `.mjs` adalah sumber terstruktur untuk mesin. Keduanya harus tetap konsisten.

## Daftar pelajaran

| ID | Topik | Status |
|---|---|---|
| lesson-01 | Arsitektur RADAR AI V2 & peran NEXUS | materi + ujian + koreksi, teruji |
| lesson-02 | Python, TypeScript, software engineering & debugging | materi + ujian + koreksi, teruji |
| lesson-03 | AI Agent, autonomous systems, orkestrasi | materi + ujian + koreksi, teruji |
| lesson-04 | Knowledge engineering, memory, pembelajaran mandiri | materi + ujian + koreksi, teruji |
| lesson-05 | Quantitative research & quantum trading | materi + ujian + koreksi, teruji |
| lesson-06 | Keamanan, keputusan, manajemen operasional | materi + ujian + koreksi, teruji |

## Batas kewenangan

Kurikulum tidak mengubah kebijakan keamanan, tidak memberi izin baru, tidak mengaktifkan worker/scheduler/live trading/withdrawal, tidak memanggil provider berbayar, dan tidak mengklaim NEXUS sudah belajar mandiri. Target akhir “belajar dari banyak AI tanpa menunggu perintah BOS” adalah arsitektur yang ingin dibangun — sampai ada approval, pipeline berjalan hanya dengan fixture deterministik dan di bawah capability grant RADAR.

Artefak tambahan: `lessons-02-06.md` (ringkasan manusia) dan `grok-knowledge-transfer.md` (transfer pengetahuan durable bersumber repo, tanpa transkrip chat/secret).
