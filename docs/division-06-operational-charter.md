# Divisi 06 — Agent Platform & Automation (Operational Charter)

**Status:** proposed operational split under NEXUS; no scheduler/worker/queue runtime is active. Owner: BOS · Lead: Direktur Utama · Engineering lead: Grok. Rp0 only.

## Mandate

Turn validated observe-only components into a durable, least-privilege automation platform that can run bounded tasks when BOS is offline — without granting agents permission to expand their own scope, merge, deploy, trade or move funds.

## Responsibilities

- Agent orchestration, task scheduler, durable queue, worker lifecycle/recovery.
- Permission scope, approval gateway, budget/quota enforcement.
- Audit events, kill switch, recovery drills, observability of queue depth/age/retries.
- Integration with Divisi 07 knowledge contracts and Divisi 04 research contracts.

## Inputs / outputs

- **Input:** versioned `agent-task-envelope.v1` (see `docs/agent-platform-integration-contract-v1.md`), market observations from internal gateway, policy limits from BOS.
- **Output:** `agent-observe-result.v1`, append-only audit events, rejection codes, queue metrics. No order/fill/ledger output in phase 1.
- **Contracts:** Divisi 04 supplies validated research input; Divisi 07 supplies provenance/knowledge schema; Divisi 01 defines security gates; Divisi 05 validates tests.

## AI/agent needs

One service identity per worker role, least privilege; no human token; no exchange key; no admin role. Worker cannot change its permissions, budgets, allowlist, kill switch or approval state.

## KPIs

- % tasks completed with acceptance criteria and evidence; duplicate-effect count = 0; stuck-task count; retry/timeout/dead-letter rate; lease recovery success; audit completeness; budget breaches = 0; unauthorized action attempts = 0.

## Risks

Restart duplication, lease fencing bugs, queue unboundedness, permission creep, paid-quota overage, false autonomy claims. Controls: transactional claim, idempotency key, fail-closed policy, Rp0 caps, kill switch, disposable recovery tests.

## Roadmap (gates, not dates)

- **N0:** contracts + threat model + durable schema review (current).
- **N1:** disposable migration + lease/claim/retry/idempotency tests.
- **N2:** in-process worker prototype, no scheduler, observe-only tasks.
- **N3:** restart/recovery drill, audit persistence, kill-switch propagation.
- **N4:** bounded read-only research scheduling after BOS approval.
- **N5:** any execution capability only after separate live-readiness gate.

Current state: N0 design only. Worker, scheduler, queue runtime and kill-switch runtime are OFF/unimplemented.

## Human ownership and RACI

**Manusia/penanggung jawab:** BOS (approval risk boundaries), Direktur Utama (koordinasi), serta Divisi 01/05 reviewer yang **belum ditunjuk**. Tidak ada identitas manusia yang direkayasa; penunjukan menjadi keputusan BOS/Direktur Utama. Agent/AI hanya `Responsible` untuk implementasi dan test, tidak pernah `Accountable` untuk approval/permission/kill-switch release.

| Aktivitas | BOS/Direktur | Divisi 01 | Divisi 04 | Divisi 05 | Divisi 06 | Divisi 07 |
|---|---|---|---|---|---|---|
| Contract & threat model N0 | A | C | C | C | R | C |
| Durable schema + lease tests | I | C | I | C | R | C |
| Observe-only task runtime | A (activate) | C | C | C | R | I |
| Security review / permission gate | A | R | I | C | C | I |
| Independent QA / release gate | I | C | C | R | C | C |
| Knowledge/task provenance | I | C | C | C | C | R |
| Kill-switch activation | A | R | I | I | R | I |
| Strategy promotion to paper | A | C | R | C | I | C |

Aturan: agent tidak dapat menaikkan permission, budget, allowlist, atau autonomy stage sendiri; `A` pada keputusan berisiko selalu manusia.
