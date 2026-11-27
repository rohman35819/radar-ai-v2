# Audit Integrasi RADAR NEXUS — Supabase (read-only)

Tanggal: 27 November 2026 · Branch: `docs/supabase-nexus-audit` (dari `develop` `411e7b7`) · Status: **audit dokumen saja; integrasi tidak aktif**.

Proyek yang dituju: ref `gjchftphwexpjpvdpqoj`, `https://gjchftphwexpjpvdpqoj.supabase.co`. Nomor proyek bukan rahasia; kredensial tidak diminta, tidak diterima, dan tidak disimpan.

## 1. Bukti koneksi MCP — GAGAL (tidak dapat dilakukan)

| Pemeriksaan | Hasil |
|---|---|
| `tools.opencode.list_mcp_resources({})` | `{"resources":[],"templates":[]}` — tidak ada server MCP terdaftar |
| Katalog tool Code Mode | Hanya namespace `tools.opencode.*` (8 tool); **tidak ada tool Supabase MCP** |
| `command -v supabase` | tidak ditemukan (CLI tidak terpasang) |
| Env `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | semuanya **unset** (hanya keberadaan yang dicek, nilai tidak dibaca/dicetak) |
| `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `MCP_CONFIG` | unset; tidak ada `opencode.json`/`.mcp.json` di home maupun repository |
| Probe jaringan tanpa kredensial | `GET /` → HTTP 404, `GET /rest/v1/` → HTTP 401, `ssl_verify_result=0` (TLS valid) |

**Kesimpulan:** host Supabase dapat dijangkau dari Termux, tetapi **Supabase MCP resmi tidak terhubung** — tidak ada server/tool yang terdaftar dan tidak ada mekanisme autentikasi yang dikonfigurasi. Ini adalah **gap konfigurasi klien**, bukan kegagalan proyek Supabase dan bukan bukti kredensial salah. Tidak ada service_role key, database password, atau secret BOS yang diminta/ditampilkan. Tidak ada percobaan login, token, atau autentikasi alternatif.

**Dampak:** semua temuan di bawah berasal dari **repository**, bukan dari kueri langsung ke database produksi. Status tabel di produksi **tidak diverifikasi**.

## 2. Inventaris migration di repository

### 2.1 `supabase/migrations/` (ditujukan untuk proyek Supabase)
| File | Objek | Catatan |
|---|---|---|
| `20261124_radar_state.sql` | `public.radar_state (id, payload, updated_at)` | RLS aktif; `REVOKE ALL` dari `anon`, `authenticated`; `GRANT ALL` ke `service_role`. Komentar: "Run once in Supabase SQL Editor". **Tidak ada smoke test khusus**; status terapan di produksi tidak diketahui. |
| `20261124_radar_memory.sql` | `public.radar_memory_records` | Provenance-first, **proposal-only** (trigger `radar_memory_proposal_only` menolak status bukan `proposed`), RLS aktif, `service_role` hanya `SELECT, INSERT`, `anon`/`authenticated` dicabut semua. `search_vector` GIN untuk pencarian berscope. Komentar: terapkan hanya setelah proyek/backup disetujui BOS. |

### 2.2 `db/migrations/` (dijalankan pada PostgreSQL 16 **sekali pakai** di CI)
| File | Schema / objek |
|---|---|
| `001_agent_platform.sql` | `radar_agent`: `agent_registry`, `task_queue`, `task_dependencies`, `audit_events`, `platform_control`, `approval_requests`; fungsi antrean/klaim/lease/retry/approval. Default aman: agent `paused`, `autonomy_stage=0`, `daily_budget_usd=0`; `platform_control.paused=true`, `kill_switch=true`. |
| `002_queue_operations.sql` | Tambahan operasi queue, lease expiry, retry/dead-letter, approval inbox; `REVOKE ALL` fungsi kritis dari `PUBLIC`, `anon`, `authenticated`, `service_role`, `radar_agent_runtime`. |
| `003_market_data.sql` | `radar_market`: `assets`, `ingestion_runs`, `market_observations` (append-only), `market_candles` (partisi bulanan), `ingestion_checkpoints`. RLS aktif pada kelima tabel; `service_role` `SELECT,INSERT,UPDATE` sebagian, `market_observations` hanya `SELECT,INSERT`. |

