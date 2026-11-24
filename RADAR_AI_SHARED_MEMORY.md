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
- `develop` HEAD: `ee53b04d39e51f5f95f88a2c02ff38a30c4cc638`; `main` HEAD: `0f8521a4ab2399f80a102af4e422b2586d32e437` at last check. Re-check before action.
- PRs #106 (mobile sidebar drawer), #108 (cloud-worker hardening), #109 (status), #110 (single shared memory) and #111 (handoff refresh) are merged to `develop`. PR #107 was closed as superseded; do not revive it. PR #106 merged at `ee53b04` after exact-head tests, Branch source policy and security scans passed; Android/iOS/browser device QA remains outstanding.
- Exact-head tests, disposable PostgreSQL smoke, Gitleaks, Trivy and branch-source policy passed for PR #108.
- Frontend integration branch `integration/frontend-ux-20261125` combines `develop` with dashboard freshness/state/a11y, Market Intelligence truthfulness, Solscan observation-time truthfulness and PWA shell v13. Last measured local suite: 208/208 pass, 25 files (before the final `b26d8b4` merge; re-run after branch updates). PR creation is blocked: this token returns HTTP 403 for `POST /pulls`, although `PUT /pulls/{n}/merge` is reachable.
- Cloud worker hardening exists on `develop`, not yet released to `main`. GitHub Actions worker is periodic (every two hours), not continuous 24/7. It can run without the phone/Termux, but the workflow must reach default branch `main` before scheduled runs use the new version.
- Groq provider support is opt-in and OFF by default. Do not configure `GROQ_API_KEY` or enable `GROQ_AUTONOMOUS_ENABLED=1` without BOS explicitly approving after quota/billing review. OpenRouter fallback is pinned to `openrouter/free`.
- PostgreSQL Agent Platform queue/control plane is not activated for production: pause + kill switch defaults, USD 0 budget and restrictive grants remain. No VPS or paid service has been provisioned.
- Hostless Build/LIVE status was not verified by the above GitHub work. Do not infer deployment from a merge or CI.

## Grok onboarding
- `GROK.md` is the dedicated Grok/xAI startup and engineering charter. `AGENTS.md` links it and requires Grok to read it with shared memory and master context at session start.
- Repository docs alone do not force Grok to load them. The Grok project/client must have repository access and a startup/custom instruction to read `GROK.md`; verify this separately before claiming automatic onboarding.
- Grok is xAI's assistant; Groq is a separate inference provider. Groq provider activation remains OFF unless BOS explicitly approves.

## Next actions
1. Complete Android/iOS/browser drawer QA for the now-merged PR #106; fix forward with a new PR if gesture/scroll issues remain on real devices.
2. Have BOS/maintainer create a PR for `integration/frontend-ux-20261125` with a `pull_requests: write` token: https://github.com/rohman35819/radar-ai-v2/pull/new/integration/frontend-ux-20261125
3. Prepare a normal `develop` → `main` release PR for the cloud worker; verify exact-head release checks. Keep Groq disabled.
4. After release, run a controlled manual worker test; later design a least-privilege non-production adapter to the existing PostgreSQL queue before any production activation.

## Known credential limitation
- The available PAT can push normal source/docs branches and can merge an existing PR via `PUT /pulls/{n}/merge`, but it cannot create PRs (`POST /pulls` → 403) and cannot push changes under `.github/workflows/` (`workflow` scope missing). Workflow edits require a maintainer token with that scope; do not attempt to bypass or change permissions without BOS approval.

## R&D cycle results (25 November 2026)
- PR #106 (mobile sidebar drawer) was merged to `develop` at `ee53b04` after exact-head test, Branch source policy and security gates passed. Device/browser QA is still outstanding.
- Frontend integration branch `integration/frontend-ux-20261125` (head maintained on remote) contains dashboard freshness/state/a11y, Market and Solscan truthfulness, and PWA shell v13; last local suite 208/208 pass. PR creation remains blocked by the PAT's missing `pull_requests: write` scope.
- Isolated experiment `exp/volume-spike-robustness` (`b43e363`) tested a P90+MAD gate against the median-only volume-spike rule using deterministic synthetic fixtures: 4/4 tests pass; recurring bursts no longer flagged, isolated bursts preserved. Not adopted into production; details in `docs/EXPERIMENT_VOLUME_SPIKE.md`.
- Workflow runtime upgrade for the autonomous worker is implemented locally (`d1a55a9`, 197/197 tests) but cannot be pushed because the PAT lacks `workflow` scope. Needs a maintainer with that scope.

## QA improvement (25 November 2026)
- Added `test/dashboard-runtime.test.js`: executes `public/app.js` in a VM with a minimal DOM shim and asserts real helper behavior (connection states, link scheme guard, missing timestamp, focus/cursor/scroll restoration after DOM replacement). 4/4 pass; full suite 212/212 pass across 26 files. This supplements but does not replace browser/device QA.

- Dashboard `dateTime()` now validates parsed timestamps; 5 runtime QA tests pass and the full suite is 213/213 across 26 files on the integration branch.

- Local HTTP smoke (integration branch, temp DATA_DIR, port 38711): 19/19 probed assets/routes returned 200; strict CSP and nosniff confirmed; `/api/health` ok on writable temp storage. Not browser QA and not evidence about Hostless production mount.
