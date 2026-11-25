# RADAR AI Engineering Constitution
**Status:** Permanent project policy; additive governance baseline for RADAR AI V2 → V3  
**Owner:** BOS  
**Effective:** 26 November 2026 (Asia/Jakarta)  
**Scope:** All divisions, AI agents, coding assistants, human contributors, services, repositories, branches, releases and production operations.

This constitution turns the 12 governance areas approved in the project discussion into one durable engineering standard. It complements (and does not replace) `AGENTS.md`, `RADAR_AI_MASTER_CONTEXT.md`, `RADAR_AI_SHARED_MEMORY.md`, division charters, security rules and the existing branch/CI policies. If wording conflicts, the stricter existing safety or owner-approval rule wins until the conflict is explicitly reconciled.

## 0. Mission and non-negotiable principles

1. Evolve one continuous RADAR AI product from V2 to V3; preserve working features, history, contracts and known-good releases.
2. Prefer correctness, security, explainability and recoverability over speed or apparent autonomy.
3. Use modular boundaries and small reversible changes; do not rewrite the platform merely to adopt a fashionable architecture.
4. Rp0 is the hard budget unless BOS explicitly approves a specific spend. Free-tier quotas, overage rules, terms and data-use policies must be verified before use.
5. Never expose secrets, invent data or test evidence, or claim an inactive capability is operational.
6. Production financial execution, withdrawals, moving funds, destructive data actions, risky production migrations, paid activation and material permission/credential changes remain approval-gated.
7. A policy, schema, branch, CI pass or merged commit is not proof of a deployed or active runtime capability.

## 1. Architecture and project structure

- Default to a **modular monolith** while the product and team are small. Keep deployment and operational complexity low.
- Organize code by domain/capability (market data, intelligence, exchange adapters, alerts, AI workspace, agent platform, knowledge/memory, API/UI) with explicit ownership and narrow interfaces.
- Separate transport/API handlers, domain logic, provider adapters, persistence, orchestration and presentation. Provider-specific behavior must not leak across unrelated domains.
- Keep external integrations behind adapters and normalized contracts. Core dashboard behavior must degrade gracefully when an optional provider is unavailable.
- Extract a worker, service or database only when measured throughput, isolation, reliability or security needs justify it and the cost/operational burden is understood.
- Avoid circular dependencies, hidden global mutable state, duplicate business logic and unbounded in-process work.
- **Language strategy:** TypeScript-first for new application/API/domain/orchestration/UI code; preserve existing JavaScript and migrate incrementally with parity tests. Python is for offline research, data science and backtesting, not production exchange order execution. SQL defines relational data and migrations. Add Rust/Go only after profiling proves a bottleneck. See the BOS-confirmed decision in issue #138.
- Do not add runtime dependencies or new infrastructure without a concrete need, compatibility review, maintenance plan and Rp0/cost assessment.

## 2. Inter-agent communication and ownership

- Every task has one accountable lead, one clearly scoped objective and one writing branch. Supporting divisions provide bounded review or deliverables; they do not create overlapping edits.
- Use a structured handoff containing: task ID/title, owner/lead division, objective, context/source references, allowed files/interfaces, constraints, dependencies, acceptance criteria, test plan, risk class, required approval, status, evidence and next action.
- Define file/interface ownership before parallel work. Two agents must not write the same branch or files concurrently. Integrate through reviewed PRs.
- Agents exchange decisions and durable findings, not raw conversation transcripts or private reasoning. Record provenance and link to source issues/PRs/commits.
- A receiving agent must acknowledge scope and report blockers explicitly. Do not silently reinterpret a task, duplicate another division's work or claim a handoff was accepted when it was not.
- Use the division routing matrix in master context. One lead remains accountable for end-to-end completion; internal division silence must not stall safe routine work under the active QA override.
- Never invent GitHub usernames, reviewers, team identities or independent review provenance.

## 3. Security, identity and permissions