Smoke test bersesuaian ada di `db/tests/001…003_*_smoke.sql` dan `supabase/tests/20261124_radar_memory_smoke.sql`; workflow `.github/workflows/test.yml` menjalankannya pada container PostgreSQL sekali pakai.

## 3. Status migration

- **Terverifikasi di CI (bukan produksi):** seluruh migration `db/migrations/001–003` + memory migration diterapkan dan diuji pada PostgreSQL 16 disposable pada setiap job `test`. Bukti historis di `RADAR_AI_MASTER_CONTEXT.md`: PR #110 (queue/memory smoke), PR #108 (queue hardening), PR #146/#147, serta konfirmasi terbaru bahwa `003_market_data_smoke.sql` menguji RLS/privilege, append-only observations, idempotensi, dan partisi.
- **Tidak terverifikasi:** apakah `radar_state`, `radar_memory_records`, `radar_agent.*`, atau `radar_market.*` benar-benar ada di proyek `gjchftphwexpjpvdpqoj`, versi skema terbaru mana yang aktif, dan apakah ada migration yang gagal/partial. Karena MCP tidak tersedia, hal ini **tidak dapat ditentukan** dalam sesi ini.
- Riwayat repository menyatakan berulang kali: **tidak ada production Supabase migration/credentials/activation** yang dilakukan sebelumnya. Jangan mengasumsikan tabel produksi sudah ada hanya karena migration ada di repo.

## 4. Tabel RADAR/NEXUS yang "ditemukan"

Ditemukan **definisi** (bukan instansi produksi):

- `public.radar_state` — state aplikasi persisten (dipakai adapter REST di `lib/ingest.js`: `GET/POST /rest/v1/radar_state?id=eq.main`).
- `public.radar_memory_records` — memori bersama Divisi 07, proposal-only, bersumber/provenance.
- `radar_agent.agent_registry`, `radar_agent.task_queue`, `radar_agent.task_dependencies`, `radar_agent.audit_events`, `radar_agent.platform_control`, `radar_agent.approval_requests`.
- `radar_market.assets`, `radar_market.ingestion_runs`, `radar_market.market_observations`, `radar_market.market_candles`, `radar_market.ingestion_checkpoints`.

Tidak ada tabel bernama `nexus_*`. **Itu disengaja:** NEXUS Core adalah server RADAR yang sama; CLI dan dashboard adalah dua klien dari kontrak `/api/ai/*`, bukan database/identitas AI kedua. Memori NEXUS harus memakai `radar_memory_records` yang sudah ada, bukan tabel baru.

## 5. Temuan keamanan & RLS

1. **Positive — least privilege memory:** `radar_memory_records` RLS aktif, `anon`/`authenticated` tanpa hak, `service_role` hanya `SELECT`+`INSERT`; trigger menjamin hanya baris `proposed` yang bisa masuk. Tidak ada jalur approval/update/delete untuk klien. (Smoke test CI membuktikan hal ini pada DB disposable.)
2. **Positive — platform kill switch:** `radar_agent.platform_control` default `paused=true` dan `kill_switch=true`; budget harian 0; approval requests hanya untuk owner DB.
3. **Perlu perhatian — RLS tidak dinyalakan di `radar_agent.*`:** keamanan bergantung pada `REVOKE`/`GRANT` peran, bukan kebijakan RLS. Jika peran baru menjadi owner atau `service_role` dipakai lebih luas, batasnya bisa melemah. Rekomendasi: evaluasi `ENABLE ROW LEVEL SECURITY` + policy eksplisit sebelum produksi (perubahan **membutuhkan persetujuan BOS**).
4. **Perlu perhatian — `radar_state` memberi `ALL` ke `service_role`:** satu kunci server untuk seluruh state (`id='main'`). Hindari paparan ke browser/CLI; pisahkan scope per tenant/divisi jika dipakai banyak klien.
5. **`service_role` melewati RLS:** pada Supabase, service_role mengabaikan RLS, sehingga daftar `GRANT` adalah batas nyata. Jangan pernah mengirim kunci ini ke Termux, source, log, prompt, atau bundle frontend.
6. **Tidak ada policy `CREATE POLICY` eksplisit** pada tabel Supabase migration; dengan RLS aktif dan tanpa policy, peran non-owner default ditolak — ini aman, tetapi harus diverifikasi pada instance produksi setelah MCP tersedia.
7. **Project ref/URL bukan secret**, tetapi jangan menggabungkannya dengan kunci dalam log atau URL yang dibagikan.

