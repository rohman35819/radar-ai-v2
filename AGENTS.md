# Instructions for AI contributors

Before doing any work in this repository, read `RADAR_AI_SHARED_MEMORY.md` first, then read this `AGENTS.md` and `RADAR_AI_MASTER_CONTEXT.md` completely. The shared memory is the compact cross-agent handoff; the master context is technical project documentation, not a conversation archive.

Treat it as the project handoff and operating guide. Then inspect the latest `main` commit and the actual files relevant to the task. The master document can be stale; verify before acting.

Do not restart analysis from zero, ask the owner to repeat information already documented, remove existing features, or overwrite whole files for small changes. Preserve all existing dashboard menus and behavior.

Run relevant tests, inspect the diff for accidental deletions and secrets, and update `RADAR_AI_MASTER_CONTEXT.md` after each meaningful change with the new commit, test results, deployment status, open bugs, and next task.

Never claim a Hostless deployment is live without checking Hostless. Never put API secrets in source code, frontend code, logs, chat, or documentation. Never enable withdrawals or live trading without explicit owner approval and required safeguards.

## Long-term continuity policy — RADAR AI V2 through V3

These rules remain in force for the entire project lifecycle, including future chats, contributors, releases, and the V2-to-V3 transition. They are not temporary task instructions.

1. **Continuity first:** Treat every task as continuation of the same product. Read the master context, inspect current `main`, recent commits, open issues/PRs where available, and relevant source files before deciding what to do. Do not ask the owner to repeat documented facts.
2. **Automatic documentation:** After every meaningful code, configuration, architecture, testing, security, or deployment change, update `RADAR_AI_MASTER_CONTEXT.md` in the same work cycle. Update current status, decisions, changed files, tests, exact commit SHA, deployment evidence, unresolved risks, and the next actionable task. Do not wait for the owner to remind you.
3. **Keep a durable history:** Preserve prior decisions and important incidents. Add dated entries to a concise project change history; do not silently erase context or rewrite history. Mark obsolete information as superseded with the replacement decision.
4. **One source of truth:** Keep the master context, this file, README, and actual implementation consistent. If they conflict, actual repository state wins for what is implemented; record and reconcile the documentation discrepancy.
5. **No regressions by convenience:** Preserve existing working features, routes, menus, data contracts, and user workflows. Prefer small, reversible changes. Before broad refactors or breaking changes, explain impact and obtain owner approval.
6. **Evidence-based delivery:** Run relevant tests and checks, inspect diffs, and report exact outcomes. Clearly distinguish code committed to GitHub, Hostless build status, and verified live behavior. Never invent test results, logs, or deployment success.
7. **Secrets and user funds:** Never expose credentials. Keep exchange secrets server-side. No withdrawal permission. No live order or financial action without explicit approval and documented safety controls.
8. **Operational limits:** If a required external system (such as Hostless) is inaccessible, continue useful repository work where safe, record the blocker, and state exactly what cannot be verified. Never imply access you do not have.
9. **Release discipline:** Keep version/release notes and migration notes current. Before any release, check compatibility, persistence/data migrations, rollback path, security, and tests.
10. **V2-to-V3 continuity:** V3 is the next evolution of this same RADAR AI product, not a fresh unrelated project. Do not start V3 by deleting or abandoning V2. First document V2's stable baseline, features, architecture, known defects, data formats, and migration requirements. Build V3 in a separate branch or clearly isolated versioned path; preserve V2's last known-good release and provide a tested migration/rollback plan. Promote V3 only after acceptance checks and owner approval. Keep the master context as the handoff across versions.

At the end of every task, leave the repository in a state where the next contributor can continue without asking the owner to reconstruct the work.


## Multi-division AI organization and chat routing

The permanent organization, division scopes, routing matrix, autonomy levels, handoff format, specialist chat prompts, and universal new-chat prompt are defined in section 35 of `RADAR_AI_MASTER_CONTEXT.md`. Read that section in full before taking a RADAR task.

Every new RADAR conversation must:
1. Read the complete master context and this file from the current `main`.
2. Verify current HEAD, recent commits, CI, and relevant source files.
3. Route the task to one lead division using the section 35.5 matrix; identify supporting divisions only when needed.
4. If the owner says only "continue", "lanjut", "ok", or similar, resume the latest actionable NEXT TASK instead of asking what to do.
5. Preserve existing features and avoid simultaneous edits to the same files.
6. Keep implementation isolated, run relevant tests, and require independent QA before integration.
7. Respect autonomy levels: observation/proposals and isolated low-risk patches may be automated; production, secrets, permission, migration, deployment-risk, and all financial actions require explicit owner approval.
8. Do not claim background autonomy exists until scheduler, task queue, workers, durable state, audit logging, and approval gates are implemented and verified. Ordinary chat sessions do not run continuously between messages.