- Apply least privilege to users, agents, service accounts, database roles, GitHub tokens and workflows. Grant only the actions and paths required for a task.
- Secrets belong only in server-side secret storage/environment. Never put keys, tokens, passwords, private account data or secret-bearing URLs in source, frontend bundles, fixtures, issues, logs, screenshots or chat.
- Redact sensitive values in errors and telemetry. Do not log full provider responses if they may contain private account data.
- Validate and authorize every privileged API operation server-side. UI visibility is not an authorization boundary. Protect admin routes, enforce CSRF/origin controls where applicable, rate-limit sensitive endpoints and use secure defaults.
- Treat provider payloads, web pages, model output, uploaded files and agent messages as untrusted input. Validate schemas, lengths, encodings, URLs, file sizes and allowed operations.
- Workflows use minimal permissions, pinned actions where practical, protected secrets and no untrusted PR code in privileged secret contexts.
- Exchange credentials remain read-only by default. Withdrawal stays disabled; live trading stays OFF. No agent may grant itself permissions or bypass a human approval gate.
- Security controls must fail closed. A missing credential, unknown permission, invalid signature or unavailable policy service must not silently grant access.

## 4. Data, storage and lifecycle

- Every externally sourced record should preserve source/provider identity, asset/entity identity, retrieval/observation time, publication time when relevant, units, schema/version and freshness/quality state.
- Distinguish observed facts, derived calculations, model interpretations and unavailable data. Missing data must be null/unknown/NOT_ENOUGH_DATA, never fabricated or silently replaced with a guess.
- Normalize timestamps to UTC internally and display local time with an explicit timezone where ambiguity matters. Validate numeric ranges, precision, units, chain/network, symbol and contract identity.
- Define retention, ownership, deletion, backup and recovery behavior for each data class: public market data, private account data, task state, audit events and AI memory.
- Durable queues/checkpoints/leases require transactional storage and restart-recovery tests. Process memory, temporary files and ephemeral disks are not durable persistence.
- Schema changes use versioned migrations, forward/backward compatibility where feasible, disposable migration tests, backup/restore plan and rollback analysis. Never run destructive tests against production.
- Keep private exchange data minimized, short-lived and access-controlled. Never persist tokens or secrets as application state.
- PostgreSQL adapters/migrations or other pilots remain OFF and non-production until their explicit activation gates pass. A schema existing in Git is not a production database.

## 5. AI memory and shared knowledge

- `RADAR_AI_SHARED_MEMORY.md` is the single compact cross-agent handoff. Keep it under 12 KB and store only durable decisions, architecture, verified status, blockers and next actions.
- Never store conversations, chat exports, prompts/responses, chain-of-thought, raw transcripts or message-by-message histories in repository memory.
- Store technical specifications in focused documents; keep master context as the project record, not a dialogue archive.
- Every knowledge item should carry provenance (source/reference), created/observed time, applicable version/scope, confidence/quality and retention classification.
- Separate facts from hypotheses and model-generated summaries. Retrieval must preserve citations/provenance and indicate stale, conflicting or low-confidence information.
- Apply role/permission checks before retrieving private or sensitive data. Memory must not become a channel for secrets or unrestricted cross-agent access.
- Prefer relational metadata and full-text search first. Add embeddings/vector infrastructure only after measured retrieval need, privacy review, quota/cost review and a tested fallback.
- Correct or supersede stale facts with history; do not silently erase important decisions or duplicate entire memory files.

## 6. API and integration contracts

- Define explicit request/response schemas, types, units, nullability, error shapes, pagination and versioning expectations for every internal or external integration.
- Keep provider adapters isolated. Normalize responses at the boundary and retain source provenance; do not let provider-specific fields silently become universal domain truth.
- Set bounded timeouts, response-size limits, concurrency, retry budgets and rate limits. Retry only transient/idempotent operations; use exponential backoff with jitter and a hard attempt cap.
- Use idempotency keys or equivalent deduplication for task claims, webhook processing and any operation where retries could duplicate effects.
- Validate URL destinations and redirects to prevent SSRF; allowlist hosts where possible. Enforce TLS and do not forward credentials across untrusted redirects.
- Handle 4xx/5xx, malformed JSON, empty payloads, partial provider failure, quota exhaustion and schema drift explicitly. Preserve usable data from independent providers when safe.
- Never expose raw upstream errors, stack traces, secrets or private provider payloads to browsers.
- Public read-only endpoints must remain separate from privileged account endpoints and any future write-capable exchange API.