## 6. Rencana integrasi NEXUS API (proposal — belum diaktifkan)

Prinsip: **satu NEXUS Core**, tidak ada backend/model/memory kedua.

1. **Fase 0 — akses (blocker):** daftarkan Supabase MCP resmi dengan scope **read-only dan project-scoped** untuk ref ini di klien OpenCode; gunakan mekanisme autentikasi resmi, bukan PAT/secret yang ditempel di chat. Verifikasi tabel, versi skema, dan RLS lewat MCP sebelum apa pun ditulis.
2. **Fase 1 — baca saja:** NEXUS CLI/dashboard tetap memanggil `/api/ai/command` dan `/api/ai/workspace`. Server yang melakukan pembacaan `radar_memory_records` melalui adapter yang sudah ada (`lib/knowledge/memory.js`), hanya `SELECT` pada record `approved`/`reviewed` yang relevan dengan tugas, dengan provenance (`source_ref`, `source_revision`) ditampilkan. Tidak ada kunci di klien.
3. **Fase 2 — kontrak bersama:** gunakan `radar-nexus-client.v1` dari `src/nexus/contracts.mts` sebagai satu kontrak untuk dashboard (#162) dan CLI (#163). Context selector 6.000 token (`lib/ai/context-budget.js`) membatasi cuplikan memori yang dikirim ke model.
4. **Fase 3 — tulis memori (butuh BOS):** hanya lewat jalur proposal `INSERT` dengan `status='proposed'`, `created_by`, `source_ref`, `source_revision`, `retention_until`. Approval/update/delete memerlukan API terpisah + persetujuan BOS + audit event. Tidak ada penulisan otomatis dari percakapan.
5. **Fase 4 — operasional (butuh BOS):** runtime worker/Agent Platform tetap OFF; tidak ada scheduler, order, withdrawal, atau layanan berbayar. PostgREST schema expose/GRANT/DDL production memerlukan approval + backup + rollback plan.

**Tidak dilakukan:** DDL/DML produksi, pembuatan database baru, perubahan GRANT/RLS, pengaktifan service, pembelian layanan, atau klaim integrasi aktif.

## 7. Tes yang dijalankan dan hasilnya

| Pemeriksaan | Hasil |
|---|---|
| Discovery MCP (tool + resource) | Gagal — tidak ada server/tool Supabase |
| `command -v supabase` | Tidak ditemukan |
| Env & file konfigurasi | Tidak ada kredensial/konfigurasi MCP |
| Probe jaringan tanpa auth | TLS valid; `/` 404; `/rest/v1/` 401 (tanpa kunci, sesuai expected) |
| Inventaris migration | 5 file SQL migration, 5 file smoke test teridentifikasi |
| `node --test test/memory-store.test.js test/radar.test.js test/market-data-store.test.js test/ingest-concurrency.test.js` | **51/51 pass**, 0 fail — adapter REST state/memory/market tetap benar secara lokal |
| Kueri ke database produksi | **Tidak dijalankan** (tidak ada MCP/kredensial; juga tidak diizinkan tanpa BOS) |

## 8. Blocker & NEXT TASK

- **Blocker utama:** Supabase MCP resmi belum terdaftar/terkonfigurasi di environment Termux. Tanpa itu, status tabel produksi dan RLS tidak dapat diverifikasi.
- **Blocker kebijakan:** semua perubahan skema produksi (DDL/GRANT/RLS) dan aktivasi integrasi memerlukan persetujuan BOS.
- **Blocker antrean:** PR non-draft menuju `develop` masih 4 (> WIP 3), jadi audit ini **tidak dibuka sebagai PR**.
- **NEXT TASK:** setelah BOS menghubungkan Supabase MCP read-only project-scoped, jalankan inspeksi schema/RLS (tanpa mutation), cocokkan dengan migration di repo, dokumentasikan drift, lalu minta keputusan BOS untuk Fase 1. Jangan menulis ke produksi sebelum ada approval dan backup.

## 9. Pernyataan batas kebenaran

Dokumen ini adalah **audit berbasis repository dan pemeriksaan klien**, bukan bukti koneksi ke database, bukan bukti migration terpasang, dan bukan integrasi aktif. Tidak ada secret, service_role key, atau password database yang diminta, diterima, dicatat, atau dikirim ke mana pun. Tidak ada layanan berbayar yang diaktifkan. Rp0 tetap berlaku.
