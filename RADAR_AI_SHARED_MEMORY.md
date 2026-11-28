# RADAR AI Shared Project Memory

> Compact, curated handoff for every AI agent. This is the **only shared cross-agent memory**; it is not a chat archive. Last verified: 25 November 2026.

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
- `develop` HEAD: `c9c3a1403b19e5fe52250d0354e03bf7a1af1319`; `main` HEAD: `0f8521a4ab2399f80a102af4e422b2586d32e437` at last check. Re-check before action.
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
1. Keep this shared memory concise and current; every AI contributor must read it first on startup.
2. Rebase/revalidate PR #106 against current develop and complete mobile/browser device QA before merging.
3. Prepare a normal `develop` → `main` release PR for the cloud worker; verify exact-head release checks. Keep Groq disabled.
4. After release, run a controlled manual worker test; later design a least-privilege non-production adapter to the existing PostgreSQL queue before any production activation.

- Top 5 Action Center + Radar Intelligence added on branch `feat/top5-action-center`: transparent scoring from real snapshot fields, mechanical trade plan from observed price history with NOT_ENOUGH_DATA guard, honest capability matrix (whale/smart money/portfolio marked unavailable). 207/207 tests pass; no trading/withdrawal enabled. Browser QA and Hostless verification pending.

- Hostless LIVE verified at v2.3.0 commit `1ed78c5` (build `2fab35ee` per BOS). Public probe: homepage 200, `/top5.js` 200, action/intel menus present. Browser interaction QA still pending.

- Proven routing bug (26 Nov): Cloudflare edge served stale `/app.js` (cf-cache-status HIT, max-age 14400) alongside new index.html, so new menus fell through to System Health. Fix: version dashboard assets `?v=v2.3.1` in index.html and SW precache, shell v15, keeping QA's network-first SW. 211/211 tests pass. Needs release to main + LIVE recheck.
- Second proven bug (26 Nov): `renderAction()` threw `ReferenceError: priceLabel is not defined`, leaving Top 5 page empty even after CDN fix. Added the helper in `public/app.js` and a runtime regression test (`test/top5-runtime.test.js`, 3 tests) that actually executes action/intel renderers. 213/213 tests pass. Needs release + LIVE re-verification.

- 28 Nov: radar-nexus-core Supabase ACTIVE_HEALTHY; nexus-chat v4 + nexus-agent-runtime v1 ACTIVE/JWT. Ten private nexus tables RLS-enabled; zero chat/memory rows. PR #169 merged to develop only; main release isolated in feat/nexus-chat-main-release-20261128. Provider key and Hostless LIVE unverified. Edge Function active ≠ scheduled worker; offline autonomy OFF.
