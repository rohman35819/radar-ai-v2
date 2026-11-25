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

## Verified project handoff — 26 November 2026
- main HEAD: 0f8521a4ab2399f80a102af4e422b2586d32e437; develop HEAD: 2673606dac0c75c4bd43cf81b36af2262c002152. GitHub compare verifies develop is 35 commits ahead and 0 behind main.
- PR #106 (mobile sidebar drawer) is now merged to develop (merge commit ee53b04d39e51f5f95f88a2c02ff38a30c4cc638). Its historical device/browser QA caveat remains: Android/iOS gesture and desktop browser QA were not verified in the PR evidence.
- PR #81 (guarded autonomous development pilot) is merged to main (merge commit 6e2dc1defcff19189cbf455ea25be8c4d71eca6a). Main workflow is scheduled every two hours and defaults AUTONOMOUS_AGENT_ENABLED to 1; it uses only the explicit OpenRouter openrouter/free route in the worker. Actual secret availability, account-level zero-charge behavior, and successful scheduled worker runs are not verified. Do not claim the worker is operating until run evidence is inspected. If zero-charge cannot be verified, set the repository variable to 0 via an authorized maintainer and leave it disabled.
- PR #110 shared-memory policy is merged to develop; its earlier CI evidence covered npm tests, disposable PostgreSQL Agent Platform/queue/memory smoke tests, Gitleaks, Trivy and branch-source policy.
- Current open PRs targeting develop: #115 (Grok contributor/dashboard autonomy charter), #112 (shared-memory handoff, stale base), and #105 (Termux/Groq handoff, diverged/non-mergeable). The normal WIP limit is 3; do not open another develop PR until this queue is dispositioned. PR #115 is the active documentation branch currently carrying this update.
- Railway project RADAR AI V2 - Development has a staged service/source/volume/configuration only. No deployment/runtime has been activated and no Railway charge is authorized. Keep the patch staged; do not deploy unless the exact plan and runtime cost are verified as Rp0.
- Groq remains OFF. No provider keys/secrets were changed. PostgreSQL Agent Platform is not activated for production. Hostless Build/LIVE and Hostless deployment metadata remain separate; current verification is not established by GitHub CI.
- BOS's standing policy is ZERO-COST FIRST: no paid services, overages, trials that can convert to paid, paid provider fallback, or new spend until RADAR AI produces revenue and BOS explicitly approves a specific upgrade. If free-route billing/limits are uncertain, disable the path and continue deterministic/mock/local work.

## Grok onboarding
- `GROK.md` is the dedicated Grok/xAI startup and engineering charter. `AGENTS.md` links it and requires Grok to read it with shared memory and master context at session start.
- Repository docs alone do not force Grok to load them. The Grok project/client must have repository access and a startup/custom instruction to read `GROK.md`; verify this separately before claiming automatic onboarding.
- Grok is xAI's assistant; Groq is a separate inference provider. Groq provider activation remains OFF unless BOS explicitly approves.

## Next actions
1. Finish exact-head CI/security and self-review for the current PR #115 update; integrate only through its normal PR gates.
2. Disposition stale PR #112 and #105 after preserving any unique useful content; keep the develop WIP limit at 3.
3. Verify the merged main worker's scheduled run history and zero-charge provider behavior. If either cannot be proven, leave/return AUTONOMOUS_AGENT_ENABLED=0; do not configure new secrets or spend.
4. Implement the next Agent Platform increment in an isolated branch after a PR slot opens: a least-privilege non-production adapter from the existing PostgreSQL queue to a bounded worker, with durable audit, approval and kill-switch semantics. No paid database or production activation.
5. Keep Railway staged until a genuinely Rp0 deployment path is confirmed; prioritize local/mock tests, GitHub free CI and repository improvements.


## Contributor policy update — 25 November 2026
- Grok/xAI is a full engineering peer with the same project scope as ChatGPT and other approved agents: research, implementation, tests, branches, commits, pushes, PRs, reviews and routine validated integration. No provider-based restriction; one writer per branch/worktree prevents conflicts. Grok's reported PR-creation 403 requires its own GitHub token to have Pull requests: Read and write. This policy does not grant token scopes or bypass production/security approval gates.


## Grok dashboard creative autonomy — 26 November 2026
- BOS authorizes Grok/xAI to proactively design and implement ambitious main-dashboard UI/UX improvements: layout, visual hierarchy, widgets/charts, AI insight panels, interactions, animation, accessibility and responsive desktop/mobile behavior. Routine design decisions do not require per-change BOS approval.
- Preserve all existing menus/routes/features/data contracts; never fabricate market data/signals or expose secrets; no paid services/assets or live financial actions without approval. Respect accessibility, performance, source/freshness and reduced-motion.
- Explore in isolated `exp/*`; implement from latest `develop` on scoped `feat/*`; one writer per branch. All PR/CI/QA/release gates remain unchanged. This is creative authority, not permission to bypass production controls or a claim of automated enforcement.
