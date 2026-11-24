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
- Groq/OpenCode has repository-wide autonomous engineering authority under `AGENTS.md` and the master context. Safe engineering may be implemented and proposed through coherent PRs; numeric PR quota is not the limiting factor.
- All agents follow branch, test, security, review, documentation and production-safety rules. No task writes directly to `main`.
- Never claim CI, merge, Hostless build or LIVE deployment without checking each separately.
- Explicit BOS approval is required for paid spend/service activation, production credential/access changes, destructive or materially risky production operations, and live trading/withdrawal/financial execution.
- Do not claim always-on/background autonomy unless scheduler, durable queue/state, workers, permissions, audit, budgets, approval gates and kill switch are implemented and verified.

## Verified project handoff — 25 November 2026 (updated after integration cycle)
- `develop` HEAD: `c9c3a1403b19e5fe52250d0354e03bf7a1af1319`; `main` HEAD: `0f8521a4ab2399f80a102af4e422b2586d32e437` at last check. Re-check before action.
- PR #108 (cloud-worker hardening), #109 (status), #110 (shared-memory policy) are merged to `develop`; stale PR #107 was closed/superseded. PR #111 (follow-up handoff refresh) is open. Exact-head tests, disposable PostgreSQL smoke, Gitleaks, Trivy and branch-source policy passed for PR #108.
- PR #106 (mobile sidebar drawer) was rebased onto current `develop`: head `b3161df12ccbc8da53409b2b5582867ac44d3bae`, base `c9c3a14`, `mergeable=true`, CI test/security started after push. Device QA is still outstanding. Locally: `npm test` 196/196 pass, `git diff --check` clean. No merge yet.
- Frontend integration branch `integration/frontend-ux-20261125` head `79ae17b1f34dac8cd77d55ed2c275d2d7062bb4f` combines the latest `develop` with dashboard freshness/state/a11y, Market Intelligence truthfulness, Solscan observation-time truthfulness and PWA shell v13. Local `npm test`: 208/208 pass, 25 files. PR not created: the available token returns HTTP 403 `Resource not accessible by personal access token` for `POST /pulls`.
- Cloud worker hardening exists on `develop`, not yet released to `main`. GitHub Actions worker is periodic (every two hours), not continuous 24/7. It can run without the phone/Termux, but the workflow must reach default branch `main` before scheduled runs use the new version.
- Groq provider support is opt-in and OFF by default. Do not configure `GROQ_API_KEY` or enable `GROQ_AUTONOMOUS_ENABLED=1` without BOS explicitly approving after quota/billing review. OpenRouter fallback is pinned to `openrouter/free`.
- PostgreSQL Agent Platform queue/control plane is not activated for production: pause + kill switch defaults, USD 0 budget and restrictive grants remain. No VPS or paid service has been provisioned.
- Hostless Build/LIVE status was not verified by the above GitHub work. Do not infer deployment from a merge or CI.

## Next actions
1. Verify exact-head CI for PR #106 (test, Branch source policy, Gitleaks, Trivy), then complete Android/iOS/browser drawer QA before merging.
2. Have BOS/maintainer create PRs with a `pull_requests: write` token: PR #106 already exists; the frontend integration branch needs one at https://github.com/rohman35819/radar-ai-v2/pull/new/integration/frontend-ux-20261125 . Do not merge before all gates pass.
3. Prepare a normal `develop` → `main` release PR for the cloud worker; verify exact-head release checks. Keep Groq disabled.
4. After release, run a controlled manual worker test; later design a least-privilege non-production adapter to the existing PostgreSQL queue before any production activation.
