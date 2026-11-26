# RADAR AI V2 — Autonomous Quant Trading Platform: Capability & Gap Audit (P0)

**Status:** P0 delivery — read-only audit and architecture specification. No production runtime, database, deployment, credential or trading behavior was changed by this document.
**Owner:** BOS · **Lead:** Grok (Lead Software Engineer) · **Supporting:** Divisi 01, 03, 04, 05, 06, 07 · **Date:** 27 November 2026 (Asia/Jakarta)
**Source mandate:** [Issue #150](https://github.com/rohman35819/radar-ai-v2/issues/150) and BOS Master Execution Order.

> Sapaan untuk pemilik proyek: **BOS**.

## 1. Evidence base (verified live, not assumed)

| Item | Verified value |
|---|---|
| `origin/main` (production truth) | `f38d25a6203ab486d7170369e86874f838af627a` — rilis v2.3.2 |
| `origin/develop` (integration lane) | `1226a5d96072fe626b1a554192e4d652d440c8e0` |
| Divergensi | `main` 3 commit ahead, `develop` 23 commit ahead dari merge-base `63d950e2...` |
| PR terbuka (27 Nov) | 4: #151 (→main, docs), #149 (draft, →develop), #115 (→develop), #105 (→develop). Non-draft ke `develop`: 2 — masih di bawah WIP limit 3 |
| Audit branch | `docs/quant-platform-capability-audit` @ `1226a5d` |
| `npm test` lokal pada branch audit | **233 pass, 0 fail, 0 skipped** (Node v24.22.3, npm 12.2.3) |
| CI/security | Klaim CI di dokumen lama berlaku untuk SHA lama; SHA audit ini belum diverifikasi Actions sampai PR dibuat |
| Hostless Build / LIVE | **TIDAK diverifikasi**. Tidak ada akses dashboard/log Hostless pada sesi ini |

Aturan pembacaan: `RADAR_AI_SHARED_MEMORY.md`, `AGENTS.md` (termasuk Engineering Constitution), `RADAR_AI_MASTER_CONTEXT.md` (bagian 35, 37, 51, 52, 57, 65), `RADAR_AI_ADVISOR_HANDOFF.md`, dan `GROK.md` dibaca lengkap. Status di bawah dibedakan antara **main** (produksi) dan **develop** (integrasi). Kode di `develop` belum tentu LIVE.

### 1.1 Status legend

- **IMPLEMENTED** — kode ada, dapat diuji, dan tes terkait lulus pada branch yang disebut.
- **PARTIAL** — ada bagian nyata, tetapi cakupan belum memenuhi definisi mandat.
- **PLANNED** — desain/backlog ada, kode tidak ada.
- **ABSENT** — tidak ditemukan implementasi pada kode yang diaudit.
- **BLOCKED** — implementasi tertahan oleh keputusan/akses/keamanan eksternal.

## 2. Capability gap matrix — mandat produk

### A. Market Intelligence Engine

| Kapabilitas | Status | Bukti (file / tes) | Celah & blocker |
|---|---|---|---|
| Multi-venue market data | **IMPLEMENTED (main)** | `lib/sources.js` (CoinGecko AI-category markets, DeFiLlama protocols/fees/revenue, RSS), `lib/ingest.js` (`refresh`, `runBounded`), `GET /api/snapshot` di `server.js`; `test/radar.test.js`, `test/news.test.js` | Venue terbatas pada source publik; bukan order-book lintas-venue penuh |
| Volume & liquidity | **PARTIAL (main)** | `lib/ingest.js` field `vol10m`; `lib/dexscreener.js` pair liquidity/volume; `test/dexscreener.test.js` | `vol10m` adalah estimasi selisih rolling 24h antar refresh, **bukan** candle 10m native; likuiditas DEX tidak tergabung dengan venue terpusat |
| Technical indicators | **PARTIAL (main & develop)** | `lib/exchange.js` (`toBuckets10m`, `analyze10m`); `public/app.js` `indicatorSummary`; `test/market-intelligence.test.js` | Tidak ada library indikator terstandardisasi multi-timeframe; tidak ada OHLCV per-aset tersimpan di `main` |
| Derivatives — funding & open interest | **PARTIAL (main)** | `lib/derivatives.js` (Binance USDⓈ-M funding, mark price, OI, 24h ticker; TTL 5m, cache/in-flight bound), route `/api/market-intelligence/derivatives`, `test/derivatives.test.js` | Satu venue; tanpa funding/OI historis, tanpa liquidation levels, tanpa normalisasi lintas-venue |
| Market regime | **ABSENT** | Label/regime hanya ditemukan sebagai teks/UI di `public/market.*`; tidak ada modus/compute engine di `lib/` atau `src/` | Perlu definisi deterministik (trend/volatility/liquidity regime) + validasi |
| Whale / on-chain intelligence | **PARTIAL (main)** | `lib/onchain.js` (GeckoTerminal new/trending pools), `lib/solscan.js` (wallet, transfer, token, server-side key), `lib/goplus.js` (token security), `lib/exchanges.js` (ticker publik); `test/onchain.test.js`, `test/solscan.test.js`, `test/goplus.test.js` | Heuristik "whale/smart money" belum dikalibrasi; identitas lintas-chain belum canonical; data Solscan bergantung API key Hostless yang belum terverifikasi |
| Provenance / freshness / quality | **PARTIAL (develop)** | `src/contracts.mts` + `test/typescript-contracts.test.js` menolak payload cacat; `lib/market-intelligence.js` menyimpan `updated_at`/`stale`; `db/migrations/003_market_data.sql` (develop) berisi `source`, `observed_at`, `ingestion_runs`, `checkpoints` | `main` belum punya kontrak provenance terpadu untuk **setiap** observasi; migrasi 003 belum ada di `main`; tidak ada quality flag yang mengikat keputusan |

### B. Quant Research Engine

| Kapabilitas | Status | Bukti | Celah |
|---|---|---|---|
| Deterministic features / SMA | **PARTIAL (develop only)** | `research/python/backtest.py` (`_sma_series` O(n), sinyal pada close sebelumnya → anti-look-ahead), `research/python/test_backtest.py` | Hanya SMA; tidak ada di `main`, tidak terhubung ke dashboard |
| Factor scoring / momentum / volatility | **PARTIAL (main)** | `lib/screener.js`, `public/app.js` `rankTop5` dengan field nyata + `test/top5.test.js` (`buildTradePlan` memakai volatilitas histori, guard `NOT_ENOUGH_DATA`) | Skor belum menghasilkan faktor risk-adjusted yang tervalidasi out-of-sample |
| Risk-adjusted opportunity scoring | **ABSENT** | Tidak ada implementasi Sharpe/Sortino/expectancy sebagai skor peluang | Perlu definisi + tes deterministik sebelum AI dilibatkan |
| Walk-forward / out-of-sample | **ABSENT** | Tidak ada di `research/python/` maupun kode lain | Mandat P2 issue #150 belum terpenuhi |
| Reproducible dataset / experiment manifest | **ABSENT** | Backtest menerima CSV, tetapi tidak ada manifest hash kode/data/konfigurasi | Diperlukan untuk audit & replikasi |

### C. AI Research Council

| Kapabilitas | Status | Bukti | Celah |
|---|---|---|---|
| Multi-provider AI + fallback | **IMPLEMENTED (main)** | `lib/ai/openai.js`, `gemini.js`, `groq.js`, `openrouter.js`, `chat-completions.js`, `group.js`, `workspace.js`, `request-queue.js`, `usage.js`, `autonomous-agent.js`; `test/ai-*.test.js`, `test/autonomous-agent.test.js` | Groq opt-in dan OFF; OpenRouter fallback `openrouter/free` |
| AI Council / Workspace / Command Center UI | **IMPLEMENTED (main)** | `/api/ai/group`, `/api/ai/workspace`, `/api/ai/command`, `public/command.*`, menu AI Council & AI Workspace | Peserta rapat adalah provider generik, **bukan** enam peran specialist yang dimandatkan |
| Enam specialist agent (Market Analyst, Quant Research, Strategy Developer, Risk Analyst, Portfolio Manager, Independent Reviewer) | **ABSENT** | Tidak ada registry peran/agent di kode yang diaudit | Perlu didefinisikan sebagai kontrak agent, bukan sekadar label prompt |
| AI tunduk pada validasi deterministik & anti-fabrikasi | **PARTIAL (main)** | `test/top5*.test.js` menolak angka acak, data stale, tanpa ID/harga; `lib/ai/chat-completions.js` menormalkan output | Belum ada gate arsitektural yang memblokir output AI yang bertentangan dengan hasil deterministik secara global |
| Provider quota / biaya / observability | **PARTIAL (main)** | `lib/ai/usage.js`, `lib/ai/request-queue.js`, `test/ai-usage.test.js` | Tidak ada budget harian per-divisi/agent yang dieksekusi runtime |

### D. Strategy Engine

| Kapabilitas | Status | Bukti | Celah |
|---|---|---|---|
| Backtest dasar + fee/slippage + drawdown | **PARTIAL (develop only)** | `research/python/backtest.py`: `run_backtest(fee_bps, slippage_bps)`, `max_drawdown_pct`, `run_parameter_sweep` (serial atau process pool, hard cap 4) | Offline, CLI-only, belum ada di `main`; satu strategi SMA; tanpa funding/benchmark |
| Strategy registry & versioning | **ABSENT** | Kata "strategy" hanya muncul sebagai argumen/parser pada backtest Python | Tidak ada `strategy_id`/`version`/hash kode/data |
| Walk-forward / out-of-sample | **ABSENT** | — | P2 mandate |
| Performance evaluation lengkap | **PARTIAL** | Net PnL + max drawdown saja | Tidak ada expectancy, profit factor, win rate, Sharpe, sample size, confidence interval, MAE/MFE |

### E. Portfolio & Risk Engine

| Kapabilitas | Status | Bukti | Celah |
|---|---|---|---|
| Position sizing / exposure / korelasi | **ABSENT** | Tidak ada modul portofolio di `lib/`, `src/`, atau `server.js` | — |
| Max daily loss / max drawdown stop | **ABSENT** | — | — |
| Stale-data block sebelum keputusan | **PARTIAL (main)** | `public/app.js` melacak `snapshotReachable` terpisah dari data lama; adapter menyimpan `stale` | Belum ada pre-decision gate terpusat yang memblokir sinyal saat data stale/partial |
| Emergency kill switch | **PARTIAL (schema/UI only)** | `db/migrations/001_agent_platform.sql` → `platform_control` (pause + kill switch default); `public/trading.html` menyebut pengaman | Tidak ada runtime yang mengeksekusi kill switch; tidak terhubung ke engine apa pun karena engine eksekusi belum ada |

### F. Execution Engine

| Kapabilitas | Status | Bukti | Celah |
|---|---|---|---|
| Exchange read-only adapter | **IMPLEMENTED (main)** | `lib/exchanges.js` (Binance/Bybit signed GET, normalisasi saldo/posisi, timeout, sanitasi error), `test/exchanges.test.js`; endpoint privat dilindungi `EXCHANGE_ACCESS_TOKEN` dengan `timingSafeEqual` | Read-only; bukan execution |
| Paper trading / simulated orders | **ABSENT** | Tidak ada modul `paper`, `order lifecycle`, `fill`, atau `reconciliation` di kode | Mandat P3 issue #150 |
| Order lifecycle / fill simulation / reconciliation | **ABSENT** | — | — |
| Live trading | **ABSENT (sesuai mandat)** | Tidak ada endpoint order/withdraw/transfer | Tetap OFF; hanya boleh dibangun pada P5/P7 dengan persetujuan BOS terpisah |

## 3. Divisi 06 — Agent Platform & Automation

| Komponen | Status | Bukti | Celah |
|---|---|---|---|
| Agent registry | **PARTIAL (schema, main)** | `db/migrations/001_agent_platform.sql` → `radar_agent.agent_registry`, division 01–08 | Tidak ada runtime registry/API; tidak ada agent specialist terdaftar |
| Durable task queue + dependencies | **PARTIAL (schema, main)** | `db/migrations/001` + `002_queue_operations.sql` → `task_queue`, `task_dependencies`, fungsi `enqueue_task`, `claim_task`, `heartbeat_task`, `complete_task`, `fail_task`, `reclaim_expired_leases`, `prevent_dependency_cycles`; `db/tests/001`, `002` | Skema/DB-only. Tidak ada adapter runtime yang memanggil fungsi-fungsi ini pada `main` |
| Audit events & approval queue | **PARTIAL (schema, main)** | `audit_events` + trigger append-only, `approval_requests`, `request_approval`/`resolve_approval`, `set_platform_control` | Tidak ada UI/runtime; atribut actor trusted belum dibuktikan |
| Kill switch / pause / budget Rp0 | **PARTIAL (schema)** | `platform_control` default paused + kill switch on, `daily_budget_usd = 0`, `max_concurrency = 1` | Policy/schema saja; bukan enforcement runtime |
| Scheduled worker | **PARTIAL (main)** | `.github/workflows/autonomous-development.yml` (every 2 jam + manual dispatch, sudah ada di `main`), `lib/ai/autonomous-agent.js` (allowlist maks. 3 file `lib/ai/*.js`/`test/*.test.js`, patch divalidasi, `npm test`, branch `fix/*`, Draft PR, tidak merge/deploy) | Periodik, **bukan** 24/7; backpressure satu PR; Groq default `0`; bukan orchestrator multi-divisi |
| Queue-driven worker / lease fencing / idempotency / restart recovery | **PLANNED / BLOCKED** | Issue #30; `docs/AUTONOMOUS_AGENT_RUNTIME.md` Stage 2 | Tidak ada runtime; Production Supabase/DB activation memerlukan persetujuan BOS |
| Operasi riset saat BOS offline | **PARTIAL** | GitHub Actions berjalan tanpa telepon/Termux | Workflow harus berada di default branch `main` untuk schedule; bukan continuous; tidak ada durable state |

**Kesimpulan Divisi 06:** fondasi **schema + worker periodik terbatas** sudah nyata, tetapi **tidak ada runtime otonom yang mengklaim task durable**. Jangan mengklaim otonomi offline aktif.

## 4. Divisi 07 — Knowledge & Memory Intelligence

| Komponen | Status | Bukti | Celah |
|---|---|---|---|
| Shared cross-agent memory | **IMPLEMENTED** | `RADAR_AI_SHARED_MEMORY.md` (curated, <12 KB, bukan chat archive) | File handoff statis, bukan sistem retrieval |
| Memory record validator + adapter | **PARTIAL (main)** | `lib/knowledge/memory.js`: `validateProposal` mewajibkan `sourceRef`, `sourceRevision`, `retentionUntil`, `supersedes`, `confidence`; menolak pola secret; `createMemoryStore` (PostgREST), `test/memory-store.test.js` | **BLOCKER:** tabel `radar_memory_records` tidak didefinisikan di `db/migrations/001–003`. Adapter belum bisa dipakai secara durable |
| Provenance / versioning / retention model | **PARTIAL (design + validator)** | `docs/division-07-memory-knowledge-architecture.md`, `lib/knowledge/memory.js` | Tidak ada tabel, indeks full-text, atau kebijakan retention yang dieksekusi |
| Strategy/decision/task memory & retrieval | **PLANNED** | Desain saja | Belum ada implementasi; dilarang menambah vector DB/Redis tanpa justifikasi biaya & privasi |

## 5. Quant Command Center (UI)

| Kapabilitas | Status | Bukti |
|---|---|---|
| Dashboard & menu lama | **IMPLEMENTED (main)** | `public/index.html`, `app.js`, `style.css`, `market.*`, `solscan.*`, `trading.*`, `command.*`, `membership.*`, `sw.js`; route `/`, `/market.html`, `/solscan.html`, `/trading.html`, `/command.html`, `/membership.html` + `top5.js` |
| Transparansi data (tidak ada angka demo sebagai live) | **PARTIAL** | `public/app.js` `rankTop5` & `buildTradePlan` dari field nyata; Radar Intelligence menandai kemampuan unavailable; snapshot failure menampilkan banner data lama |
| Panel Quant Command Center baru (Global Market Overview, Heatmap, Quant Signals, AI Council specialist, Strategy Perf, Backtest, Portfolio, Risk, Paper Trading, Agent Ops, Knowledge, Trading History) | **ABSENT / PARTIAL** | Sebagian kecil sudah ada (Market Intelligence page, Top 5, Radar Intelligence panel); mayoritas panel belum ada |

**Kewajiban:** seluruh menu/route lama harus dipertahankan. Panel baru ditambahkan sebagai perluasan, bukan pengganti.

## 6. Safety & threat model

| Kontrol | Status enforcement | Bukti |
|---|---|---|
| Secret hanya server-side; tidak di Git/frontend/log | **ENFORCED (sebagian)** | Gitleaks + Trivy di `.github/workflows/security.yml`; `lib/knowledge/memory.js` menolak secret-like content; `test/exchanges.test.js`/`test/solscan.test.js` menolak kebocoran kredensial; tidak ada secret ditemukan pada diff audit |
| Admin token constant-time | **IMPLEMENTED (main)** | `server.js` `matchesToken` + `timingSafeEqual`; `test/radar.test.js` |
| Endpoint akun exchange butuh token privat | **IMPLEMENTED (main)** | `/api/exchanges/{binance,bybit}/account` → 401/503; status publik hanya boolean |
| Trading live / withdrawal / transfer | **ABSENT (benar)** | Tidak ada endpoint order/withdraw; tidak boleh diaktifkan tanpa BOS |
| Branch protection `main` | **POLICY-ONLY** | Aturan tertulis di `AGENTS.md`, tetapi `main` dilaporkan unprotected dan tidak ada akses admin untuk memverifikasi/mengubah |
| Independent QA / Divisi 01–05 sign-off | **POLICY-ONLY (temporary override aktif)** | Self-review + exact-head CI dipakai untuk routine work; QA manual tidak dianggap terjadi tanpa bukti |
| Hostless Build / LIVE | **UNVERIFIED** | Tidak ada akses dashboard/log; tidak boleh diklaim dari CI |

**Ancaman utama yang masih terbuka:** (1) AI/output bisa tampil meyakinkan tanpa ikatan bukti deterministik; (2) data stale/partial belum diblokir terpusat sebelum keputusan; (3) skema queue/memory tanpa runtime enforcement mudah disalahartikan sebagai "sistem berjalan"; (4) EROFS/Hostless `DATA_DIR` membuat durability apa pun tidak bisa dipastikan; (5) tidak ada audit trail paper-trading karena paper trading belum ada.

## 7. Spesifikasi arsitektur target (modular monolith, inkremental)

Mengikuti `docs/architecture/engineering-constitution.md` §1 dan `docs/architecture/scale-roadmap.md`: **TypeScript-first untuk modul baru**, JavaScript lama dipertahankan dengan parity test, Python hanya riset/backtest offline, SQL untuk migrasi/invariant. Tidak ada dependency/infrastruktur baru tanpa justifikasi Rp0.

### 7.1 Batas modul (domain ownership)

| Domain | Modul baru | Divisi | Batas |
|---|---|---|---|
| Market data | `src/domain/market/observation.mts` (normalisasi + contract) | 03/04 | Adapter provider tidak boleh bocor ke domain lain; setiap observasi punya provenance |
| Quant research | `src/domain/quant/features.mts`, `signals.mts` | 04 | Deterministik,murni, tanpa I/O; AI hanya menarasikan |
| Strategy | `src/domain/strategy/registry.mts`, `version.mts` | 04/03 | Registry immutable per versi; hash kode+data+config |
| Risk | `src/domain/risk/limits.mts`, `decision.mts` | 03/01 | Fail-closed; stale/partial tertiary block |
| Paper execution | `src/domain/execution/paper.mts` | 03 | Simulasi saja; tidak ada koneksi order nyata |
| Agent platform | `src/platform/registry.mts`, `task-client.mts`, `approval.mts`, `killswitch.mts` | 06 | Runtime adapter ke skema `radar_agent.*`; permission least-privilege |
| Knowledge/memory | `src/memory/store.mts`, `retrieval.mts` | 07 | Provenance + scope filter sebelum ranking; tanpa vector DB |
| Audit | `src/platform/audit.mts` | 01/06 | Append-only, sanitized, correlation ID |

### 7.2 Kontrak inti (versi 0 — deterministik, dapat diuji)

- `Observation`: `{ entity: { chain, contract?, venue, symbol, base, quote, kind }, source, source_ref, observed_at, published_at?, interval, value, unit, quality: 'ok'|'stale'|'partial'|'missing', schema_version }`. Missing ≠ 0.
- `Signal`: `{ signal_id, strategy_id, strategy_version, observed_at, direction, confidence, reasons[], evidence_observation_ids[], expires_at, status }`. Tanpa evidence ID → `NOT_ENOUGH_DATA`.
- `StrategyVersion`: `{ strategy_id, version, code_hash, data_hash, config_hash, created_at, status }`.
- `BacktestResult`: `{ strategy_version, period, net_pnl_pct, fee_bps, slippage_bps, funding_bps, max_drawdown_pct, sample_size, expectancy, profit_factor, sharpe?, out_of_sample: boolean }`. Tidak ada klaim profit dijamin.
- `RiskDecision`: `{ allow: boolean, reasons[], limits_snapshot, stale_block: boolean, kill_switch: boolean }`.
- `PaperOrder` / `PaperFill`: lifecycle `created → submitted → filled|cancelled|rejected`, Reconciliation `{ expected, actual, differences[] }`.
- `Task` / `AuditEvent` / `MemoryRecord`: mengikuti skema `radar_agent.*` dan `lib/knowledge/memory.js` yang sudah ada — **jangan membuat skema paralel**.
- `AgentRole` (enam specialist) adalah konfigurasi registry, bukan janji bahwa model akan benar.

### 7.3 Aturan integritas

1. Validasi deterministik berjalan **sebelum** AI; AI tidak boleh mengubah angka hasil hitungan.
2. Setiap keputusan trading (termasuk paper) wajib memiliki `RiskDecision` + `AuditEvent` + provenance observasi.
3. Stale/partial/missing → blokir, bukan fallback ke nol.
4. Kill switch dan pause diperiksa sebelum claim task **dan** sebelum setiap effect.
5. Semua modul baru punya unit test deterministik dengan data sintetis; tidak mengakses akun nyata.
6. Tidak ada modul yang mengaktifkan live trading, withdrawal, paid service, atau produksi DB dengan sendirinya.

## 8. Backlog terurutan (P0 → P7)

| Fase | Deliverable | Acceptance criteria | Gate sebelum lanjut |
|---|---|---|---|
| **P0 — selesai pada dokumen ini** | Matrix capability/gap, architecture spec, threat model, backlog | Bukti SHA & tes tercantum; tidak ada perubahan produksi | Review PR + CI exact-head |
| **P1 — Divisi 06/07 foundation** | `AgentRole` registry (6 specialist) + `Task` client adapter ke skema existing + `MemoryRecord` migration (`radar_memory_records`) + audit event sanitizer; semua disabled-by-default | Unit test deterministik; migration smoke di PostgreSQL disposable; Gitleaks/Trivy; tidak ada worker produksi | P0 merge + exact-head CI + security |
| **P2 — Market Intelligence & Quant Research** | `Observation` contract, provenance/freshness flags, features deterministik, factor score dasar | Contract test menolak payload cacat; nol data tidak dianggap valid; source/timestamp hadir | P1 acceptance |
| **P3 — Strategy & Backtest** | Strategy registry/versioning, walk-forward + out-of-sample, fee/slippage/funding, metrik lengkap | Backtest deterministik & reproducible; anti-look-ahead test; tidak ada klaim profit | P2 acceptance |
| **P4 — Portfolio/Risk & Paper Trading** | Position sizing, exposure/daily-loss/drawdown limit, stale block, paper order lifecycle + reconciliation + audit | Fail-closed tests; restart recovery di disposable env; kill switch test | P3 acceptance |
| **P5 — Quant Command Center** | Panel baru di atas, mempertahankan semua menu lama | UI test menu lama + panel baru; tidak ada angka demo sebagai live; mobile/desktop QA | P4 acceptance + browser QA |
| **P6 — Autonomous research & scheduled ops** | Satu bounded read-only research worker, durable queue/memory, scheduler, budget, approval, kill switch, QA independen | Restart/reclaim/idempotency test; audit lengkap; Rp0; disetujui BOS untuk aktivasi | P5 + persetujuan BOS |
| **P7 — Live trading readiness** | Assessment, permission review, small bounded pilot, monitoring & emergency stop | **Persetujuan BOS eksplisit terpisah**; tidak ada withdrawal; QA/Security independen | P6 + BOS approval |

**Next task tunggal:** P1 — implementasi fondasi Divisi 06/07 pada branch terpisah dari `develop`, dimulai dari **migration `radar_memory_records`** dan `AgentRole` registry (enam specialist) dengan tes, tanpa mengaktifkan worker/produksi.

## 9. Non-goal & larangan (berlaku selama audit dan implementasi)

- Tidak mengubah route, menu, kontrak API, atau state produksi yang sudah bekerja.
- Tidak menaruh secret di source/frontend/log/chat; tidak meminta API secret BOS.
- Tidak mengaktifkan live trading, withdrawal, transfer, order nyata, paid service, VPS, atau production DB.
- Tidak mengklaim Hostless Build/LIVE, CI, atau otonomi 24/7 tanpa bukti terpisah.
- Tidak menjanjikan profit; selalu laporkan performa bersih setelah biaya, drawdown, sample size, dan ketidakpastian.
- Tidak menambah vector DB, Redis, atau infrastruktur berbayar tanpa justifikasi terukur dan persetujuan.

## 10. Enforcement status ringkas

| Kontrol | Status |
|---|---|
| Branch/PR policy (`develop` lane, 3 PR WIP) | Policy + workflow branch-source check (sebagian terenforced) |
| `npm test` + syntax checks | Enforced di CI (233/233 lokal pada SHA audit) |
| TypeScript strict typecheck & Python tests | Enforced di CI untuk file yang ada di `develop` |
| PostgreSQL migration smoke | Enforced di CI pada DB disposable, **bukan** produksi |
| Gitleaks/Trivy | Enforced di CI security workflow |
| Branch protection `main` | Policy-only / tidak terverifikasi |
| Runtime agent permissions, approval, kill switch | Policy + schema only, **belum berjalan** |
| Hostless deployment & LIVE | Tidak diverifikasi |

## 11. Rollback

Dokumen ini tidak mengubah runtime, sehingga rollback = revert commit dokumentasi. Tidak ada migrasi produksi, perubahan konfigurasi, atau pergerakan dana.