## Chief Strategy Advisor and offline autonomy
- The dedicated strategy/advisor handoff is `RADAR_AI_ADVISOR_HANDOFF.md`; read it together with the complete master context before strategic/organization work.
- The Advisor designs organization, roadmap, autonomy architecture, capability boundaries, KPIs, and division backlogs. The Executive Office Director owns operational coordination; domain divisions own implementation.
- Proposed Divisions 06 (Agent Platform & Automation) and 07 (Knowledge & Memory Systems) are proposals until implemented and verified. QA Gate and Security Gate remain cross-functional controls.
- Never claim ChatGPT folders/chats run continuously or coordinate automatically. Offline autonomy requires deployed scheduler, durable queue/state, worker runtime, shared memory, permission gateway, audit/observability, budget limits, approval gates, and kill switch.
- Begin with observe/propose and one isolated low-risk pilot. Workers cannot grant themselves permissions, merge/deploy without policy gates, or perform financial/production-sensitive actions without explicit Owner approval.
- Re-verify current `main`, PRs, CI, implementation, and Hostless status; handoff snapshots are historical evidence, not current truth.

## Division 08 — Procurement & Tools
- The permanent charter and new-chat handoff are in `DIVISION_08_PROCUREMENT_TOOLS.md`; read it together with the complete master context before procurement/tool research.
- Route tool discovery, free/open-source alternatives, API/provider evaluation, pricing/quota verification, and technology procurement research to Division 08.
- Division 08 researches and recommends; domain divisions validate technical fit, Division 05 performs independent QA, and Executive Office sets priority.
- No paid purchase, payment method, production provider replacement, or paid service activation without the required explicit BOS approval.
- Verify free-tier limits and official terms; never describe a free trial as a permanently free service. Keep secrets out of chat, Git, frontend, and logs.


## Permanent owner address and salutation policy
- Always address the project owner as **BOS** in every user-facing reply, report, notification, handoff, and newly opened RADAR AI conversation, regardless of which division, agent, contributor, or chat is responding.
- Do not address the owner by their personal/account name, username, email, or other personal identifier. Use "BOS" consistently; avoid switching between "Anda", "kamu", titles, or other forms of address when directly addressing the owner.
- Apply this rule in Indonesian and other languages (retain the exact salutation "BOS").
- This is a permanent project-wide communication convention, not a temporary task preference. Every division must propagate it to its own prompts, templates, and generated reports.
- New conversations must read this policy from the current `main` branch before responding. If a conversation cannot access the repository, follow the available project instructions and use "BOS" as the default salutation.


## Delivery discipline for all divisions
- Follow the current master context backlog and work on one primary implementation task at a time, with one lead division and narrowly scoped supporting review.
- Fix user-visible P1/P2 bugs before starting new features or broad refactors.
- Before merging an old PR, verify its current head, base against latest main, diff, mergeability, and successful Actions run on the exact head after rebasing/updating.
- Every delivery must include root cause, changed files, acceptance criteria, exact test results, commit SHA, CI result, Hostless Build state, verified LIVE state, unresolved blocker, and one actionable NEXT TASK.
- Do not treat a review, plan, or green CI on an obsolete SHA as completion. Do not claim Hostless LIVE from GitHub CI.
- Keep production credentials, exchange trading/withdrawal, financial actions, risky migrations, and production data deletion behind explicit BOS approval.

## PR intake, WIP limit, and emergency exception policy (effective 24 November 2026)

- Normal work-in-progress limit: at most **3 active, non-emergency PRs** across the repository. This is a planning/operating limit, not a GitHub-enforced technical limit unless a separate repository rule is implemented and verified.
- A new PR is allowed when it is materially important; the limit is not a blanket ban. Before opening it, record why the work matters now, user/business impact, urgency, why it cannot wait for an existing slot, owning division, dependencies, acceptance criteria, and expected QA/security gates.
- Emergency/security/reliability hotfixes may exceed the normal limit. Every exception must be explicitly labeled and documented in the PR body and master context with: incident/severity, evidence, affected systems/users, reason it cannot wait, narrow scope, owner, risk controls, test plan, rollback plan, reviewers, and follow-up actions. Never use “emergency” merely to bypass review or increase throughput.
- Emergency means a credible active or imminent P0/P1 issue: security exposure, credential leak, data loss/corruption, production outage or material degradation, unsafe financial/trading behavior, or a critical defect blocking recovery. Routine features, cosmetic changes, stale PR cleanup, and ordinary deadlines are not emergencies.
- The exception accelerates coordination and prioritization; it does **not** waive essential safeguards. Run focused tests and secret/security scans, require an independent reviewer appropriate to the risk, and verify rollback. If a full test suite is impractical during containment, document the exact untested scope and run it before merge when safe. No automatic merge/deploy, no secret exposure, no live trading, and no paid spend.
- PR disposition: (1) merge only when relevant, based on latest main, exact-head checks pass, required independent reviews pass, and rollback/impact are understood; (2) close stale, duplicate, superseded, abandoned, irreparably conflicting, or low-value PRs after preserving any unique useful work; (3) keep blocked PRs only when a named dependency, owner, and next review condition are recorded. Closing a PR removes it from the active queue; it does not delete its GitHub history or automatically delete its branch.
- Before opening a new PR, inspect the existing queue and reuse/update an appropriate active PR when scope and ownership match. Prefer one PR per coherent feature/owner; avoid stacking unrelated changes and multiple PRs editing the same files.
- Every new RADAR conversation must read this policy from the latest main AGENTS.md and RADAR_AI_MASTER_CONTEXT.md, inspect current open PRs, and continue the existing queue. Do not rely on chat memory or old PR counts. Report the current active count, any exception and its reason, and the next actionable PR.

