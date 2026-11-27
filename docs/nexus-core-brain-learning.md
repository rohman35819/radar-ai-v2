# NEXUS Core Brain — Knowledge & Skill Learning Slice

Status: **diimplementasikan dan diuji secara lokal pada branch `feat/nexus-core-brain-learning`; belum di-PR; tidak ada integrasi produksi, persistensi durable, atau pemanggilan AI eksternal.**

Branch ini dibuat dari `develop` `411e7b7114c9642c0e4d567e7e666c82910d2b3c`. PR tidak dibuka karena PR non-draft menuju `develop` berjumlah 5 (#115, #153, #159, #160, #165) — melebihi WIP 3. Tidak ada PR NEXUS duplikat; PR #165 (storage/design) tidak disentuh.

## Apa yang benar-benar dibangun

Pipeline deterministik `ingest → provenance → evaluate → approve/reject → versioned store → retrieve`:

| File | Isi |
|---|---|
| `src/nexus/core/contracts.mts` | Tipe RADAR-issued: `LearningTask`, `ModelResponse`, `Provenance`, `Claim`, `Evidence`, `Evaluation`, `KnowledgeRecord`, `RetrievalQuery`, `CapabilityGrant`, `AccessDecision`; validator fail-closed. |
| `src/nexus/core/provider.mjs` | `createMockProvider(fixtures)` deterministik tanpa jaringan/API key/biaya; `createDisabledProvider()` fail-closed. |
| `src/nexus/core/learning.mjs` | Ingest output sebagai data tidak tepercaya; deteksi prompt injection & secret-like; redaksi; provenance wajib; evaluator deterministik (correctness/grounding/completeness/safety/reproducibility) dengan verdict `approve`/`reject`/`needs_review`; kurasi deny-by-default. |
| `src/nexus/core/store.mjs` | Store versi dalam memori: dedup deterministik (SHA-256), supersession dengan ID versi baru, `listVersions`, `retrieve` berscope/terbatas, `exportState`/`importState` untuk simulasi reload. |
| `src/nexus/core/capability.mjs` | RADAR-issued capability: issuer wajib `RADAR`, subject tidak boleh `RADAR`, expiry, policy revision, action/resource scope, autonomy stage, approvalRequired, correlation ID, path traversal ditolak, audit teredaksi. Deny by default. |
| `test/nexus-core-learning.test.mjs` | 10 tes: kontrak, provider offline, pipeline penuh, deny-by-default, injection/secret, provenance hilang, dedup/supersession, retrieval scope, snapshot reload, capability denial. |

## Perilaku penting

- **Tidak ada model eksternal yang dipanggil.** Provider adalah fixture deterministik. `fetch` diuji dengan stub yang melempar error untuk membuktikan tidak ada jaringan. Tidak ada Grok/DeepSeek/OpenAI yang dipakai dalam slice ini.
- **Output eksternal selalu tidak tepercaya.** Teks dibersihkan dari karakter kontrol, secret diredaksi, pola prompt injection diberi flag. Flag berbahaya → `safety=0` → `reject`, tidak bisa menjadi memory otoritatif.
- **Approval eksplisit.** Tanpa fungsi approver, hasil selalu `rejected`. `knowledge.approve` hanya lolos jika grant mencakup action itu, `autonomyStage >= 2`, `approvalRequired=true`, dan `approved=true` pada saat pengecekan.
- **Provenance wajib** (source, revision, URI, observed time, method, sensitivity, claims). Konten `confidential` tidak boleh masuk knowledge umum.
- **Store bukan database.** `exportState`/`importState` hanya membuktikan pengetahuan dapat dimuat ulang dari snapshot deterministik; ini **bukan** bukti persistensi NEXUS Supabase, bukan bukti pembelajaran lintas-perangkat, dan bukan klaim NEXUS sudah "terlatih" secara durable.
- **Capability tidak dapat diperpanjang sendiri.** Tidak ada API untuk mengubah grant; RADAR satu-satunya issuer. Semua keputusan deny by default dan diaudit.

## Tes yang dijalankan

- `node --test test/nexus-core-learning.test.mjs` → **10/10 pass**.
- `npm test` → **251/251 pass**, 0 fail (termasuk seluruh suite existing; script diperbarui menyertakan `test/*.test.mjs`).
- Strict TypeScript `tsc --noEmit -p tsconfig.json` (typescript 5.9.3 via `node node_modules/typescript/bin/tsc`) → **exit 0**. node_modules lalu dihapus; tidak masuk commit.
- `git diff --check` → clean. Secret scan pada file baru → tidak ada kredensial.

## Yang belum ada (jangan diklaim aktif)

- N2: workflow change-proposal → branch terisolasi → test/security → diff artifact → approval request; capacity token dengan tanda tangan kriptografik (saat ini hanya validasi struktural).
- N3: dashboard control center NEXUS (status provider, agent registry, antrean tugas, approval, audit, kill switch).
- N4: provider adapter nyata (default OFF, gratis terverifikasi), critic/comparison model, benchmark regression.
- N5: NEXUS database persistence, RLS/backup test, worker/scheduler — semuanya menunggu persetujuan BOS dan MCP/storage yang terverifikasi.
- Tidak ada live trading, withdrawal, order, worker produksi, scheduler, layanan berbayar, atau secret di klien/log/repo. Rp0.

## NEXT TASK

Lanjut N2: capability-based development workflow dengan change proposal dan artifact diff, tetap deny-by-default dan tanpa PR duplikat. Setelah antrean PR ≤2, baru buka PR untuk slice ini dan verifikasi exact-head CI + security.

## N2 — capability-based development workflow (slice)

`src/nexus/core/development.mjs` menambah `createChangeProposal` → `buildPreview` → `submitProposal`:

- Proposal divalidasi dengan grant `repo.read`; file ditolak jika traversal, absolut, `.env`/secret/`node_modules`/`.git`, atau lebih dari 20 file.
- `acceptanceTests` hanya allowlist (`npm test`, `npm run typecheck`, `node --test test/…`, `python3 -m unittest`); meta-shell ditolak.
- `buildPreview` hanya teks deterministik — tidak membaca repository, tidak menjalankan perintah, tidak menulis file.
- `submitProposal` memerlukan action `repo.patch.propose`, `approvalRequired=true`, `approved=true`, correlation ID yang cocok, dan grant belum kedaluwarsa. Tanpa itu hasil `denied`; tidak ada patch yang diterapkan.
- Tes: `test/nexus-core-development.test.mjs` 4/4 pass; `npm test` 255/255; strict tsc exit 0.
