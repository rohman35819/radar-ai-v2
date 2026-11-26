# RADAR AI Shared Project Memory

> Compact, curated handoff for every AI agent. This is the **only shared cross-agent memory**; it is not a chat archive. Last verified: 26 November 2026.

## Project identity
- Product: RADAR AI V2; repository: https://github.com/rohman35819/radar-ai-v2
- Production branch: `main`; integration: `develop`; task branches use PRs into `develop`.
- Website: https://radar-ai-v2.hostless.app/
- Address the owner as **BOS** only when appropriate. Do not ask BOS to repeat information already documented.

## Non-negotiable memory rule
- Save **no conversations** with BOS or anyone else: no transcripts, chat exports, routine prompts/responses, reasoning logs, or message-by-message histories anywhere in the repository.
- This file alone is the shared AI handoff. Store only distilled durable facts: decisions/rationale, architecture/contracts, approved preferences, verified status, blockers, and next action.
- Rewrite stale status in place; do not append every interaction. Keep this file under 12 KB. Never store credentials, tokens, passwords, sensitive account data or unnecessary personal details.
- Master context and focused docs are for technical specifications, durable engineering decisions and evidence—not conversation archives.
- Every AI must read this file first at session start, then `AGENTS.md` and relevant master-context sections, then verify live GitHub/code/PR/CI/deployment state. Do not claim a new AI automatically reads it unless repository access and startup behavior are configured and verified.
- Agent-native private memory is optional; it does not replace this shared file.

## Working agreement
- Preserve existing features, routes, menus, API contracts, data and workflows.
- Groq/OpenCode and Grok/xAI are distinct tools. Groq/OpenCode follows the shared engineering rules; Grok has a dedicated `GROK.md` charter and must read it at each RADAR session. Both remain subject to the same branch, CI, security, cost and production-safety gates.
- All agents follow branch, test, security, review, documentation and production-safety rules. No task writes directly to `main`.
- Never claim CI, merge, Hostless build or LIVE deployment without checking each separately.
- Explicit BOS approval is required for paid spend/service activation, production credential/access changes, destructive or materially risky production operations, and live trading/withdrawal/financial execution.
- Do not claim always-on/background autonomy unless scheduler, durable queue/state, workers, permissions, audit, budgets, approval gates and kill switch are implemented and verified.

## Verified project handoff — 25 November 2026
- `main` HEAD: `f38d25a6203ab486d7170369e86874f838af627a` (v2.3.2 release); `develop` HEAD: `63d950e2eeca0a8b059c5681e1df924dac3c6fb2`, three commits behind main. Re-check before integration.
- PR #110 (single shared memory + no-chat-archive policy) merged to `develop` as `c9c3a1403b19e5fe52250d0354e03bf7a1af1319`. Exact-head npm tests, disposable PostgreSQL Agent Platform/queue/memory smoke tests, Gitleaks, Trivy and branch-source policy all passed.
- PR #107 is closed as superseded by #110; do not revive its stale/diverged branch.
- PR #106 (mobile sidebar drawer) remains open and needs rebase/validation against current develop plus Android/iOS/browser QA. Prior Termux report: 5 frontend tests passed and `git diff --check` clean; device QA was not completed.
- PR #108 (cloud-worker hardening) and #109 (master-context status) are merged to `develop`. Exact-head tests, PostgreSQL disposable migration/queue/memory smoke tests, Gitleaks, Trivy and branch-source policy passed for #108.
- Cloud worker hardening exists on `develop`, not yet released to `main`. GitHub Actions worker is periodic (every two hours), not continuous 24/7. It can run without the phone/Termux, but workflow must reach default branch `main` before scheduled runs use the new version.
- Groq provider support is opt-in and OFF by default. Do not configure `GROQ_API_KEY` or enable `GROQ_AUTONOMOUS_ENABLED=1` without BOS explicitly approving after quota/billing review. OpenRouter fallback is pinned to `openrouter/free`.
- PostgreSQL Agent Platform queue/control plane is not activated for production: pause + kill switch defaults, USD 0 budget and restrictive grants remain. No VPS or paid service has been provisioned.
- Hostless Build/LIVE status was not verified by the above GitHub work. Do not infer deployment from a merge.

## Grok onboarding
- `GROK.md` is the dedicated Grok/xAI startup and engineering charter. `AGENTS.md` links it and requires Grok to read it with shared memory and master context at session start.
- Repository docs alone do not force Grok to load them. The Grok project/client must have repository access and a startup/custom instruction to read `GROK.md`; verify this separately before claiming automatic onboarding.
- Grok is xAI's assistant; Groq is a separate inference provider. Groq provider activation remains OFF unless BOS explicitly approves.