## Autonomous completion and integration gate (effective 24 November 2026)

BOS directs the lead assistant/contributor to complete routine work end-to-end without waiting for internal divisions to become available. This section supersedes any earlier wording that makes a divisional handoff/review an idle-time dependency. It does NOT waive evidence-based safety gates.

1. **No idle division dependency.** The lead owns implementation, code review, test execution, security checks, integration analysis, conflict resolution, documentation, and delivery reporting. Do not pause a task merely because Division 01/05/07 or another internal division has not responded. Ask for specialist input only when it adds evidence that cannot be obtained with available repository checks; continue all safe work meanwhile.
2. **Self-review is mandatory.** Before merge, inspect the complete diff and changed-file list; trace changed code through callers, routes, data contracts, persistence, configuration, and UI; check for accidental deletions, unsafe defaults, secrets, unbounded work, race conditions, data migration hazards, and compatibility regressions. Record findings and fixes.
3. **Latest-main integration is mandatory.** Fetch current main and PR head; compare base/head; verify the PR is based on latest main. If behind or diverged, update/rebase the PR branch using a safe supported workflow, resolve conflicts deliberately, inspect the resulting diff, and rerun all checks. Never merge a stale branch just because GitHub says mergeable.
4. **Mergeability is a separate gate.** Confirm GitHub mergeable state is true (not null/unknown/false), no unresolved conflicts remain, required branch protections are satisfied, and the exact expected head SHA has not moved. A successful compare alone is not proof of mergeability.
5. **Exact-head validation.** Require successful relevant GitHub Actions on the exact current PR head: project tests, build/type/syntax checks that exist, integration/database migration smoke tests for changed persistence or external contracts, and secret/security scans. A green run on an older SHA is stale evidence. Rerun after any code, workflow, migration, or test change. Diagnose failures and fix them; never relabel a failure as pass.
6. **Integration and regression checks.** Test changed interfaces end-to-end where an isolated test environment exists: route -> service -> provider/storage -> response/UI; verify schema compatibility, auth boundaries, timeout/retry, rate limits, failure behavior, restart/persistence semantics, and rollback where relevant. Use disposable test databases/services; never run destructive tests against production.
7. **Review without waiting.** For routine low/medium-risk changes, the lead's documented self-review plus exact-head automated tests/security/integration checks is sufficient; divisional review is advisory and must not block delivery. For high-risk security, identity/permission, production migration, financial execution, credential handling, or data-loss changes, require an objective independent control (automated security test, separate reviewer/tool, or explicit BOS decision) before merge. If no independent control is available, keep the change isolated and report the precise blocker; do not wait silently.
8. **Risk-based merge decision.** Merge only when the relevant gates above pass and the impact/rollback are understood. Fix merge conflicts, failing tests, stale branches, missing integration coverage, and unsafe defaults directly when safe. If a blocker depends on inaccessible production credentials, paid services, external approvals, or irreversible production action, do not guess or bypass it—prepare the tested change and state the one remaining owner action.
9. **No false autonomy claims.** Do not claim a service is integrated, active, deployed, or live merely because code is merged. Report GitHub merge, CI, Hostless Build, and Hostless LIVE separately. Never claim continuous/offline work without verified scheduler, worker, durable state, audit, permissions, budget limits, approval gates, and kill switch.
10. **Close the loop.** Update the master context with root cause, changed files, exact head/merge SHA, exact test runs and counts, integration/mergeability evidence, unresolved risks, Hostless status, and one next action. Keep no more than 3 active non-emergency PRs; classify stale/duplicate/superseded work and preserve unique changes before closing.

## TEMPORARY QA / DIVISION REVIEW OVERRIDE — BOS DIRECTIVE (24 November 2026)