## 7. Reliability, recovery and safe degradation

- Bound every queue, cache, worker pool, request body, response body, retry loop, scheduler run and in-memory collection. Define explicit overflow behavior.
- Use timeouts, cancellation, backpressure, circuit breaking or provider cooldowns where appropriate. Prevent overlapping scheduled runs unless concurrency is intentionally bounded.
- Preserve last-known-good data with an explicit stale timestamp/status; do not present stale values as current.
- Isolate failures by provider/task where possible. One optional provider failure must not corrupt state or block unrelated capabilities.
- Durable workers require atomic claim/lease, heartbeat, retry/backoff, idempotency, cancellation, dead-letter handling, restart recovery, audit events and emergency kill switch before production activation.
- Define readiness versus liveness: readiness means dependencies required to serve the promised capability are usable; liveness means the process is alive. Health endpoints must not leak secrets.
- Document backup, restore, rollback and incident recovery for every stateful or production-sensitive change. Test recovery in disposable environments.
- Stop safely on uncertain financial state. No retry may duplicate an order or transfer; live financial actions remain disabled absent explicit BOS approval and controls.

## 8. Cost, quota and resource governance

- Default budget is Rp0. No paid plan, card, paid fallback, chargeable provisioning, overage exposure or production spend without explicit BOS approval.
- Before adopting a free tier, verify current quota, concurrency, rate limits, expiration, card requirement, overage/billing behavior, retention, data-use terms and geographic availability.
- Enforce per-provider request/token budgets, concurrency caps, daily limits, timeouts and circuit breakers. Reserve capacity for critical user-facing functions.
- Prefer existing dependencies, GitHub public-repository CI, local/open-source tooling and already-provisioned resources. Do not treat a free trial as permanently free.
- Optional AI providers must not become hard dependencies for core dashboard, data correctness, security or queue integrity.
- Do not send private RADAR data, exchange account payloads, secrets or sensitive internal records to free AI tiers without a verified data-use/privacy basis and explicit authorization.
- Record expected and actual resource use where measurable. Stop optional work before breaching budget/quota; never silently switch to a paid provider.

## 9. QA, testing and CI quality gates

- Every change has testable acceptance criteria and a risk-based test plan before implementation.
- Use the smallest relevant test first, then the full available suite before integration when feasible. Add regression tests for every confirmed bug.
- Test layers include syntax/type checks, unit, API/contract, integration, database migration, concurrency/failure/restart, security scans and browser/device QA as relevant.
- Tests must be deterministic, bounded, isolated and use synthetic/mock data for provider/exchange paths. Do not hit real accounts or perform financial actions in tests.
- Run exact-head GitHub Actions checks. A green run on an older SHA is stale; missing, skipped-required, pending, cancelled or inconclusive checks are not PASS.
- Inspect the full diff and changed-file list for accidental deletion, secret exposure, unsafe defaults, compatibility, race conditions, resource bounds and migration hazards.
- Keep test evidence precise: command/run ID, commit SHA, counts and outcome. Distinguish local tests, GitHub CI, Hostless Build and verified LIVE behavior.
- Manual review provenance must be honest. Self-review is not an independent review. Follow the current temporary QA/division override and high-risk objective controls in `AGENTS.md`.
- Do not add a test that merely asserts implementation text when a runtime/contract test can reproduce the behavior more meaningfully.

## 10. Monitoring, observability and auditability

- Use structured logs with timestamp, severity, component, event name, correlation/request/task ID and sanitized context.
- Track meaningful metrics: request/error/latency rates, provider freshness and quota, queue depth/age, task success/failure/retry, worker heartbeat, storage health and resource consumption.
- Define alert thresholds and an owner/action for each alert. Avoid noisy alerts without a response path.
- Audit privileged actions and agent lifecycle transitions: who/what initiated, policy decision, task/target, result, timestamp and correlation ID. Audit records must not contain secrets or unnecessary private data.
- Make failures diagnosable without exposing credentials or user data. Include provider name and safe error category, not raw sensitive payload.
- Keep observability proportional to current scale. Prefer existing platform logs/metrics and bounded CI artifacts before adding paid monitoring stacks.
- Never invent dashboard metrics. Show UNKNOWN/NOT CONFIGURED when no verified telemetry exists.