## Next actions — verified 27 November 2026
- `origin/main` = `f38d25a` (v2.3.2 release); `origin/develop` = `44cc49e8` (after P0 merge). `main` is production/LIVE truth; `develop` carries newer typed contracts, worker pilot, Python backtest and the capability audit, not yet released.
- Open PRs: #155 draft → develop (quant priority docs); #153 → develop (P1 foundation, exact-head test run `45871293644` + security `45871293608` both success at `959ff80`, PR body updated, **not merged — awaiting Advisor re-review**); #149 draft; #115 and #105 docs. Non-draft toward develop = 3 (#153, #115, #105), at the WIP limit.
- **P0 delivered:** `docs/quant-platform-capability-audit.md` — traceable capability/gap matrix, threat model, contracts and P0–P7 backlog for issue #150 (autonomous quant trading platform). Local `npm test` on branch `docs/quant-platform-capability-audit` @ `1226a5d`: 233/233 pass. Documentation only; no production change. PR/CI evidence must be re-verified on exact head.
- **Capability truth:** real today = market aggregation, read-only exchange adapters, derivatives funding/OI, on-chain adapters, AI multi-provider + Command Center, Agent Platform schema with pause/kill switch/Rp0, periodic two-hour GitHub Actions worker, shared memory. Absent = strategy registry/versioning, walk-forward/out-of-sample, portfolio/risk engine, paper trading/order lifecycle/reconciliation, six AI specialist roles, factor risk scoring, market-regime engine, scoped memory retrieval. Memory table/validator exist (`supabase/migrations/20261124_radar_memory.sql`, `lib/knowledge/memory.js`) but are not a production runtime. Agent Platform is schema-only; no durable worker claims tasks. Never claim offline autonomy or Hostless LIVE without separate evidence.

- **Quant MVP vertical slice on `feat/quant-mvp-vertical-slice`** (issue #154, PR #156): `quant_data.py` quality/provenance guard, one SMA strategy, `backtest_engine.py` (fees/slippage/funding/SL/kill switch), train/validation/OOS + walk-forward, versioned `quant-report.v1`, TS contracts + fail-closed risk + shadow paper simulation (no order path), `verify_report.py` QA. Advisor fixes: every candidate generates its own SMA signal stream; OOS and walk-forward use the selected candidate's config+signals; fetch writes `retrieved_at`/source/range/rows/checksum sidecar consumed by `quant_cli.py`. Free public endpoint `data-api.binance.vision` works; real BTCUSDT daily data (364 bars, 2025-11-27→2026-11-25) fetched and `public_report.json` generated. Result: `accepted_for_paper_candidate=false` (`walk_forward_not_majority_positive` 2/6); OOS net -16.23%, max DD 16.23%, 6 trades, win 16.67%, PF 0.318; full-sample net 0.86%, DD 17.83%, 8 trades, PF 1.429; buy&hold net -34.00%. Criteria NOT weakened; no profit claim. Local: Python 24/24, npm 237/237, strict tsc exit 0, QA 12/12 on both reports. Runbook: `docs/quant-mvp-runbook.md`.
- **NEXT TASK (BOS decision needed):** validation on real public data did not pass, so paper ledger/reconciliation is BLOCKED. BOS must decide whether to continue strategy research or stop; no paper ledger without explicit approval. P1 PR #153 remains unmerged pending Advisor. Do not duplicate the `radar_memory_records` migration (`supabase/migrations/`). Worker, live trading and withdrawal remain OFF; Rp0.

- Preserve all existing menus/routes and truthful-data behavior (Top 5, Radar Intelligence capability matrix, stale-data banners). Never show demo numbers as live. No withdrawal capability; live trading OFF. Rp0 hard budget: no paid service, card, VPS or production DB provisioning without BOS approval. Keep secrets server-side and out of Git/chat/frontend/logs.
- Hostless Build/LIVE remains unverified in this session. Storage/EROFS decision still pending BOS. Dependency CVE coverage is unavailable because the repo has no supported dependency manifest; Trivy secret scan is not a CVE scan.


## Engineering governance
- Permanent 12-area policy: `docs/architecture/engineering-constitution.md`; all agents/contributors apply it alongside `AGENTS.md` and the master context.
- Covers architecture, agent collaboration, security, data/storage, memory/provenance, API contracts, reliability, cost/quota, QA/CI, observability, UI/accessibility, and version/release governance.
- TypeScript-first language direction remains recorded in owner-confirmed issue #138. The constitution is policy-only where technical enforcement is not verified; it activates no service, worker, DB, paid plan, or production capability.
- Constitution delivered: PR #143 merged to `develop` as `51a61db326df1eb3c44b6fd3730453213fcb3f70`; PR head `97ad6977bd770c498e67da8c782ea008d7405661` passed test run #1275 (npm, strict TypeScript, Python, disposable PostgreSQL smoke) and security run #664 (Gitleaks + Trivy). Shared memory measured 8,670 characters (<12 KB). Not released to `main`; Hostless Build/LIVE not checked. Policy-only where enforcement is not verified.


## QA pilot integrated to develop
- PR #146 merged to `develop` as `1b13ae17f2c221df50d1aeaf558e892eb98f7df1`: OFF-by-default TypeScript one-shot ingestion worker (3-way bounded concurrency, 50 tasks/run, 250 rows/type/batch, idempotent writes, checkpoint replay) plus Python O(n) rolling SMA and bounded process-pool parameter sweep (default serial, max 4 workers).
- PR #147 docs follow-up merged to `develop` as `dd46a5a74b39a0b749427b08415253c70c4894a9`. Latest merge-commit test run `45706453762`: npm 233/233, strict TypeScript, Python 8/8, PostgreSQL 16 migrations/smoke. Security run `45706453707`: Gitleaks no leaks; Trivy secret scan no findings.
- Trivy vulnerability scanner reports no supported dependency manifests; dependency CVE coverage is NOT AVAILABLE. No runtime dependency added.
- `main` remains `f38d25a6203ab486d7170369e86874f838af627a`. No Hostless build/deploy was triggered. Public LIVE readiness/snapshot/news probes succeeded in main monitor run `45690836381`, but Hostless deployment metadata lookup failed, so LIVE commit/version remains unverified.
- Next: durable queue lease/claim, retry/dead-letter and provider-specific quotas; then experiment manifests and walk-forward tests. Worker remains OFF and unconnected to production.