**Status: ACTIVE TEMPORARY RULE.** This rule is in force while RADAR AI automation (automated QA/review, integration validation, and delivery workflow) is not yet fully operational and is still causing PR queues or idle delays. It supersedes conflicting requirements elsewhere in this file or older workflow templates that require waiting for an independent QA sign-off or Division 01/05 review before routine integration.

- When implementation is complete and the lead has inspected the full diff, resolved integration issues, confirmed latest-main compatibility and `mergeable=true`, and all applicable exact-head automated tests/build/security/integration checks pass, the lead may mark ready and merge without waiting for Division 01/05 or a separate manual QA response for routine low/medium-risk code.
- Do not leave completed work idle in Draft solely because an internal division has not reviewed it. Divisions may review asynchronously and report findings; their silence is not a blocker under this temporary rule.
- The temporary override removes the **waiting dependency**, not the quality bar. Self-review, exact-head CI, security/secret scans, relevant integration/migration smoke tests, rollback analysis, branch protection, and truthful reporting remain mandatory. Failed, missing, stale, or inconclusive evidence must be fixed or explicitly treated as a blocker.
- High-risk changes involving authentication/authorization, privilege boundaries, secrets, production database migrations, destructive/data-loss operations, financial execution/trading, or irreversible production actions must retain objective risk controls. Use focused automated security/integration tests and isolated environments; obtain BOS approval where the action itself requires it. Do not bypass production safeguards or invent test evidence.
- If an independent QA tool/reviewer is unavailable, do not wait for it on routine changes. Record that manual divisional QA was not performed and list the exact automated/self-review evidence instead.
- **Reopen condition:** this temporary override remains active until automation is demonstrated stable in real repository work: automated QA/review and integration gates execute reliably on current SHAs, report actionable results, do not depend on unavailable free-tier quotas or manual prompting, and complete several consecutive PR cycles without avoidable queue blockage or missed regressions. Only then may BOS/Executive Office re-enable mandatory independent QA and Division 01/05 sign-off. Do not remove or deactivate this section automatically; require documented evidence and an explicit BOS/Executive Office decision.
- Until reopened, every PR delivery report must label manual divisional review as `performed`, `not performed (temporary override)`, or `required due to high risk`; never imply a review occurred when it did not.


## Autonomous division routing and delegation — BOS directive (effective 24 November 2026)

- The lead contributor must select the lead division and any relevant supporting divisions from the current division charter/routing matrix in `RADAR_AI_MASTER_CONTEXT.md`. Do not ask BOS to choose a division or repeat documented context.
- Internal delegation is role-based. Use division names and responsibilities (for example, Division 01 Security, Division 05 QA); a GitHub username is not needed to assign internal ownership or perform a role-specific checklist.
- Never invent or guess GitHub usernames, teams, reviewer identities, or claim that an independent review occurred without evidence from a genuinely separate reviewer/agent/tool. If a verified human reviewer is strictly required for a high-risk gate and no repository identity/team can be verified, continue all safe isolated work and ask BOS only for that one missing identity/decision.
- For routine low/medium-risk work, do not wait for a division response. The lead owns full-diff self-review, exact-head CI, relevant security/secret scans, integration tests, latest-main compatibility, mergeability, rollback assessment, documentation, and truthful reporting. Follow the active temporary QA/division-review override above.
- Self-review is not independent review. Explicitly label divisional review as performed (with evidence), not performed (temporary override), or required due to high risk.
- High-risk identity/authorization, privilege, secrets, production migration, destructive/data-loss, financial/trading, and irreversible production changes retain objective controls and BOS approval where required. Delegation does not waive safeguards.
- For cross-division work, one lead remains accountable. Provide each supporting role a concise handoff (goal, files/interfaces, acceptance criteria, risks, tests, decisions); avoid concurrent edits to the same files.
- Ask BOS only for decisions reserved to the Owner (production, credentials/permissions, paid spend, destructive data actions, live financial/trading actions) or a human reviewer identity that is genuinely mandatory and cannot be verified. Never ask for a username merely to start internal coordination.
- Every delivery report states lead/supporting divisions, actual review provenance, exact SHA and checks, merge/deployment status, remaining risks, and one next task.


## BRANCH REGENERATION & TECHNOLOGY ADVANCEMENT — BOS DIRECTIVE (24 November 2026)

**Status: ACTIVE.** A stale, divergent, conflicted, or otherwise difficult-to-merge legacy branch may be regenerated as a clean branch from the latest `main`. The purpose is to preserve and complete the legacy work faster and more safely—not to discard its intent or silently reduce scope.