## 11. Product, UI/UX and accessibility standards

- Preserve existing routes, menus, features and user workflows unless BOS explicitly directs otherwise.
- Design mobile-first but verify desktop and mobile layouts independently. Tables, charts, navigation, dialogs and forms must remain usable on narrow screens.
- Follow consistent visual hierarchy, spacing, typography, colors, loading/empty/error/success states and interaction patterns. Do not show success before the server confirms it.
- Provide keyboard access, visible focus, semantic labels, sufficient contrast, sensible touch targets and screen-reader-friendly state where applicable.
- Explain data freshness, source, limitations, confidence and unavailable capabilities. Do not make estimates look like verified account balances or guaranteed trading outcomes.
- Avoid blocking UI during network/AI work. Support cancellation and clear recovery for long-running actions.
- Keep user controls honest: disabled means disabled, connection status reflects a real test, and progress indicators reflect actual work.
- QA critical flows on real browser/device when possible; source-level tests are not a substitute for visual/runtime QA.

## 12. Versioning, change governance and release management

- Use permanent `main` as production/stable and `develop` as integration. Work on isolated task branches and submit PRs to the correct target under the current branch-source policy.
- One coherent task per branch/PR. Respect the 3 active non-emergency PR WIP limit; triage stale/duplicate/superseded PRs before opening more work.
- Use conventional commit prefixes and descriptive PRs linking the source issue, objective, changed files, acceptance criteria, test evidence, risk, migration and rollback.
- Do not write directly to `main`. Production releases flow through validated `develop` → `main` PRs; hotfixes follow the explicit hotfix policy.
- Use SemVer for releases and immutable tags tied to the exact released commit. Never create a release tag for an unverified build.
- Maintain a known-good baseline. Every risky change must have a tested rollback/recovery plan; never force-reset shared branches or reverse production data blindly.
- Preserve V2 behavior and data history during V3 preparation. Build V3 in an isolated branch/path, document migration and rollback, and do not replace LIVE without the required approval.
- Reconcile `AGENTS.md`, master context, shared memory, README and implementation when a durable rule changes. Keep history; mark superseded decisions rather than deleting them.

## Implementation status and enforcement boundary

This document is an **active policy**, not a claim that every control is already automated. Existing GitHub workflows enforce only the checks actually present in those workflows. Verify repository settings, branch protection, CI jobs, runtime services and Hostless deployment separately. If a control is not technically enforced or operationally tested, label it **policy-only / not yet enforced**.

No additional worker, scheduler, database, monitoring service, paid plan, provider, credential or production capability is activated by this constitution. It does not authorize live trading, withdrawals, transfers, production migrations or destructive operations.

## Adoption sequence

1. **Immediately:** all contributors read this constitution with `AGENTS.md` and shared memory; apply the 12 standards to new work and PR templates/reviews.
2. **Foundation:** audit current branch protection/workflow permissions, secrets handling, test/security coverage, API contracts, storage and rollback evidence. Record enforced vs policy-only controls.
3. **Operational readiness:** add bounded observability and reliability tests only where measurable gaps exist; prove durable queue/worker recovery in disposable environments before activation.
4. **Scale:** extract services/workers or introduce new storage/infrastructure only when metrics demonstrate need and Rp0/approval constraints are met.
5. **V3:** preserve V2 baseline, publish compatibility/migration contracts, test rollback, and require explicit release approval before LIVE replacement.

## Definition of Done

A meaningful delivery is complete only when its scope and owner are clear, contracts and risks are understood, tests and security checks relevant to the change pass on the exact head, the diff is reviewed, documentation is updated, the commit/PR is traceable, deployment state is reported separately, and one next action is recorded.
