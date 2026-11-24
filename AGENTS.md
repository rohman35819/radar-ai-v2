# Instructions for AI contributors

Before doing any work in this repository, read `RADAR_AI_MASTER_CONTEXT.md` completely.

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