1. **Clean base:** create every regenerated branch from the current `main` SHA. Never base it on another stale branch. Use a traceable name such as `regen/pr-<number>-<short-purpose>` or `feat/<purpose>-latest-main`.
2. **Legacy intent is the specification:** before implementation, inspect the legacy PR description, full diff/patch, commits, comments/review findings, tests, documentation, referenced issues, and source/provider documentation. Record a migration map from each legacy requirement to its destination file/module/test or an explicit reason for exclusion.
3. **Preserve complete functional context:** carry forward all still-valid ideas, objectives, data sources, provider/API integrations, endpoints, schemas, fields, parameters, configuration, business rules, processing flows, outputs, UI/dashboard expectations, error handling, rate-limit behavior, attribution, and tests. Preserve source identity and provenance. Do not silently replace a source, remove a feature, weaken validation, or change semantics merely to simplify porting.
4. **No blind copying:** reimplement or adapt code to current architecture and latest-main interfaces. Resolve obsolete dependencies and conflicts deliberately. Preserve compatibility where required and document any necessary behavior change with rationale and tests.
5. **Technology advancement is allowed and encouraged:** add newer free/open-source tools, better providers, data enrichment, caching, resilience, observability, security, performance, automation, and UX when they materially improve RADAR AI V2. Additions must be compatible, maintainable, license-safe, documented, and preferably vendor-neutral. Keep the legacy feature set intact; additions must not silently displace its required capabilities.
6. **Scope and cost controls:** prefer free/open-source and usable free tiers; no paid activation, payment method, or production spend without BOS approval. No credentials/secrets in frontend, logs, fixtures, commits, or chat. New sources must be checked for availability, limits, registration/API-key requirements, licensing, privacy, reliability, timestamps, attribution, and fallback.
7. **Acceptance parity:** before a regenerated PR is considered complete, compare it against the legacy migration map. Every required legacy capability must be implemented or explicitly blocked with evidence. Add tests for legacy behavior and new enhancements; run relevant exact-head unit/integration/build/security checks. A green test suite alone does not prove feature parity.
8. **Source/data integrity:** validate schema, units, timestamps/time zones, chain/network, token/pool identity, pagination, freshness, duplicates, missing/stale values, API errors and rate limits. Keep raw-source provenance where useful; never fabricate missing market or intelligence data.
9. **Delivery and traceability:** link the new PR to the source PR/issue; summarize preserved features, removed/changed behavior, added technologies, source/API status, tests, risks and rollback. Keep the old PR/branch as historical reference until the regenerated implementation is verified; close/supersede it only with a disposition comment and traceable replacement link. Do not delete legacy branches or history as part of regeneration.
10. **WIP discipline:** no more than 3 active intensive PRs. Regenerate in priority order, finish or resolve active work before opening more. Related legacy PRs may be consolidated only when their interfaces and acceptance criteria are compatible; retain per-source traceability.
11. **Risk gates remain:** authentication/authorization, privilege boundaries, secrets, production migrations, destructive/data-loss actions, financial execution/trading and irreversible production changes retain their existing security controls and BOS approval requirements. This policy does not authorize production activation or deployment.
12. **Truthful status:** report separately what was mapped, ported, tested, merged, deployed and verified LIVE. Never describe an old feature as implemented merely because its idea was copied into a new branch.



## BRANCH GOVERNANCE & AI AUTONOMY CHARTER — BOS DIRECTIVE (24 November 2026)

**Status: ACTIVE POLICY.** The repository uses a protected production lane, an integration lane, and isolated work lanes.

- `main`: permanent production/stable branch. No direct pushes by AI or contributors. Receives only reviewed PRs from `develop` or `hotfix/*`, after required exact-head checks and release approval.
- `develop`: permanent integration branch. Receives coherent, tested feature/fix/validated experiment PRs. It is the normal target for day-to-day work.
- `feat/<name>`: temporary feature development or improvement branch, created from current `develop`; return via PR to `develop`.
- `fix/<name>`: temporary bug-fix branch, created from current `develop`; return via PR to `develop`.
- `exp/<name>`: isolated AI experimentation branch. May fail or be reworked without affecting `develop` or `main`. Do not open a PR until the experiment is reproducibly successful and its tests pass; then PR to `develop`.
- `hotfix/<name>`: narrowly scoped urgent production fix. May PR directly to `main` after focused risk controls, full relevant CI/security checks, rollback analysis, and required BOS approval for high-risk/production-sensitive actions. Forward-port the fix to `develop` immediately after release.

**Isolation and queue**
1. One task/one writing agent/one branch. Two agents must not concurrently write to the same branch or working tree. Reviewer must be separate from the author; CI is an automated gate, not a claim of independent human review.
2. Maximum 3 active open PRs targeting `develop` at a time. This is the integration WIP limit; it does not cap local/remote experiment branches. Emergency exceptions must be justified and documented under the existing emergency policy.
3. `exp/*` branches may be numerous, but must have bounded compute/time/API usage, no production credentials, and no production side effects. Only validated results enter `develop`.
4. Use Git worktrees when multiple agents share one machine; use separate branch/worktree or separate isolated workspace per agent. Never share one mutable working directory concurrently.
5. Old branches may be regenerated from latest `develop` while preserving all legacy ideas, sources, data contracts, features and acceptance criteria per the Branch Regeneration policy. Link every replacement PR to its source PR/issue.

