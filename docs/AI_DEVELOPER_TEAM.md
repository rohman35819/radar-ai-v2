## AI Developer Team — fondasi akses GitHub

Fondasi integrasi GitHub App berada di `lib/github/app-client.js`. Klien ini:
- Membuat installation token jangka pendek dari GitHub App JWT.
- Membatasi operasi ke satu repository yang dikonfigurasi.
- Membatasi file yang dapat diubah ke `public/`, `lib/ai/`, dan `test/`.
- Membuat branch berawalan `ai-dev/`, menulis file ke branch tersebut, dan membuka Pull Request dalam mode draft.
- Tidak memiliki fungsi merge atau menulis ke branch `main`.

### Konfigurasi Hostless (belum diaktifkan)

Siapkan GitHub App yang di-install hanya pada repository `rohman35819/radar-ai-v2`, dengan permission minimum:
- Metadata: Read-only
- Contents: Read and write
- Pull requests: Read and write

Simpan konfigurasi berikut sebagai environment variables Hostless. Private key harus disimpan sebagai secret dan newline dapat ditulis sebagai `\\n`.
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_REPOSITORY=rohman35819/radar-ai-v2`

Jangan menaruh private key atau installation token di browser, dashboard, repository, atau log.

### Status tahap awal

Klien ini baru fondasi akses. Belum ada endpoint publik atau agent yang dapat menjalankan perubahan kode. Sebelum integrasi diaktifkan, implementasikan antrean satu tugas, validasi diff, batas ukuran/jumlah file, audit log, tes, dan persetujuan direktur/pemilik. Semua hasil harus berupa draft PR; merge ke `main` tetap manual.

## Ruang Kerja AI dan tata kelola
Empat agen melakukan review mandiri harian dengan perspektif berbeda:
- Gemini: UX, kemudahan penggunaan mobile, dan nilai produk.
- Groq: reliability, keamanan, dan QA.
- OpenRouter: arsitektur, data, observability, dan efisiensi.
- OpenAI: engineering, maintainability, dan keamanan teknis.

Agen hanya mengirim proposal terstruktur. Proposal tidak dianggap sebagai instruksi sistem dan tidak boleh mengubah batas keamanan, secrets, risk limit, atau melakukan transaksi. Direktur Utama memilih prioritas. Implementasi berikutnya harus menggunakan branch terisolasi dan draft PR; CI/test dan review wajib dilakukan sebelum pemilik menyetujui merge. Tidak ada merge otomatis.
