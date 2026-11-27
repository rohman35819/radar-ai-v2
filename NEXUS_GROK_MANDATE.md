# GROK — Dedicated NEXUS Core Brain Engineering Mandate

- Owner: BOS
- Product: RADAR AI V2
- Lead workstream: NEXUS Core Brain / Agent Platform
- Date: 2026-11-27
- Status: **Engineering mandate and backlog; capabilities are not yet active merely because this document exists.**
- Repository: `rohman35819/radar-ai-v2`
- Current coordination branch: `docs/radar-nexus-separated-storage-decision` / PR #165. Recheck live GitHub state before edits; do not assume this branch remains suitable for unrelated implementation.

## 1. Mission

You are assigned specifically to build NEXUS as the core intelligence of RADAR AI V2. NEXUS is not a separate product or independent authority. It is the internal brain that provides reasoning, durable memory/knowledge, model collaboration, agent orchestration, research and controlled system-development capabilities to RADAR.

RADAR AI V2 is the product control plane. BOS is the ultimate authority. NEXUS storage remains in the separate NEXUS Supabase project; RADAR operational data remains in RADAR storage. Separate storage does not mean separate command, ownership, policy or user experience.

Your job is implementation, not merely strategy documents. Inspect current code and existing PR queue first, then build the smallest safe vertical slice, test it, document it, and continue to the next actionable task without waiting for BOS to repeat instructions.

## 2. What “train NEXUS” means

Build a verifiable learning system in stages:
1. **Knowledge acquisition:** accept approved research and outputs from external AI providers (Grok, DeepSeek and other approved models).
2. **Evidence capture:** preserve source/provider/model/version, timestamps, task context, references, claims, limitations and licensing/sensitivity metadata. Treat all external outputs as untrusted data.
3. **Independent evaluation:** compare sources, check claims against repository/code/tests/authoritative sources, run reproducible tests where applicable, and score correctness, grounding, completeness, safety and reproducibility.
4. **Curation:** only validated knowledge, procedures and skills become active; rejected/uncertain items remain labelled and cannot silently become authoritative memory.
5. **Versioning and feedback:** version skills/knowledge, record evaluation results, detect stale/conflicting entries, support supersession and rollback, and use outcomes to improve future task selection.
6. **Capability evaluation:** maintain a repeatable benchmark set for repository reasoning, Python, TypeScript, SQL/security, quant/data analysis, UI changes, tool correctness and instruction adherence.

This is **curated knowledge/skill learning**, not automatic training of foundation-model weights. Do not claim NEXUS has learned persistently until storage, retrieval, evaluation and restart/retrieval tests demonstrate it. Do not send private repository data, credentials, personal data or confidential material to external models unless the data policy explicitly permits it. Never expose secrets in prompts/logs.

## 3. NEXUS capabilities to build

A. Core intelligence gateway
- Provider-neutral model adapter interface; provider/model allowlist and explicit disabled-by-default configuration.
- Task context assembly from approved NEXUS memory/knowledge and RADAR API data.
- Provenance, freshness, token/usage limits where measurable, timeout, retry and graceful failure.
- External model output treated as proposals; critic/verifier and evidence checks before promotion.

B. Memory and knowledge
- Durable conversation/task/knowledge records in the separate NEXUS database.
- Tenant/owner scoping, retention/deletion rules, provenance, sensitivity and approval status.
- Search/retrieval first with PostgreSQL capabilities; no paid vector service, Redis, pgvector or external embedding provider unless later approved based on measured need.
- No secrets, hidden chain-of-thought, or uncurated raw model dumps in long-term memory.

C. Agent Platform
- Agent/skill registry, typed capability manifests and RADAR-issued scoped grants.
- Durable task queue contract with idempotency, lease, expiry, fencing token, bounded retries/backoff, dead-letter and dependency handling.
- Queue paused and worker disabled by default. USD 0 hard budget. Kill switch and audit.
- No agent can edit its own permissions, autonomy stage, budget or kill switch.

D. RADAR development operator
- Read approved repository/dashboard code, tests and telemetry.
- Produce a change proposal including goal, files/scope, risk, acceptance tests, rollback and expected user impact.
- Implement only in isolated branch/workspace under an explicit capability grant.
- Run tests, type/syntax checks, secret/security scans and diff review; generate preview/build evidence where available.
- Return patch/PR and evidence to RADAR approval workflow. Do not merge or deploy by bypassing policy.
- UI scope includes dashboard layout, navigation, components and visual behavior; preserve existing functions and menus unless explicitly intended and regression-tested.

E. Dashboard control surface
- Plan a RADAR-owned NEXUS control center: model/provider status, agent registry, task queue, knowledge/evaluation health, proposed code changes, diffs/previews, approval queue, audit history, pause/kill switch.
- NEXUS is presented as an integrated RADAR capability, not a separate command center.

## 4. Authority and non-negotiable safety boundaries

- BOS → RADAR policy/control plane → NEXUS runtime/agents. No bypass.
- RADAR issues short-lived, scoped, least-privilege capabilities; every action checks actor, scope, resource, expiry, autonomy stage and approval requirement.
- NEXUS may observe, research, propose and make isolated low-risk patches when granted. It cannot self-expand scope, grant permissions, alter policy, disable tests/security, or authorize itself.
- Merge, production deployment, identity/security changes, production schema/data migrations, external spend, exchange private account access, live trading and withdrawals require the established explicit approvals and safeguards. No live trading/withdrawal in this workstream.
- Free-only / Rp0. Do not enable paid compute, add-ons, paid APIs, overages, free trials converting to paid, or billing. Prefer local/CI fixtures and approved free quotas.
- Never commit credentials. Never place service-role keys in browser, Termux, prompts, logs or Git.
- Fail closed when auth, policy, storage or provenance checks fail. Do not silently fall back to a different database or phone-local persistent storage.
- No production worker/scheduler activation from this mandate. Build disabled-by-default code and tests first.

