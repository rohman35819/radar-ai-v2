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
- `main` HEAD: `f38d25a6203ab486d7170369e86874f838af627a` (v2.3.2); `develop` HEAD: `1226a5d96072fe626b1a554192e4d652d440c8e0`. Branches diverged: develop is 23 commits ahead and 3 behind main. Do not bulk-merge; select release scope.
- PR #110 (single shared memory + no-chat-archive policy) merged to `develop` as `c9c3a1403b19e5fe52250d0354e03bf7a1af1319`. Exact-head npm tests, disposable PostgreSQL Agent Platform/queue/memory smoke tests, Gitleaks, Trivy and branch-source policy all passed.
- PR #107 is closed as superseded by #110; do not revive its stale/diverged branch.
- PR #106 mobile sidebar fix merged to develop and was included in main release #117. Android/iOS and real-browser device QA remain unverified.
- PR #108 (cloud-worker hardening) and #109 (master-context status) are merged to `develop`. Exact-head tests, PostgreSQL disposable migration/queue/memory smoke tests, Gitleaks, Trivy and branch-source policy passed for #108.
- Cloud worker hardening was included in main release #117. GitHub Actions is periodic (every two hours), not continuous 24/7. Do not claim successful scheduled execution or always-on operation without run evidence.
- Groq provider support is opt-in and OFF by default. Do not configure `GROQ_API_KEY` or enable `GROQ_AUTONOMOUS_ENABLED=1` without BOS explicitly approving after quota/billing review. OpenRouter fallback is pinned to `openrouter/free`.
- PostgreSQL Agent Platform queue/control plane is not activated for production: pause + kill switch defaults, USD 0 budget and restrictive grants remain. No VPS or paid service has been provisioned.
- Hostless Build/LIVE status was not verified by the above GitHub work. Do not infer deployment from a merge.

## Grok onboarding
- `GROK.md` is the dedicated Grok/xAI startup and engineering charter. `AGENTS.md` links it and requires Grok to read it with shared memory and master context at session start.
- Repository docs alone do not force Grok to load them. The Grok project/client must have repository access and a startup/custom instruction to read `GROK.md`; verify this separately before claiming automatic onboarding.
- Grok is xAI's assistant; Groq is a separate inference provider. Groq provider activation remains OFF unless BOS explicitly approves.

## Next actions — 26 November 2026
1. **P0 Storage:** verify Hostless active backend, real persistent mount, quota/overage and restart persistence. No guessed `DATA_DIR`, `/tmp` fallback, disk provisioning or paid resource.
2. **P1 Browser QA:** one Playwright pilot for Dashboard desktop/mobile (all navigation, sidebar, Action/Intel cards + modal) and Exchange Hub (Binance/Bybit, token mask/clear, permission/error states, GET-only network). Capture sanitized artifacts.
3. **P1 Cache delivery:** verify normal `/app.js?v=v2.3.1` contains `priceLabel`; the monitor did not fetch this asset. If stale, bump asset version + SW shell in a focused hotfix.
4. **P1 Release integrity:** `main`/`develop` diverged 23 ahead / 3 behind; promote only reviewed commits, never the entire branch.
5. **WIP:** open PRs are #149, #115 and #105 (3/3). #115 is 13 ahead / 36 behind develop and touches shared governance docs; #105 is 1 ahead / 53 behind and touches master context. Triage before opening another PR.
6. Keep production queue/database and all autonomous runtime OFF until zero-cost capacity, persistence, security and recovery are independently proven.

- Top 5 Action Center + Radar Intelligence are in main v2.3.2 via PR #125. Runtime regression tests cover Action/Intel/modal; exact release-head CI run #1123 passed **214/214**. No trading/withdrawal enabled; real-browser QA remains pending.

