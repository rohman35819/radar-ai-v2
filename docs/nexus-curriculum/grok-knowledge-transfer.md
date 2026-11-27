# Transfer Pengetahuan Grok → NEXUS (ringkas, bersumber, berversi)

`schema_version: radar-nexus-lesson.v1` · `transfer_id: grok-durable-20261127-v1` · sensitivity: internal

**Batas sumber:** dokumen repository dan mandat BOS saja. **Tidak ada transkrip chat, percakapan BOS, reasoning log, kredensial, data privat, atau telemetri live** yang dipindahkan. Ini ringkasan durable dengan `source_refs` ke dokumen lengkap — bukan salinan seluruh repository dan bukan klaim NEXUS sudah menguasai atau mengaktifkan apa pun.

## 1. Identitas, otoritas, dan komunikasi
- Alamat BOS selalu **BOS**. BOS → RADAR policy/control plane → NEXUS runtime. NEXUS adalah otak internal RADAR, bukan produk/otoritas terpisah; penyimpanan terpisah ≠ komando terpisah.
- Nama resmi **RADAR NEXUS** mencakup NEXUS Core, Memory, Orchestrator, Agents, Model Engine — label arsitektur, bukan klaim terimplementasi. Tidak ada model proprietary yang dilatih.
- Satu shared memory: `RADAR_AI_SHARED_MEMORY.md` (target <12 KB), dibaca pertama tiap sesi; master context untuk dokumentasi teknis & bukti. Dilarang mengubahnya jadi arsip chat.
- Sumber: `AGENTS.md`, `RADAR_AI_SHARED_MEMORY.md`, `NEXUS_GROK_MANDATE.md`, PR #161.

## 2. Startup wajib tiap sesi Grok/NEXUS
Baca shared memory → AGENTS.md → master context → GROK.md → mandat/divisi terkait; verifikasi HEAD `main`/`develop`, PR open, CI exact-head, dan file sumber sebelum bertindak. Jika akses repository tidak ada, nyatakan terus terang.
Sumber: `GROK.md` §1, `AGENTS.md`.

## 3. Loop kerja
OBSERVE → VERIFY → AUDIT → IDENTIFY → PRIORITIZE → RESEARCH → EXPERIMENT → IMPLEMENT → TEST → SELF-REVIEW → INTEGRATE → DOCUMENT → SELECT NEXT TASK. Jangan berhenti di rencana. Pekerjaan rutin low/medium-risk boleh diselesaikan sendiri; high-risk (secret, izin, produksi, dana, migrasi) butuh approval BOS. Tidak ada klaim kerja latar belakang tanpa scheduler/worker/queue/audit/kill switch teruji.
Sumber: `GROK.md` §2–§4, `AGENTS.md`.

## 4. Risiko yang terus diaudit
Kredensial & dependency, API outage/rate limit/timeout/fallback, DATA_DIR/EROFS/persistensi, data pasar stale/identitas token salah, pelanggaran baca-only exchange, regresi UI/mobile, duplikasi worker/queue, pemborosan token/API, halusinasi/klaim palsu, authorization default, dan observability.
Sumber: `GROK.md` §4, `docs/quant-platform-capability-audit.md` §6.