**Required PR gates**
- PR to `develop`: source must be `feat/*`, `fix/*`, or validated `exp/*`; automated test, syntax, integration/database and security checks relevant to the diff must pass.
- PR to `main`: source must be `develop` or `hotfix/*`; full release checks, version/tag plan, migration compatibility and rollback plan must pass.
- Failed required checks block merge. Missing or stale checks are not passes. Re-run after changes and verify the exact head SHA.
- Keep the current WIP limit of 3 PRs toward `develop`. A branch without a PR does not count as an active PR.

**Automation and release safety**
- Every meaningful PR must run available tests and security scans. Add lint/build checks only when a real, maintained project command exists; do not invent a passing lint/build step. Add a dedicated lint/build command when justified and tested.
- Use conventional commit prefixes: `feat:`, `fix:`, `exp:`, `docs:`, `test:`, `ci:`, `security:`, `refactor:`, `chore:`. PR descriptions must state purpose, changes, legacy parity, data/provider/source status, tests, risks, migration and rollback.
- Release from `develop` to `main` must create an immutable version tag (SemVer, e.g. `v2.3.1`) tied to the exact released commit. Do not create a version tag before a release is verified.
- Rollback must be an explicit, auditable revert/redeployment to a known-good release. Never force-reset a shared branch or automatically reverse database/data changes. Health-triggered rollback may be automated only after safe thresholds, deployment adapter, migration compatibility, audit trail, and kill switch are implemented and tested.
- Preserve a known-good release and forward-fix after rollback. Roll back application code only when database compatibility is confirmed.

**BOS-authorized rule evolution**
BOS authorizes AI contributors to propose and adopt additional repository engineering, testing, observability, reliability, security, documentation, and automation rules when evidence shows they materially advance RADAR AI V2 toward safe autonomy. This is standing authority for additive technical governance; it does not require asking BOS for every low-risk process improvement.
- New rules must be written into `AGENTS.md` and/or `RADAR_AI_MASTER_CONTEXT.md`, dated, scoped, justified, and reconciled with existing rules.
- Rules must be additive and strengthen or clarify the system. If a rule conflicts with an existing rule, document the conflict and resolution; do not silently weaken a safety gate.
- AI may not use this authority to change repository/admin permissions, disable branch protection or required checks, weaken security, expose secrets, enable production services, spend money, approve destructive data actions, or enable live financial/trading actions. Those remain BOS/authorized-owner decisions.
- For material architecture/security/release policy changes, record rationale, risk, test/evidence, rollback and the next review condition in the master context. Mark obsolete rules as superseded; retain their history.
- If a new rule has not yet been technically enforced, label it policy-only and do not claim it is automated.

**Current implementation caveat:** GitHub currently reports `main` as unprotected (`protected=false`); the available repository connection cannot read/write the branch-protection administration endpoint (403). Therefore the policy is defined here, but the actual GitHub lock/required-status-check enforcement is NOT YET ACTIVE. Do not claim `main` is protected until a repository administrator configures and verifies it in GitHub Settings. See the master-context next action.



## BOS DIRECTIVE — AUTONOMOUS SAFE EXECUTION & MERGE AUTHORITY (24 November 2026)

**Status: ACTIVE; supersedes older wording that requires BOS approval for every routine change or routine merge.** The objective is to prevent avoidable idle time and PR accumulation while retaining objective safety controls.

