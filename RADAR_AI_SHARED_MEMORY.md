# RADAR AI Shared Project Memory

> Compact, curated cross-agent handoff; not a chat archive. Last verified: 28 November 2026.

## Project identity and authority
- Product: RADAR AI V2, repository https://github.com/rohman35819/radar-ai-v2. Umbrella AI/Agent Platform: RADAR NEXUS.
- main is production release truth; develop is integration truth. Use scoped branches and PRs. Verify HEAD, open PRs, CI, deployment and runtime before acting.
- BOS owns the project and is the final authority. Direktur Utama coordinates implementation. Chief Strategy Advisor maintains architecture, priorities and cross-division continuity.
- Do not ask BOS to repeat documented context. Do not claim code, CI, merge, deployment or LIVE behavior without separate evidence.

## Non-negotiable operating rules
- Rp0 hard budget: free-tier only. No paid service, card, overage, paid fallback, or trial that converts to paid.
- Secrets stay server-side. Never commit service-role/model/exchange/GitHub tokens or include them in prompts, logs, browser bundles or memory.
- Live trading and withdrawals OFF. No autonomous financial action. No agent may self-approve, escalate permissions, disable kill switch or alter budget.
- No raw chat transcripts, hidden reasoning, secrets or sensitive personal data in shared memory. Store only distilled, source-backed durable facts and approved decisions.
- Do not claim 24/7/offline autonomy until scheduler, durable queue, worker, permissions, audit, budget, recovery and kill switch are implemented and tested.
- Routine low/medium-risk code work may proceed autonomously when branch, exact-head tests/security, review and rollback gates pass. High-risk production secrets, paid spend, destructive migrations and financial execution remain gated.

## Technical preferences and product priorities
- Prefer Python for quantitative research and TypeScript for platform contracts; retain existing JavaScript app unless migration is justified.
- Quant roadmap: Binance public data first; Bybit removed from dashboard scope. Strategy promotion requires preregistered hypotheses, out-of-sample/walk-forward evidence, costs, risk and independent review. Paper ledger remains gated; live trading OFF.
- RADAR and NEXUS use separate Supabase projects and credentials; communicate through authenticated, versioned APIs, never cross-project direct DB access.
- NEXUS default chat provider is server-pinned OpenRouter Free; no paid fallback. Browser uses publishable key + user JWT only.

## Division ownership
- Divisi 01: Security & Reliability.
- Divisi 03: Risk & Portfolio Controls.
- Divisi 04: Market / Quant Research.
- Divisi 05: QA, Testing & DevOps.
- Divisi 06: Agent Platform & Automation — registry, task admission/queue, orchestrator, worker, scheduler, scoped tools, audit, budget and kill switch.
- Divisi 07: Knowledge & Memory — taxonomy, provenance, curation, approval, retrieval, conflict/supersession, retention and deletion.
- Divisi 08: Executive Office / cross-division coordination.
- Detailed charters: docs/architecture/division-06-agent-platform.md and docs/architecture/division-07-knowledge-memory.md.

## Verified current status — 28 November 2026
- main HEAD at last audit: f38d25a6203ab486d7170369e86874f838af627a. develop HEAD: 313dc358b39b2766340bad797961febee5acbad2. Recheck live before merges.
- NEXUS Supabase project radar-nexus-core (zhvznjcsxrtybqcpbryu), ap-south-1, ACTIVE_HEALTHY on Free.
- NEXUS Edge Functions nexus-chat v4 and nexus-agent-runtime v1 ACTIVE, verify_jwt=true. Ten private nexus.* tables exist with RLS enabled. Conversation/message/task/memory rows were zero at audit; no authenticated provider E2E verified.
- NEXUS chat retrieves approved knowledge_documents using keyword search; it does not yet retrieve memory_records. OPENROUTER_API_KEY presence unverified; missing key returns 503. No model request made in audit.
- nexus-agent-runtime is an active function, not a scheduled worker. No scheduler/continuous worker verified. Its current queue RPC lacks a global pause/kill-switch control row; keep it OFF until D06 adds and tests that gate.
- PR #169 merged NEXUS chat backend/schema into develop as 313dc358. Main dashboard UI PR #172 merged to main as `a6fdbfb`; exact-head CI/security passed. Hostless deployment, public route and authenticated browser E2E remain unverified.
- P1 pure Divisi 06/07 modules and division charters merged to develop as `e841ac38` via PR #173; exact-head npm 248/248, strict TypeScript, Python, disposable PostgreSQL, branch policy, Gitleaks and Trivy passed.
- Supabase Security Advisor warning public.rls_auto_enable() was fixed by revoking EXECUTE from PUBLIC/anon/authenticated; event trigger ensure_rls remains intact. RLS-enabled private nexus.* tables without direct policies are intentional default-deny. Four FK indexes remain a performance follow-up.
- Main release PR #172 is a narrow NEXUS UI release, not a bulk develop merge. No Hostless deployment or browser E2E claimed.

- P2 observation contract candidate is on feat/nexus-observation-contract-p2; Binance-only market-observation.v1 → market-observation-input.v1 → OBSERVE_ONLY shadow pipeline. No production caller or scheduler; exact-head CI/security pending.

- 28 Nov security audit: live nexus-chat v4 still accepted client-selected paid providers (default OpenAI) despite UI sending OpenRouter Free; nexus-agent-runtime v1 allowed knowledge.approve via worker. Branch fix/nexus-free-only-provider-approval-gate pins OpenRouter Free only and removes worker approval. Until deployment verified, live versions remain v4/v1; no paid provider should be used.

## P2 candidate branch feat/nexus-runtime-controls-memory-adapter adds NEXUS default-disabled runtime controls, a claim guard, memory schema adapter and chat v6 scoped retrieval. Migration is not deployed; worker remains OFF.

Immediate next actions
1. Complete exact-head CI/security and deploy NEXUS free-only provider / no-self-approval hardening.
2. Run exact-head CI and disposable PostgreSQL smoke for NEXUS runtime_controls + memory adapter; apply migration only after pass, seed source-backed project memories, then deploy chat v6.
3. Verify Hostless deployment and authenticated browser E2E for the main NEXUS chat UI.
4. Verify OpenRouter Free secret presence without revealing its value; seed only source-backed approved project knowledge.
5. Keep NEXUS worker unscheduled until D06 control row, lease/fencing, budget, audit, pause/kill-switch, restart recovery and Rp0 acceptance tests pass.

- Governance: Grok and future AI agents have equal project-level contributor rights subject to actual permissions; one writer per branch/worktree. Grok has dashboard creative autonomy within preserved-feature/security/QA gates. Rp0/free-only is mandatory until BOS explicitly approves paid spend; see AGENTS.md.

- NEXUS scheduled-worker transport candidate: custom 256-bit token validated against private SHA-256 hash, cron proxy forwards only worker_tick; pg_cron/pg_net + Vault provisioning remains post-merge, no schedule active yet.

- NEXUS SQL worker candidate: cron-only deterministic tick every 5 minutes when pg_cron exists; Stage 0 healthcheck, Stage 1 proposal-only knowledge ingest; no LLM, external calls or approval. Exact-head CI and production activation pending.
