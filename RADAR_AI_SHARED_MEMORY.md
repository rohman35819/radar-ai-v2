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

## Next actions
1. PR #126 (`exp/scalable-platform-foundation` → `develop`) code head `a3187e8...` passed 217 Node tests, strict TypeScript typecheck, Python 5/5, PostgreSQL smoke tests, branch policy, Gitleaks and Trivy. Latest docs-only head `469006a...` has rerun checks queued.
2. PR #121 and #112 closed as superseded; #115 (Grok contributor charter) and #105 (Termux/Groq handoff) remain open and need triage/rebase.
3. Keep production JavaScript, market state, secrets, Hostless settings, and paid infrastructure unchanged until additive data migrations and worker integration pass isolated gates.
4. Bounded parallel refresh PR #135 merged to develop as 1fe5b5b...; exact PR + merge commit passed 226 Node tests, strict TS, Python 5/5, PostgreSQL smoke, Gitleaks/Trivy. Independent sources now run at concurrency max 3; CoinGecko/exchange ordering preserved. No Hostless deploy.

- Top 5 Action Center + Radar Intelligence added on branch `feat/top5-action-center`: transparent scoring from real snapshot fields, mechanical trade plan from observed price history with NOT_ENOUGH_DATA guard, honest capability matrix (whale/smart money/portfolio marked unavailable). 207/207 tests pass; no trading/withdrawal enabled. Browser QA and Hostless verification pending.

- Hostless LIVE verified at v2.3.0 commit `1ed78c5` (build `2fab35ee` per BOS). Public probe: homepage 200, `/top5.js` 200, action/intel menus present. Browser interaction QA still pending.

- Proven routing bug (26 Nov): Cloudflare edge served stale `/app.js` (cf-cache-status HIT, max-age 14400) alongside new index.html, so new menus fell through to System Health. Fix: version dashboard assets `?v=v2.3.1` in index.html and SW precache, shell v15, keeping QA's network-first SW. 211/211 tests pass. Needs release to main + LIVE recheck.
- Second proven bug (26 Nov): `renderAction()` threw `ReferenceError: priceLabel is not defined`. Fix is included in main v2.3.2 via PR #125; verify Hostless and browser behavior separately.

- Scale foundation branch `exp/scalable-platform-foundation` starts from main `f38d25a` (v2.3.2). Adds strict TS contract/typecheck, Python 3.13 offline backtest CI, provenance/OHLCV contract guards and a staged architecture roadmap. Production runtime/data/deployment unchanged; exact-head CI and security scans pending.

- Snapshot ETag/304 benchmarked on branch `perf/snapshot-etag` (synthetic, local): 205 tokens 51.5KB→2B per conditional request, p99 24.4ms→3.8ms; 1000 tokens 249KB→2B, p99 27.5ms→5.7ms. 226/226 tests pass. No production changes; needs PR + CDN conditional-request verification.
- Snapshot ETag change merged to develop via PR #140 (`80c4601`) after all gates passed; initial PR #137 failed only because `perf/*` is not an allowed branch prefix (use `feat/*`). No main release performed for this change.


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


## Rp0 cloud runtime decision — 26 November 2026
- BOS approved free-only implementation; no paid provisioning, card, trial-to-paid, overage, or paid fallback.
- Draft PR #149 adds `docs/architecture/rp0-cloud-runtime-implementation.md` (branch `feat/rp0-cloud-runtime-architecture-20261126`, commit `9d0101c528fb0d3ef52cf2a00d5de4aaf4cd8b50`). It documents the current boundary: GitHub Actions is periodic (2-hour cadence), not 24/7; PostgreSQL remains disposable-CI only; production DB and always-on worker are not deployed.
- `main` and `develop` diverged (develop 23 ahead / 3 behind at audit). Do not bulk-merge. Railway staged resources remain untouched.
- Docs-only; tests not run; PR CI pending; Hostless status not changed/verified.
- Next: Division 05 exact-head CI/security evidence, Division 01 security review, then Division 06/07 queue and memory implementation behind OFF flags. Prove Rp0 compute/storage before any runtime provisioning.
