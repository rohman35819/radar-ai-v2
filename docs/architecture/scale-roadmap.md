# RADAR AI — Scalable Platform Architecture Roadmap

Status: approved direction for incremental implementation; this document does not activate infrastructure or change production runtime.

## Executive decision

Evolve RADAR from a single Node.js service with file/JSON-oriented market state into a typed, event-oriented platform with independently scalable API, ingestion, storage, research, and AI-worker responsibilities. Use a modular monolith first, then extract workers when measured load requires it. Do not perform a big-bang rewrite or introduce paid infrastructure before a measured need and explicit BOS approval.

## Language and runtime roles

| Technology | Primary responsibility | Adoption rule |
|---|---|---|
| TypeScript | Main product/API, domain contracts, ingestion adapters, orchestration and UI modules | Strategic default for new application code; migrate JavaScript module-by-module with parity tests |
| JavaScript | Existing V2 runtime and browser compatibility | Keep working modules until an equivalent typed replacement passes tests |
| Python | Offline quantitative research, reproducible backtests, data science and later model experiments | Separate research/worker process; never block the dashboard request loop |
| SQL / PLpgSQL | Relational constraints, transactional queue operations, aggregations and database-side invariants | Keep business workflows testable and least-privilege; migrations additive |
| Rust (conditional) | CPU-bound parsing, indicators or simulation hot paths | Only after profiling proves a bottleneck and a benchmark shows a meaningful gain |
| Go (conditional) | High-throughput network/worker services | Consider only if Node worker throughput or memory is a measured constraint |

Do not introduce Java, C++, Rust or Go merely to increase the language count. More runtimes increase build, security, observability and operational cost.

## Target logical architecture

1. API / dashboard layer (TypeScript + Node): stateless HTTP/API surface, authentication, validation, pagination, response shaping and compatibility with existing routes.
2. Ingestion layer (TypeScript workers): provider adapters, bounded parallel fetch, normalization, provenance, deduplication, rate-limit awareness and idempotent writes.
3. Durable data layer (PostgreSQL): normalized entities and source observations; OHLCV/time-series tables with time-based partitioning; indexes aligned to symbol/interval/time queries; materialized aggregates for dashboard reads.
4. Research layer (Python): reproducible offline experiments over versioned datasets; train/test separation, walk-forward evaluation, fee/slippage assumptions and experiment metadata. It has no exchange execution capability.
5. AI / agent layer: durable jobs and leases, per-provider quotas, bounded concurrency, approval gates, budget caps, audit records and a global kill switch.
6. Observability: structured logs, metrics, traces/correlation IDs, queue age/depth, provider latency/error/rate-limit signals, storage health and cost indicators.

## Data architecture and growth

- PostgreSQL is the system of record for normalized market observations and durable job state. The current JSON state remains a compatibility snapshot during migration; do not delete or replace it in one release.
- Store source, source timestamp, observed timestamp, schema/version, entity key and ingestion run ID with imported data. Never collapse missing/stale values into zero.
- Add append-oriented candle/observation tables and time partitioning before data volume demands it. Keep raw provider payload retention bounded and separately configurable.
- Use object storage for immutable raw archives only after a provider, retention policy, access policy and cost are approved. Do not add a paid bucket/service automatically.
- Use Redis only if profiling demonstrates a cross-process cache/coordination need that PostgreSQL and process-local caches cannot meet. It is not a source of truth.
- Design backfill as resumable, rate-limited, checkpointed and idempotent. Never run an unbounded historical backfill against production.

## Throughput and resource policy

- Maximize useful throughput, not raw concurrency. Every worker pool needs explicit concurrency, queue capacity, request timeout, retry budget, exponential backoff with jitter, provider-specific rate limits and backpressure.
- Parallelize independent providers only within their separate quotas. Preserve dependency ordering where one stage consumes another stage's output.
- Use bounded batches and pagination; avoid loading unbounded history into memory. Stream large CSV/JSON datasets.
- Scale horizontally from observable queue age/depth, CPU, memory, latency and provider quotas. Never infer that more workers are faster when a provider is rate-limited.
- Budget controls and kill switches apply to AI/provider calls. No automatic switch to paid models or paid infrastructure.