1. **Default to action.** AI contributors may independently plan, implement, test, self-review, document, open/update PRs, resolve routine conflicts, and merge routine low/medium-risk changes when all applicable gates pass. Do not ask BOS to approve ordinary engineering decisions, routine feature work, bug fixes, refactors, tests, documentation, free-tool research, or routine merges.
2. **Merge without waiting.** A routine PR may be merged by its responsible AI contributor as soon as it is non-draft, mergeable, based on the latest target branch, its exact current head SHA has all applicable required test/security/integration checks passing, and the diff/self-review show no unresolved material risk. No human approval is required by default for routine low/medium-risk changes. Do not leave a completed safe PR idle merely to wait for BOS or an internal division.
3. **PR-first, not direct-push-first.** Keep PR-based integration and required checks. AI may merge through the normal GitHub PR mechanism; this authority does not mean bypassing required checks or branch rules. Direct pushes to protected branches remain disabled where rulesets enforce that policy.
4. **Main and develop.** AI may merge routine, validated changes into develop. AI may also merge a routine release PR from develop to main after exact-head release checks, compatibility and rollback checks pass. A routine hotfix PR may merge when focused checks and rollback are satisfactory. No separate BOS approval is required merely because the target is main.
5. **Keep safeguards, not permission theater.** Required automated test/security checks, exact-head validation, latest-base compatibility, self-review, secret scanning, relevant integration/database smoke tests, and a documented recovery path remain mandatory. Missing, stale, failed, skipped-required, or inconclusive checks are not passes. Never fabricate a green result or bypass a failed gate to clear the queue.
6. **Escalate only material high-risk actions.** Pause and obtain the appropriate explicit authorization only for: spending money or activating paid services; exposing, rotating, or changing access to production secrets/credentials; changing repository/admin permissions or weakening/disabling security controls; destructive or irreversible production data operations; production database migrations with material data-loss/compatibility risk; enabling production financial execution, live trading, withdrawals, or moving user funds; and other irreversible production actions whose impact cannot be bounded or rolled back safely. Prepare code, tests, documentation and a safe proposal while awaiting that specific authorization; do not idle unrelated work.
7. **Risk-based autonomy.** Low/medium-risk changes are autonomous by default. High-risk changes may proceed autonomously in isolated branches and disposable test environments, but production activation or irreversible execution remains gated as above. If a high-risk code change can be merged safely without activating it and all objective controls pass, document the disabled/proposal-only state and merge only when doing so cannot trigger unsafe production behavior.
8. **PR queue discipline.** The 3-PR WIP limit is a planning limit, not a reason to delay urgent or materially valuable work. Prefer completing/merging safe ready PRs promptly; reuse an existing PR when scope matches. Emergency exceptions remain documented and do not waive safety gates.
9. **No false background-autonomy claims.** This policy grants decision autonomy to an active contributor/runtime; it does not create continuous workers. Claim offline/always-on work only after scheduler, durable queue/state, workers, audit logs, permissions, quotas, kill switch and operational tests are implemented.
10. **Reporting.** Record the action, rationale, risk classification, exact head/merge SHA, test/security evidence, rollback/recovery path, and any remaining blocker in the master context. Clearly separate merged code, deployment, and verified LIVE behavior.

**Conflict resolution:** Any older sentence requiring BOS approval for every routine PR, routine merge, ordinary feature, or low-risk engineering decision is superseded by this section. Existing prohibitions on secrets exposure, paid spend, permission/security weakening, destructive production actions, live financial/trading execution and irreversible production actions remain in force.


## Branch source policy clarification (24 November 2026)