- Latest available Hostless monitor run [#45690836381](https://github.com/rohman35819/radar-ai-v2/actions/runs/45690836381), 25 Nov 2026 20:01 UTC: `/api/ready` 200 `ready`, storage `ok`; `/api/snapshot` 200, 50 news; storage/snapshot/news/Binance Futures/DEX checks all true. Deployment metadata API returned valid JSON with no recognized list, so Hostless Build and deployed SHA remain UNKNOWN. This is the last available snapshot, not a current probe; persistence across restart is unverified.

- Proven routing/cache bug fixed in main via PR #123: dashboard assets use `?v=v2.3.1`, SW shell v15 and network-first. Follow-up PR #125 changed `public/app.js` but did not change the asset URL or SW version; this is a **cache-delivery risk, not a proven current LIVE failure**. Verify the normal asset URL and browser render before closing QA.
- `priceLabel` was added to `public/app.js` via PR #125 and released to main v2.3.2. Monitor #45690836381 checks API/providers, not this JS asset; actual browser delivery remains unverified.

- PR #126 merged to `develop` only: TypeScript contracts/strict typecheck, Python offline research baseline and scalable data roadmap. Existing JavaScript remains; no big-bang rewrite or production runtime activation.

- Snapshot ETag/304 change merged to `develop` via PR #140 after exact-head tests; it is not in main and Hostless conditional-request behavior has not been verified.


## Engineering governance
- Permanent 12-area policy: `docs/architecture/engineering-constitution.md`; all agents/contributors apply it alongside `AGENTS.md` and the master context.
- Covers architecture, agent collaboration, security, data/storage, memory/provenance, API contracts, reliability, cost/quota, QA/CI, observability, UI/accessibility, and version/release governance.
- TypeScript-first language direction remains recorded in owner-confirmed issue #138. The constitution is policy-only where technical enforcement is not verified; it activates no service, worker, DB, paid plan, or production capability.
- Constitution delivered: PR #143 merged to `develop` as `51a61db326df1eb3c44b6fd3730453213fcb3f70`; PR head `97ad6977bd770c498e67da8c782ea008d7405661` passed test run #1275 (npm, strict TypeScript, Python, disposable PostgreSQL smoke) and security run #664 (Gitleaks + Trivy). Shared memory measured 8,670 characters (<12 KB). Not released to `main`; Hostless Build/LIVE not checked. Policy-only where enforcement is not verified.


## QA pilot integrated to develop
- PR #146 merged to `develop` as `1b13ae17f2c221df50d1aeaf558e892eb98f7df1`: OFF-by-default TypeScript one-shot ingestion worker (3-way bounded concurrency, 50 tasks/run, 250 rows/type/batch, idempotent writes, checkpoint replay) plus Python O(n) rolling SMA and bounded process-pool parameter sweep (default serial, max 4 workers).
- PR #147 docs follow-up merged to `develop` as `dd46a5a74b39a0b749427b08415253c70c4894a9`. Latest merge-commit test run `45706453762`: npm 233/233, strict TypeScript, Python 8/8, PostgreSQL 16 migrations/smoke. Security run `45706453707`: Gitleaks no leaks; Trivy secret scan no findings.
- Trivy vulnerability scanner reports no supported dependency manifests; dependency CVE coverage is NOT AVAILABLE. No runtime dependency added.
- `main` remains `f38d25a6203ab486d7170369e86874f838af627a`; `develop` remains `1226a5d96072fe626b1a554192e4d652d440c8e0`. Hostless readiness was healthy in the last monitor snapshot, but Build/deployed SHA and restart persistence remain unknown.
- Next Agent Platform work: durable lease/claim, retry/dead-letter and provider-specific quotas; worker remains proposal-only/OFF and not connected to production.


## Rp0 cloud runtime decision — 26 November 2026
- BOS approved free-only implementation; no paid provisioning, card, trial-to-paid, overage, or paid fallback.
- Draft PR #149 adds `docs/architecture/rp0-cloud-runtime-implementation.md` (branch `feat/rp0-cloud-runtime-architecture-20261126`, commit `9d0101c528fb0d3ef52cf2a00d5de4aaf4cd8b50`). It documents the current boundary: GitHub Actions is periodic (2-hour cadence), not 24/7; PostgreSQL remains disposable-CI only; production DB and always-on worker are not deployed.
- `main` and `develop` diverged (develop 23 ahead / 3 behind at audit). Do not bulk-merge. Railway staged resources remain untouched.
- Shared handoff refreshed on this PR branch; no Hostless setting, production DB, runtime, secret, or deployment changed.
- Next: independent security review of global pause/kill-switch grants and QA review of the disposable SQL guard. Keep runtime OFF; prove Rp0 compute/storage before provisioning.

- Latest PR #149 head `235725cb6e55c660fb93acfda41b9795270874b4` (9 ahead / 0 behind develop) passed exact-head test run #1333: Node **233/233**, strict TypeScript, Python **8/8**, PostgreSQL 16 migrations/smokes for Agent Platform, queue guard, memory and market-data schema; Branch source policy passed. Security run #689: Gitleaks and Trivy jobs passed. Trivy secret scan found no issues; vulnerability scanner found no supported dependency manifest, so CVE coverage remains unavailable. PR #149 stays Draft/open/unmerged; no production DB/worker.