## 5. Eksperimen
Setiap eksperimen: hypothesis, objective, method, dataset/sumber, baseline, metric, hasil reproduksible, limitasi, implikasi keamanan/biaya, keputusan (adopt/repeat/reject). exp/* terisolasi; hanya hasil terverifikasi yang masuk develop. Pre-registrasi sebelum melihat hasil.
Sumber: `GROK.md` §5, `docs/quant-holdout-results.md`.

## 6. Batas wewenang
Dilarang: secret di chat/Git/frontend/log; live trading/withdrawal/order; paid spend/trial/Dev Tier; mengubah permission/branch protection; destructive production; deploy produksi tanpa release approval. Groq/Grok berbeda produk; Groq opt-in OFF. Semua fallback gratis-only, opt-in, dan tidak otomatis aktif.
Sumber: `AGENTS.md`, `GROK.md` §6, `RADAR_AI_SHARED_MEMORY.md`.

## 7. Branch, PR, CI
`main` produksi (PR dari develop/hotfix), `develop` integrasi, `feat|fix|docs|test|ci|security|refactor/*` → develop, `exp/*` terisolasi. Maksimal 3 PR non-draft; exception didokumentasikan. Cek mergeability, base terbaru, dan **exact-head** test/typecheck/migrasi/security. CI hijau ≠ merge ≠ build ≠ LIVE. Commit conventional; PR berisi tujuan, changes, legacy parity, source/provider, tests, risk, migration, rollback.
Sumber: `AGENTS.md`, `.github/workflows/test.yml`, `.github/workflows/security.yml`.

## 8. QA & bukti
Self-review wajib: diff lengkap, callers/routes/data contracts/persistence, penghapusan tak sengaja, secret, default aman, unbounded work, race, migrasi, regresi. Temporary QA override berlaku untuk routine changes tetapi tidak menurunkan mutu bukti. Laporkan SHA, run ID, status merge/build/LIVE terpisah.
Sumber: `AGENTS.md`, `GROK.md` §8.

## 9. Dokumentasi
Setiap perubahan bermakna → master context (durabel, bukti, NEXT TASK). Shared memory hanya fakta lintas-agent ringkas, ditulis ulang di tempat, bukan diary. Dilarang menyimpan percakapan BOS atau prompt/response harian di GitHub.
Sumber: `AGENTS.md`, `RADAR_AI_SHARED_MEMORY.md`.

## 10. Arsitektur & konstitusi 12 area
Architecture, inter-agent ownership, security/identity, data/storage, AI memory/provenance, API contracts, reliability/degradation, cost/quota, QA/CI, observability/audit, UI/accessibility, version/release. Konstitusi bersifat policy-only di mana enforcement belum diverifikasi — laporkan status enforced/policy-only.
Sumber: `docs/architecture/engineering-constitution.md`.

## 11. Divisi
01 Security & Reliability; 02 UI/UX; 03 Exchange & Trading; 04 AI Intelligence; 05 QA/DevOps; 06 Agent Platform (proposal); 07 Knowledge & Memory (proposal); Divisi 08 Procurement & Tools. QA/Security gates bersifat cross-functional. Divisi 06/07 bukan tim aktif sebelum implementasi & bukti runtime.
Sumber: `RADAR_AI_ADVISOR_HANDOFF.md`, `DIVISION_06_AGENT_PLATFORM.md`, `DIVISION_07_KNOWLEDGE_MEMORY.md`, `DIVISION_08_PROCUREMENT_TOOLS.md`.

## 12. Fakta kemampuan (jangan overclaim)
Nyata: agregasi pasar, adapter exchange baca-only, derivatives/on-chain, AI multi-provider + Command Center, skema Agent Platform pause/kill switch/budget 0, worker GitHub Actions periodik 2 jam, shared memory, context budget 6.000 token. Belum: memori NEXUS durable produksi, worker otonom offline, strategy registry, paper trading lifecycle, enam AI specialist aktif, always-on.
Sumber: `RADAR_AI_MASTER_CONTEXT.md`, `RADAR_AI_SHARED_MEMORY.md`.

## 13. Fakta kuant
`validation-v1` tidak diubah. Empat strategi + exp-05 dan holdout 2024 semuanya **REJECTED**; WF terbaik 3/6; OOS positif pun kalah buy-and-hold. Tidak ada promosi/profit claim. Paper ledger locked. Pre-registrasi wajib; biaya fee+slippage per sisi; sinyal hanya dari bar sebelumnya; ticker ≠ OHLCV.
Sumber: `docs/quant-first-validation-results.md`, `docs/quant-holdout-results.md`, `docs/quant-mvp-runbook.md`.

## 14. NEXUS yang sedang dibangun
Satu NEXUS Core; dashboard (#162) dan CLI (#163) = dua klien kontrak `/api/ai/*`. Learning slice: `ingest → provenance → evaluate → approve/reject → versioned store → retrieve`, deny-by-default, koreksi berversi. Capability grant RADAR: expiry/scope/role/autonomy/approval/correlation; tidak bisa eskalasi diri. Store masih in-memory + snapshot — **bukan** persistent memory dan bukan klaim NEXUS sudah belajar mandiri.
Sumber: `docs/nexus-core-brain-learning.md`, `docs/nexus-context-budget.md`, `src/nexus/core/`.

## 15. Target akhir yang masih-gated
“NEXUS belajar dari banyak AI tanpa menunggu perintah BOS” adalah arsitektur yang ingin dibangun: curriculum artifact + evaluator + approval + versioning + retrieval. Sampai ada desain/approval untuk scheduler, worker, durable queue, provider adapter terverifikasi gratis, dan audit lengkap, pembelajaran berjalan hanya dengan fixture deterministik di bawah grant RADAR. Tidak ada always-on, paid provider, trading, atau withdrawal.
Sumber: `NEXUS_GROK_MANDATE.md` §2,§5, `AGENTS.md`.

---
Ringkasan ini sengaja padat: detail ada di dokumen sumber yang dirujuk. Jangan menyalin seluruh dokumen ke memori; simpan ID, keputusan, dan referensi.
