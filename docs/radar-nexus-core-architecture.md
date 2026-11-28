# RADAR NEXUS — CORE ARCHITECTURE & BUILD PLAN

**Decision date:** 27 November 2026. **Status:** approved target architecture; implementation is staged and not yet an active unified AI runtime.

## Product definition
RADAR NEXUS is the personal AI system owned by RADAR AI V2. The objective is to build a durable, expert-assisted intelligence system that can reason, use tools, learn from validated outcomes and eventually operate bounded tasks without BOS being online. DeepSeek-class capability is an aspiration to be measured, not a current parity claim.

NEXUS is not a thin wrapper around one external model. External models (including DeepSeek/Grok and future free/open-weight models) may act as teacher, critic or specialist engine. NEXUS owns the policy, memory, task state, tool permissions, evaluation and final verification.

## Component map
- NEXUS Core: identity, policy, request lifecycle and capability boundaries.
- NEXUS Reasoning: plan/decompose, retrieve evidence, use tools, compare hypotheses, critique and verify.
- NEXUS Memory: approved durable knowledge, decisions, task outcomes and skills with provenance (Divisi 07).
- NEXUS Orchestrator: agent/task routing, queue, scheduling and execution lifecycle (Divisi 06).
- NEXUS Agents: specialist roles (quant, coding, security, data, QA) operating within scoped permissions.
- NEXUS Model Engine: provider/model adapters, teacher/critic roles, fallback and model evaluation (Divisi 04).
- NEXUS Learning & Evaluation: feedback capture, benchmark suite, regression evaluation and reviewed knowledge/skill promotion (Divisi 04/05/07).

These names describe intended boundaries; they do not assert deployed components.

## Request lifecycle
1. Intake and classify request, risk and required evidence.
2. Policy gate: identity, scope, sensitivity, budget and permitted actions.
3. Retrieve approved context with provenance and freshness.
4. Plan bounded steps and acceptance criteria.
5. Select model/agent and tools from allowlists.
6. Execute in isolated workspace; record artifacts and audit events.
7. Verify outputs with deterministic tests, source checks and independent critic.
8. Promote only reviewed knowledge/skills; retain source lineage.
9. Return result, limitations, cost and next task.

## Expert contribution model
External model response → source/provenance capture → independent critique → deterministic test or evidence check → domain review → approved knowledge/skill/evaluation record. No automatic adoption of model output and no automatic training on raw chats.

## Capability benchmark
Baseline and repeat after each material change:
- Repository understanding and multi-file change accuracy.
- Python/TypeScript coding and test pass rate.
- Quant research reproducibility, leakage controls and report verification.
- Security review precision and missed-finding rate.
- Data analysis correctness and provenance.
- Tool execution success, permission-denial correctness and recovery.
- Long-context continuity and retrieval precision.
Track correctness, exact-head tests, regression rate, factual grounding, citation/provenance completeness, tool success, latency and Rp0 cost. Compare models on the same frozen cases. Never claim parity without results.

## Roadmap
N0 Foundation: contracts, capability matrix, threat model, taxonomy and frozen benchmark.
N1 Expert-assisted knowledge: approved model adapters and curated source-backed knowledge.
N2 Reliable reasoning: planner, retrieval, tool gateway, critic/verifier and regression suite.
N3 Specialist agents: quant/coding/security/data/QA with isolation and review.
N4 Persistent bounded autonomy: queue, scheduler, workers, memory, audit, budgets, approvals, kill switch and recovery; remains OFF until explicitly gated.
N5 Model ownership research: open-weight fine-tuning/distillation only after licensing, compute, privacy, benchmark and explicit BOS approval.

## Current safety/cost baseline
Strict Rp0. No paid model/API/resource activation. No new cloud service or database provisioning. Workers/scheduler remain OFF. Live trading, exchange orders and withdrawals remain OFF. Reuse existing PostgreSQL and GitHub Actions only after checking current contracts and free limits. GitHub docs are versioned policy, not runtime persistence.

## Division ownership
- 01 Security & Reliability: threat model, identity, secret boundaries, data protection.
- 04 AI Intelligence & Research: model/provider adapters, reasoning quality and model benchmarks.
- 05 QA/Testing/DevOps: independent test, regression, release and recovery gates.
- 06 Agent Platform & Automation: registry, queue, orchestration, runtime, tools, scheduler.
- 07 Knowledge & Memory: schemas, provenance, curation, retrieval, lifecycle and learning records.
- Executive Office: prioritization and conflict resolution; BOS owns reserved approvals.

## NEXT TASK
Divisi 06/07 begin N0 artifacts in parallel without touching the same files. Divisi 04/05 define frozen baseline benchmark. Divisi 01 reviews threat model. First implementation candidate is contract/schema tests against existing code and migrations, not worker activation.

---

## Implemented boundary — NEXUS CLI client

Status: **active for the CLI client delivered here**; NEXUS Core refers to the existing RADAR AI server and its AI API, not a new backend. No proprietary model, worker, scheduler, or second memory service is implemented by this document.

## One brain, two clients

- Dashboard NEXUS Chat (issue #162) and NEXUS CLI (issue #163) are clients of the same HTTP contract on the existing Node server.
- Chat uses `POST /api/ai/command` with `x-admin-token`; results are read through `GET /api/ai/workspace`. Provider status comes from `GET /api/ai/usage`; server health from `GET /api/health`.
- The CLI never starts its own model engine, reasoning loop, or vector/knowledge store. Provider keys stay server-side; the CLI receives only a token from the environment and never prints it.

## CLI layers

1. `src/nexus/cli.mjs` — interactive terminal REPL, identity, command help, session resume, Termux-friendly output.
2. `src/nexus/client.mts` and `contracts.mts` — typed shared API contract, validation, sanitization, honest `unavailable`/`not_configured` states.
3. `src/nexus/repo.mjs` — bounded read-only repository navigation: list, read, search, structure; rejects traversal and secret-like files.
4. `src/nexus/session.mjs` — local sessions in `~/.radar-nexus/sessions.json`, redacted, bounded, outside Git.
5. `src/nexus/policy.mjs` — capability gateway: read-only default; edits and commands require explicit approval; allowlisted commands only; sanitized audit events.

## Safety

Default read-only. `/edit` shows a reviewable diff and needs `y/N`. `/run` accepts only `npm test`, `npm run typecheck`, `python3 -m unittest`, `git status`, `git diff`, `git log -1`; arbitrary shell, secret access, deploy, exchange orders, withdrawal, live trading, paper ledger, worker, and scheduler remain disabled. No paid provider is called by the CLI; if no provider is configured, the CLI says so instead of inventing a reply.

## Not implemented here

NEXUS Chat dashboard UI, durable shared conversation memory beyond the existing AI Workspace summary, a proprietary RADAR model, autonomous workers, and paper-ledger reconciliation. Those remain separate, gated tasks.
