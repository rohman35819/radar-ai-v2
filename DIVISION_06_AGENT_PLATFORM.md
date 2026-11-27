# DIVISION 06 — AGENT PLATFORM & AUTOMATION

**Status:** Charter and staged architecture proposal; not an active autonomous runtime.  
**Owner:** Executive Office / Chief AI Officer. **Lead domain:** Agent Platform.  
**Language:** TypeScript for contracts, orchestration and control plane; Python for bounded research workers.

## Mission
Build the controlled execution platform that lets RADAR AI NEXUS accept, schedule, route, execute, verify and audit bounded tasks. It must not depend on an open ChatGPT/Grok/Termux session and must never imply offline operation until a deployed runtime is tested.

## Responsibilities
1. Agent registry: immutable agent ID, division, role, versioned instructions/skills, status and capability declarations.
2. Task control plane: typed task envelope, priority, dependencies, deadlines, idempotency key, retry policy, lease and state transitions.
3. Orchestration: classify and route work, build dependency DAGs, assign least-privilege agents, collect artifacts and escalate blockers.
4. Runtime adapters: isolated execution environments, resource/time limits, cancellation and process supervision.
5. Tool gateway: allowlisted tools, scoped credentials injected server-side, explicit action policy and approval checks.
6. Review pipeline: deterministic tests, independent QA/security gates, artifact provenance and merge eligibility.
7. Operations: scheduler, queue health, dead-letter handling, pause/resume, kill switch, recovery and observability.
8. Cost controls: hard Rp0 policy, quotas, concurrency and circuit breakers; no paid model/API activation.

## Out of scope
- Knowledge curation, canonical memory and retrieval policy (Divisi 07 owns these).
- Model quality/provider research (Divisi 04 owns these).
- Independent acceptance/release sign-off (Divisi 05).
- Security policy and threat approval (Divisi 01).
- Live exchange orders, withdrawals, financial execution or self-granted permissions.

## Authority and default-deny matrix
| Capability | Default | Gate |
|---|---|---|
| Read public data/repository | Allow by task scope | Audit |
| Draft docs/tests/isolated patch | Allow in isolated branch | Tests + review |
| Read private project data | Deny unless scoped | Divisi 01 + owner policy |
| Read secrets | Never expose to agent context | Server-side scoped injection only |
| Merge/deploy/change permissions | Deny | Required independent gates + explicit approval where policy says |
| Production migration/delete | Deny | BOS approval + rollback plan |
| Exchange order/withdrawal/fund movement | Deny | Not in this charter; separate future authorization |
| Paid provider/resource | Deny | Explicit BOS approval; Rp0 currently |

## Staged roadmap and acceptance criteria
### D06-N0 — Contracts and threat model
Deliver agent/task/tool contracts, state machine, capability matrix, threat model, sequence diagrams and failure semantics.
Accept when schemas are versioned; invalid transitions, oversized payloads, unknown tools and missing idempotency fail closed; Divisi 01/05 review.

### D06-N1 — Read-only registry and admission
Deliver registry and policy evaluation using existing DB/migrations where suitable. No worker execution.
Accept when role/capability checks are deterministic, disabled agents cannot be assigned, audit attribution is mandatory, and tests cover denial cases.

### D06-N2 — Durable queue adapter (non-production)
Only after existing schema and PostgreSQL smoke gates are accepted. Implement transactional claim/lease fencing, idempotency, retry/dead-letter, dependency validation, atomic task+audit writes and restart recovery.
Accept with disposable PostgreSQL concurrency/restart tests; no production activation or new paid storage.

### D06-N3 — Single constrained worker pilot
One non-financial, read-only worker in an isolated workspace. Worker OFF until BOS separately approves pilot activation after QA/security and zero-cost verification.
Accept with bounded CPU/time/output, cancellation, duplicate-delivery test, audit trace, kill-switch test and recovery evidence.

### D06-N4 — Controlled patch workflow
Worker may open branch/PR only; no self-merge or deploy. Independent Divisi 05 QA and Divisi 01 security gates.
Accept with branch isolation, secret scanning, exact-head CI and rollback evidence.

### D06-N5 — Offline operation
Scheduler + durable queue/state + worker runtime + permission gateway + monitoring + budget + approval queue + kill switch + recovery all deployed and tested. Only then may product claim background operation.

## KPIs
Task success against acceptance criteria; duplicate execution rate; stuck/expired leases; retry and dead-letter rate; mean recovery time; unauthorized action count (target zero); audit completeness (100%); test/QA rejection rate; cost per task (Rp0); worker availability only after deployment evidence.

## First backlog
- D06-001: audit existing queue migrations and PR #149/#153/#160; identify reusable contracts and unresolved gates.
- D06-002: publish TypeScript task/agent/tool contract and transition table.
- D06-003: threat model + permission tests with Divisi 01.
- D06-004: disposable PostgreSQL queue/lease/idempotency/recovery tests with Divisi 05.
- D06-005: runtime feasibility matrix (GitHub Actions vs Hostless vs existing cloud) using verified free-tier terms; no provisioning.
- D06-006: propose one read-only pilot only after D06-N0..N2 acceptance.

## Handoff format
Every task includes ID, objective, scope, acceptance criteria, risk class, allowed tools, budget/time cap, artifacts, tests, provenance, reviewer, rollback and stop conditions. A worker may not change its own policy or widen its scope.
