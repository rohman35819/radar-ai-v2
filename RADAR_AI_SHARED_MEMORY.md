# RADAR AI Shared Project Memory

> **Purpose:** compact, cross-agent project memory. This is a curated handoff, NOT a conversation archive. Every AI agent (ChatGPT, Groq/OpenCode, and future agents) must read this file at the start of a new RADAR task, then verify live repository state before acting.

## Stable project identity
- Product: RADAR AI V2; repository: https://github.com/rohman35819/radar-ai-v2
- Production branch: main; integration branch: develop; task branches go through PRs into develop.
- Website: https://radar-ai-v2.hostless.app/
- Owner salutation: **BOS**.
- Android + Termux is the owner's current OpenCode environment. Never ask BOS to paste API keys, tokens, passwords, or other secrets into chat.

## Working agreement
- Preserve existing features, routes, menus, API contracts, data and workflows.
- Groq/OpenCode has repository-wide autonomous engineering authority under the full safety and delivery rules in AGENTS.md and RADAR_AI_MASTER_CONTEXT.md. It may implement safe work, commit, push and open coherent PRs without a numeric PR quota.
- All AI agents follow the same branch, test, security, review, documentation and production-safety rules. No direct task writes to main.
- Never claim CI, merge, Hostless build or LIVE deployment without checking each separately.
- Explicit BOS approval remains required for paid spend/service activation, production credential/access changes, destructive or materially risky production operations, and live trading/withdrawal/financial execution.
- Do not claim always-on/background autonomy unless scheduler, workers, durable queue/state, permissions, audit, budgets, approval gates and kill switch are implemented and verified.

## Current known handoff (verify before relying)
- Open PR #106: mobile sidebar drawer scrolling fix; browser/device QA was outstanding in the last recorded review.
- Open PR #107: Groq autonomous engineering charter; this shared-memory policy is being added to that PR.
- The above PR states are historical snapshots. Re-check current PR heads, merge state and exact-head checks before acting.
- A previous Groq/Termux run reported node --test test/frontend-ui.test.js 5/5 and git diff --check clean for PR #106; device QA was not claimed complete.
- Production Hostless build/LIVE status must be independently verified; GitHub merge/CI alone is not deployment evidence.

## Active priorities
1. Re-check and complete the open PR queue using exact-head CI/security evidence and required QA.
2. Continue the highest-priority unfinished NEXT TASK from the current master context and actual repository state.
3. Keep this memory current when durable project facts or active priorities change.

## Memory maintenance rules
- **Never save raw chat transcripts, full prompts, or routine conversation logs to GitHub.**
- Save only durable, distilled facts: decisions, architecture/contracts, owner-approved preferences, important blockers, verified project state, and actionable handoff.
- Update this file only when a meaningful durable fact changes; summarize/replace stale status instead of appending every event. Keep it compact (target under 12 KB); move detailed technical history to the master context or focused design/incident documents only when genuinely needed.
- Date and label time-sensitive status; distinguish verified facts from historical/unverified notes. Remove or supersede obsolete items.
- Never store credentials, tokens, private personal data, or sensitive account information.
- Each AI may have its own private/native memory, but it is optional, agent-specific and not the shared source of truth. The shared source for all agents is this concise project memory plus current repository documents/code.
- New chat/session startup: read this file, AGENTS.md, and the relevant master-context sections; inspect current GitHub HEAD/PR/CI and relevant code. Never assume memory snapshots are current.
