# NEXUS Context Budget & Provider Resilience

Status: **diimplementasikan dan diuji secara lokal di branch `feat/nexus-cli`; belum di-PR karena batas WIP; belum diverifikasi LIVE.** Tidak ada layanan berbayar, worker, atau fallback otomatis yang diaktifkan.

## 1. Audit akar masalah

Error yang dilaporkan: `openai/gpt-oss-120b` kena batas **8.000 TPM**, request membutuhkan **14.721 token**.

Sumber pembengkakan ada di server (`lib/ai/workspace.js`), bukan di terminal:

- `runWorkspaceReview` mengirim `PROJECT` + `current_context` penuh ke tiap agen pada **tiga putaran**, lalu menyertakan `discussion_transcript` yang **akumulatif**.
- Langkah sekretaris mengirim `JSON.stringify({ round1, round2, round3 })` — seluruh transkrip, berulang kali.
- `lib/ai/chat-completions.js` dan `requestGemini` tidak punya batas konteks sama sekali; hanya `max_completion_tokens` (output) yang dibatasi.
- Pilihan model `openai/gpt-oss-120b` (jika `GROQ_MODEL` diatur) memperkecil ruang TPM. Default repo tetap `openai/gpt-oss-20b`.

## 2. Kebijakan budget

- Batas internal keras: **6.000 token input per request** (`lib/ai/context-budget.js`, `DEFAULT_BUDGET_TOKENS`, `MAX_BUDGET_TOKENS`). `NEXUS_CONTEXT_TOKEN_BUDGET` hanya bisa **menurunkan** batas (clamp 800–6.000), tidak bisa menaikkannya.
- Estimasi tanpa dependency baru: `ceil(chars / 4)` — konservatif untuk prose Indonesia + JSON. Ini estimasi, bukan tokenizer eksak; ruang 2.000+ token sengaja disisihkan untuk variasi token dan output.
- Instruksi sistem / hard constraint **dilindungi** (tidak dibuang). Payload user di-*compact* secara struktural (JSON valid) sebelum pemotongan teks.
- `truncateSafe` memotong di batas baris/kata, menyimpan kepala + ekor, dan menyisipkan penanda `[konteks dipotong aman]` — bukan pemotongan buta di tengah JSON atau kalimat.

## 3. Task-based selector

`selectContext({ task, catalog, budget })` hanya memasukkan item `issue`, `file`, `contract`, `decision`, dan `test` yang relevan dengan kata kunci tugas. Item `priority: 'critical'` (Rp0, tanpa paid/trading/withdrawal, instruksi keamanan) selalu dipertahankan. Item tidak relevan dicatat di `omitted` dengan alasan (`not_relevant`, `budget_exhausted`, `budget_truncated`).

Di workspace, transkrip diskusi dan payload sekretaris dikompaksi lewat `compactJson` sebelum dikirim; jumlah putaran dan jumlah panggilan provider tidak diubah.

## 4. Penanganan error

`lib/ai/provider-errors.js` mengklasifikasikan:

| Kode | Pemicu | Retry | Perkecil konteks |
|---|---|---|---|
| `RATE_LIMIT_TPM` | 429 / `rate_limit_exceeded` / TPM | ya (1×) | ya (setengah budget) |
| `RATE_LIMIT_429` | 429 umum | ya (1×) | ya |
| `TIMEOUT` | abort / timeout | ya (1×) | tidak |
| `PROVIDER_UNAVAILABLE` | 500/502/503/504/high demand | ya (1×) | tidak |
| `AUTH` | 401/403 | tidak | tidak |
| `AI_QUEUE_FULL` | antrean penuh | tidak | tidak |
| `BAD_RESPONSE` | JSON kosong/tidak valid | tidak | tidak |

Pesan error **tidak** memuat body mentah provider dan sudah melewati `redactSecrets`. Tidak ada retry tak terikat, tidak ada provider berbayar yang dicoba otomatis.

## 5. Fallback — kebijakan, bukan aktivasi

`lib/ai/provider-fallback.js` berisi kandidat **hanya** rute gratis yang sudah tercatat di repo: `openrouter/free` dan Groq `openai/gpt-oss-20b` (tier gratis; kuota tidak dijamin). Fungsi `resolveFallbackChain` mengembalikan `[]` kecuali `optIn === true` **dan** kunci sudah dikonfigurasi server-side. `assertNoPaidFallback` menolak OpenAI berbayar, `gpt-6/5/4o`, `120b`, `paid`, `dev-tier`.

Modul ini **tidak dipanggil dari jalur runtime** — tidak ada fallback otomatis yang aktif. Mengaktifkannya memerlukan keputusan eksplisit BOS dan konfigurasi kunci server-side. Groq tetap OFF-by-default.

## 6. Handoff lintas sesi

`/handoff` di NEXUS CLI mencetak ringkasan padat (`src/nexus/handoff.mjs`): identitas, status provider apa adanya, batas tetap Rp0, keputusan, bukti tes, blocker, dan NEXT TASK. Sudah di-*redact* dan dibatasi panjangnya. Ini **bukan** arsip percakapan; pesan per pesan tetap disimpan lokal di `~/.radar-nexus/sessions.json`, bukan di Git.

## 7. Bukti

- `node --test test/context-budget.test.js`: 11/11 pass.
- `npm test`: 258/258 pass (tanpa regresi).
- `git diff --check`: clean.
- `npm run typecheck`: tidak dapat dijalankan lokal (`tsc` tidak tersedia di Termux); dijalankan oleh CI.
- Secret scan manual pada file baru: tidak ada kredensial nyata; literal uji memakai string sintetis non-`sk-`.

## 8. Batas kebenaran

Belum ada PR untuk perubahan ini (WIP non-draft menuju `develop` = 4 > batas 3). Belum ada CI exact-head untuk SHA terbaru, belum ada verifikasi Termux interaktif oleh BOS, dan belum ada Hostless Build/LIVE yang dicek. Tidak ada klaim fallback aktif atau kerja latar belakang.
