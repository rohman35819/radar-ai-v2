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
- PR #169 merged NEXUS chat backend/schema into develop as 313dc358. Main dashboard UI release is tracked separately in PR #172; exact-head CI/security, Hostless deployment and browser E2E must be checked before calling it LIVE.
- P1 pure Divisi 06/07 modules passed exact-head tests/security on old head 959ff80, but that branch was 24 commits behind develop. Replacement work is on feat/agent-platform-divisions-06-07; PR #173 will carry updated code plus division charters.
- Supabase Security Advisor warning public.rls_auto_enable() was fixed by revoking EXECUTE from PUBLIC/anon/authenticated; event trigger ensure_rls remains intact. RLS-enabled private nexus.* tables without direct policies are intentional default-deny. Four FK indexes remain a performance follow-up.
- Main release PR #172 is a narrow NEXUS UI release, not a bulk develop merge. No Hostless deployment or browser E2E claimed.

## Immediate next actions
1. Complete exact-head CI/security and merge the replacement Divisi 06/07 P1 PR into develop.
2. Complete P2: observation/provenance freshness contract, NEXUS memory schema adapter, and default-paused/kill-switch runtime controls with disposable PostgreSQL tests.
3. Complete PR #172 CI/security; release isolated NEXUS chat UI only after gates, then verify Hostless and authenticated browser E2E.
4. Verify OpenRouter Free secret presence without revealing its value; seed only source-backed approved project knowledge.
5. Keep NEXUS worker unscheduled until D06 control row, lease/fencing, budget, audit, pause/kill-switch, restart recovery and Rp0 acceptance tests pass.