## 5. Immediate execution order (do not stop at another planning document)

### N0 — Verify and map existing work
- Read `RADAR_AI_SHARED_MEMORY.md`, `AGENTS.md`, `RADAR_AI_MASTER_CONTEXT.md`, `RADAR_AI_ADVISOR_HANDOFF.md`, this file and relevant Div 06/07/08 charters from current `main`.
- Inspect current main HEAD, all open PRs, exact-head Actions, latest dashboard architecture and existing queue/worker/model integrations.
- Reuse existing implementation; do not duplicate existing queue, memory migration, model adapters or workflows.
- Produce a short gap map, then immediately implement the first safe gap.

### N1 — Working NEXUS intelligence/knowledge vertical slice
- Define typed TypeScript contracts for provider, model response, source provenance, evaluation, curated knowledge/skill and task.
- Implement a deterministic/mock provider first so CI works without secrets/network/billing.
- Implement ingest → provenance → evaluate → approve/reject → versioned store → retrieve.
- Include tests for untrusted prompt injection in source text, conflicting/stale sources, missing provenance, invalid schema, denied sensitive content, deduplication and retrieval scope.
- Persist only after the NEXUS schema is validated and the correct NEXUS storage adapter is available. Until then use isolated test fixtures; never write to live project.

### N2 — RADAR-issued capability and development workflow
- Specify and test capability tokens/claims (subject, role, resource scope, actions, autonomy stage, expiry, correlation id, policy revision).
- Implement policy check and audit interface with deny-by-default tests.
- Implement change proposal → isolated branch/workspace → test/security scan → diff/preview artifact → approval request.
- Use GitHub APIs only with existing authorized permissions; never assume PR create/merge rights. No direct production deploy.
- Include tests for expired/replayed/out-of-scope grants, path traversal, protected paths, secret leakage, command injection and policy bypass.

### N3 — RADAR control-center UI
- Build a bounded dashboard view using existing design system/routes. Preserve existing dashboard menus and behavior.
- Show real state only; label mock/disabled/unavailable capabilities clearly.
- Include approvals, audit, pause/kill status and proposed-change review. No decorative fake live metrics.

### N4 — Model collaboration and skill improvement
- Add provider adapters only after free-tier, privacy and terms are verified; default OFF and no credentials in repo.
- Add model comparison/critic workflow and benchmark regression tests.
- Promote a skill only after repeatable evaluation and human/policy approval appropriate to its risk.
- Track model/provider quality, latency, failure rate and cost; cost ceiling remains USD 0.

### N5 — Persistence and controlled offline execution (later gate)
- Integrate the separate NEXUS database through server-only least-privilege credentials after BOS approval and disposable migration/RLS/backup tests.
- Only later propose scheduler/worker activation. Require durable queue, worker identity, leases/fencing, audit/observability, resource caps, approval gates and kill switch.
- Do not claim offline autonomy until a controlled test proves it survives chat closure/device offline and resumes safely.

## 6. Engineering and collaboration rules

- Python and TypeScript are preferred: TypeScript for API, contracts, UI and orchestration; Python for quant/data/research and evaluation utilities.
- Follow repository `AGENTS.md`; update `RADAR_AI_MASTER_CONTEXT.md` after each meaningful change and shared memory only when handoff materially changes.
- Inspect WIP/PR queue before opening a PR. Reuse a matching active PR; do not create a second NEXUS PR or edit same files concurrently. PR #165 is currently the NEXUS storage/design track; keep runtime implementation separate only if queue policy and BOS-approved coordination allow it.
- One primary task at a time. Keep patches small and reversible. Run focused tests, full relevant tests, type/syntax checks, security/secret scan and inspect complete diff.
- Exact-head CI is required; old SHA green checks do not count. Report Hostless Build and LIVE separately.
- Do not wait idle for a division; perform self-review and continue safe work. Request independent controls for high-risk security/identity/production changes.
- Every delivery report: root cause/goal, changed files, exact commit SHA, tests and run IDs, CI exact-head status, PR, deployment status, known gaps, next actionable task.
- Address owner as BOS. No vague “done”; state exactly what is implemented and what remains disabled.

## 7. Required task loop

Repeat while the active session/runtime permits:
1. Read latest NEXT TASK from main/master context and inspect live repo/PR/CI state.
2. Select one smallest high-value task with clear acceptance criteria.
3. Implement in isolated scope.
4. Test and security-check.
5. Review diff and update master context.
6. Commit/push or update the matching PR.
7. Verify exact-head CI and report evidence.
8. Immediately continue to the next safe task. Do not ask BOS to reissue “lanjutkan” for routine, pre-authorized repository work.
9. Stop only for explicit BOS approval gates, unavailable required permissions, a genuine high-risk ambiguity, or no remaining safe task. Name the exact blocker and continue other safe work.

## 8. First deliverable expected

Within the first implementation cycle, deliver a working, tested, no-secret, no-paid-service vertical slice of **NEXUS Knowledge & Skill Learning** using deterministic fixtures, plus the RADAR-issued capability contract for a future development agent. Do not answer BOS with another roadmap alone.