The develop integration lane accepts not only feature/fix/validated experiment branches, but also scoped maintenance branches: docs/*, chore/*, ci/*, security/*, test/*, and refactor/*. These categories are necessary for safe repository governance, documentation, workflow, testing and maintenance changes. The main source restriction remains develop or hotfix/* only. The workflow check is the technical enforcement; this list must stay synchronized with .github/workflows/test.yml.


## Shared AI memory — mandatory for every agent (BOS directive — 25 November 2026)

**One shared memory, no conversation archive.** `RADAR_AI_SHARED_MEMORY.md` is the single compact, cross-agent handoff for ChatGPT, Groq/OpenCode, and every future AI contributor.

1. At the start of every new chat/session/task, read `RADAR_AI_SHARED_MEMORY.md` first, then this file and the relevant sections of `RADAR_AI_MASTER_CONTEXT.md`. Verify live GitHub state, code, PRs, CI and deployment before acting; memory is a handoff, not live telemetry.
2. Store only distilled, durable project context in the shared memory: stable product/architecture facts, decisions and their rationale, approved working preferences, current verified status, blockers, and the next actionable task.
3. **Never store conversations with BOS or any other person, raw transcripts, chat exports, routine prompts/responses, thought/reasoning logs, or message-by-message histories** in the shared memory, master context, README, issues, PR descriptions, commit messages, or other repository files. Do not turn GitHub into a chat archive.
4. Do not copy the same memory into multiple files. The shared memory is the cross-agent handoff; the master context contains durable technical documentation, architecture, decisions, test evidence and change records only—not dialogue.
5. Update memory only when a durable fact changes or a handoff materially changes. Rewrite/summarize stale status in place; do not append every task or conversation. Keep it compact (target under 12 KB). Put detailed technical specifications in a focused design document only when needed.
6. Never store credentials, API keys, tokens, passwords, private personal data, sensitive account information, or unnecessary identifying information.
7. Each AI may use its own private/native memory if the product supports it, but it is optional and never replaces the shared file. All agents must leave the shared memory understandable to a newly joining AI without requiring access to previous chats.
8. If an agent cannot access the shared file or current repository, it must state that limitation honestly and request repository access—not ask BOS to retell the project or paste old conversations.

**Completion standard:** after a meaningful task, update the shared memory with only the durable result and next task; do not paste the conversation or a verbose activity diary.

## Grok-specific startup and autonomous engineering charter (25 November 2026)

- The dedicated Grok/xAI operating charter is `GROK.md`. Every Grok conversation or Grok-powered coding session working on RADAR AI V2 must read `RADAR_AI_SHARED_MEMORY.md`, this `AGENTS.md`, `RADAR_AI_MASTER_CONTEXT.md`, and `GROK.md` at startup, then verify live GitHub/CI/source state.
- Grok must resume the latest valid NEXT TASK, audit risks, research independently, run bounded experiments, implement safe improvements, test, self-review, document durable results, and continue to the next task while its active session/runtime permits.
- Grok must not stop at recommendations when safe implementation is possible, ask BOS to repeat documented context, invent test/deployment results, or claim work continues while the session is inactive.
- Follow all existing branch/PR, exact-head CI, security, documentation, cost, and production-safety policies. Grok does not receive authority to enable paid services, expose secrets, change repository permissions, perform destructive production actions, enable live trading/withdrawals, or replace LIVE without the required BOS authorization.
- This is a repository instruction, not proof that Grok automatically reads GitHub. The Grok client/project must be configured with repository access and a startup instruction to read these files; verify that configuration separately. If Grok cannot access the repository, it must disclose the limitation.
- Grok is xAI's assistant; Groq is a separate inference provider. Do not confuse their access, credentials, or activation controls.


## Equal AI contributor rights — Grok and future agents (BOS directive, 25 November 2026)

- No AI provider or model is restricted merely because it is Grok/xAI, ChatGPT/OpenAI, Groq, or another approved contributor. Grok is a full engineering peer: it may independently research, plan, implement, edit application code and workflows, add tests, fix defects, refactor safely, create branches, commit, push, open/update PRs, review changes, and continue to the next safe task.
- Do not reduce Grok to a read-only researcher, idea generator, or reviewer. Do not require an extra approval solely because Grok authored a change. Apply the same task priority, engineering standards, branch workflow, CI gates, review provenance, and risk classification to every AI contributor.
- Each AI uses its own authorized GitHub connection/token. For the reported 403 on PR creation, the Grok connection needs repository permission **Pull requests: Read and write**. Existing working **Contents: Read and write** access supports code/file pushes. Do not share tokens in chat or copy one agent's credentials into another agent's environment. Only BOS/repository administrators can change token scopes or repository permissions.
- An agent may create/update a PR when its own authorized connection has the required permission. If GitHub returns 403, report the exact missing permission and continue useful work on an isolated branch; do not bypass GitHub authorization or claim the PR was created.
- One writing agent per branch/worktree remains mandatory to prevent concurrent conflicting writes. This is an isolation rule, not an agent-identity restriction. Different agents may work in parallel on separate branches/worktrees and collaborate through PRs, commits, comments, reviews, tests, and documented handoffs.
- All agents may take initiative on safe, reversible engineering and routine integration when the same objective gates pass. Production credentials, admin/repository permission changes, paid spend, destructive production operations, risky production migrations, live trading/withdrawals, and irreversible releases retain their existing BOS approval/security gates.
- This rule grants equal project-level contributor authority; it does not grant GitHub permissions, bypass branch protection, activate a worker, or prove continuous background execution. Actual capabilities depend on each agent's configured tools, token scopes, repository access, and runtime.


## Grok dashboard creative autonomy (BOS directive, effective 26 November 2026)

Grok/xAI is authorized as a creative product and frontend contributor for the RADAR AI V2 main dashboard. Within the same engineering, branch, QA and release controls as every other contributor, Grok may independently propose, prototype, design and implement substantial improvements to dashboard layout, visual hierarchy, color/typography, charts, widgets, AI insight panels, interactions, animation, accessibility, and desktop/mobile UX. It may choose among design alternatives and introduce useful dashboard capabilities without requesting routine BOS approval for each design decision.

This authority is intentionally broad but does not permit removing existing routes, menus, core workflows, features or data contracts; fabricating market data or AI signals; exposing secrets/private data; enabling live trading/withdrawals; adding paid services/assets without approval; weakening security/branch protection/QA; or deploying directly to production. Keep financial actions separate from informational UI and retain read-only/simulation defaults. Respect accessibility, reduced motion, responsive layouts, data provenance/freshness and performance budgets.

Use isolated `exp/*` branches for visual exploration and scoped `feat/*` branches from current `develop` for validated implementation. Preserve one writer per branch/worktree. Document rationale, preserved-feature checklist, responsive/accessibility considerations, screenshots where available, tests, risks and rollback in the PR. Changes still follow PR → CI → develop → release PR → main → Hostless. This is a policy authorization, not a claim that automated enforcement or production deployment has changed.