## Migration sequence and gates

### Phase 0 — typed contracts and research baseline (this branch)
- Add strict TypeScript type-checking in CI and runtime contract tests while production remains JavaScript.
- Keep Python backtesting offline, deterministic and standard-library-only.
- Publish this architecture and preserve existing API/JSON state contracts.
- Gate: exact-head npm tests, TypeScript type-check, Python unit tests, PostgreSQL smoke tests and Gitleaks/Trivy.

### Phase 1 — typed application modules
- Migrate one bounded backend domain at a time (starting with pure calculations/contracts, then provider adapters).
- Keep CommonJS/browser-facing compatibility until tests prove parity.
- Gate: no route/response regression; exact unit/integration coverage; benchmark baseline.

### Phase 2 — market data persistence
- Initial additive PostgreSQL schema now exists in db/migrations/003_market_data.sql: canonical assets, source observations, OHLCV partitions, ingestion runs and checkpoints.
- Disposable PostgreSQL smoke coverage is in db/tests/003_market_data_smoke.sql and the test workflow applies it only to ephemeral CI PostgreSQL 16.
- Production migration/backfill remains separate and requires backup, partition provisioning, retention policy, compatibility and rollback review.
- Gate: duplicate/idempotency tests, partition/pruning query tests, data provenance, migration rollback/forward compatibility.
- The ingestion adapter pilot targets the PostgREST schema API; the `radar_market` schema must be explicitly exposed in the database API before use. No schema exposure setting has been changed.

### Phase 3 — durable ingestion workers
- A disabled-by-default TypeScript PostgREST adapter pilot now exists in `src/market-data-ingestion.mts`; it writes canonical assets, provenance observations, ingestion-run outcomes and durable checkpoints in bounded batches (maximum 100 records).
- The pilot is not imported by `server.js`, has no scheduled entrypoint, and performs no network access unless a caller explicitly passes `enabled: true` together with a server-only HTTPS PostgREST URL and service-role key.
- Provider polling, worker scheduling, queue leases, retry/dead-letter orchestration, automatic partition provisioning and production schema exposure are deliberately not implemented or activated by this pilot.
- Connect worker processes to the existing PostgreSQL queue only after adapter, leases, retry/dead-letter, idempotency, permission and kill-switch tests pass.
- Separate dashboard API lifecycle from ingestion lifecycle.
- Gate: restart recovery, concurrency/rate-limit tests, failure injection and queue-age SLO.

### Phase 4 — research and experimentation platform
- Add versioned datasets, experiment manifests, reproducible runs and walk-forward evaluation.
- Python workers consume immutable snapshots; results are stored with code/data/config hashes.
- Gate: no look-ahead leakage, deterministic reruns, out-of-sample evaluation and explicit separation from order execution.

### Phase 5 — measured scaling
- Load-test representative API, ingestion, queue and historical query workloads.
- Tune indexes, partitions, worker counts and cache policies from measured bottlenecks.
- Add infrastructure only when the expected benefit and recurring cost are clear and approved.

## Non-goals / safety

- No big-bang rewrite, no breaking API changes, no production database migration in this pilot.
- No live trading, exchange order execution, withdrawal, or funds movement.
- No new paid provider, VPS, database tier, storage bucket, Redis or compute service without explicit BOS approval.
- No claim of 24/7 autonomous operation until scheduler, workers, durable state, audit, permissions, budgets, approval gates and kill switch are deployed and tested.

## Acceptance criteria for this foundation

- Existing npm test suite remains green.
- TypeScript contracts pass strict tsc --noEmit.
- Python tests pass on a pinned supported CI interpreter.
- TypeScript runtime guards reject malformed external payloads.
- Python research tests validate costs, timestamps, history and strategy metrics.
- No production route, database, environment variable, deployment setting or credential changes.
