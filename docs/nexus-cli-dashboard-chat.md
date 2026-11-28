# NEXUS CLI + Dashboard Chat — Implementation Contract

Date: 2026-11-27 (Asia/Jakarta)
Status: approved direction; implementation is staged and not yet live.

## BOS decision
Provide two equivalent chat surfaces for the same NEXUS identity and conversation store:
1. NEXUS CLI for Termux, with an interactive terminal experience inspired by OpenCode.
2. NEXUS Chat embedded in the primary RADAR AI V2 dashboard view.

Both surfaces must call the existing authenticated NEXUS chat backend and share conversation IDs/history in the NEXUS Supabase project. Do not create a second memory store.

## Architecture
- Dashboard: embedded NEXUS panel in the main overview shell; responsive mobile-first layout; conversation list, message history, composer, send/loading/error states.
- CLI: Node.js >=20, zero or minimal dependencies, install/run from Termux; interactive REPL, commands for help/new/history/use/exit, streaming only if backend contract supports it; secure token entry via hidden prompt or environment variable; never persist provider API keys.
- API: existing `nexus-chat` Edge Function, JWT protected. Inspect its actual request/response contract before client implementation. Do not assume it is reachable from RADAR's Hostless server or bypass Supabase Auth.
- Identity: both clients authenticate as the same Supabase user. Use Supabase Auth session/JWT; never embed service_role or provider keys in either client.
- Memory: conversations/messages remain in NEXUS schema. Conversation IDs are portable between CLI and dashboard.
- Provider: server-side only; missing provider secrets/config must produce a clear unavailable response, not a fake AI reply.

## Security and autonomy boundaries
- No shell execution, arbitrary tool execution, filesystem access, Git writes, or code modification in the initial CLI/chat milestone.
- No workers, schedulers, autonomous divisions, trading, exchange order placement, withdrawals, or production mutation.
- Read-only RADAR context only after an explicit allowlist and authorization check.
- Rate limits, request size limits, JWT verification, ownership checks for conversation IDs, and audit events are required.
- Do not expose provider errors, secrets, JWTs, or internal stack traces to the UI.

## Delivery milestones
### M0 — Contract and integration audit
- Read actual `nexus-chat` source and dashboard auth/session model.
- Verify deployed function configuration and request/response shape without exposing secrets.
- Identify whether browser and CLI can use the same Supabase Auth flow.
Acceptance: documented API contract, auth flow, ownership rules, missing prerequisites.

### M1 — Dashboard shell
- Add a NEXUS chat panel to the main dashboard overview.
- Preserve all existing cards, routes, menus, and dashboard interactions.
- Provide explicit states: not signed in, backend unavailable, provider not configured, empty conversation, loading, error.
Acceptance: responsive UI, accessible labels, no fake responses, frontend regression tests.

### M2 — NEXUS CLI
- Add a separate `nexus` CLI package/folder and npm script/bin entry.
- Support `nexus login` (Supabase Auth), `nexus chat`, `nexus history`, `nexus use <conversation-id>`, `nexus logout`, `nexus --help`.
- Store only refresh/session tokens in OS-appropriate private storage with restrictive permissions; if secure storage is unavailable in Termux, require session token through environment or re-login rather than plaintext persistence.
- Never store provider keys.
Acceptance: install/run instructions for Termux, auth, send/receive, shared conversation continuation, logout/token clearing tests.

### M3 — Shared conversation verification
- Send message from CLI and continue same conversation in dashboard; reverse direction too.
Acceptance: E2E test evidence using a test user/project, ownership isolation, no secret leakage.

### M4 — Optional safe context tools
- Add read-only RADAR context through an allowlisted API and per-user authorization.
- No command execution or mutations without a separate BOS approval and security review.

## Current verified baseline / caveat
- RADAR dashboard main page is `public/index.html` + `public/app.js`; primary overview renders inside `#view`.
- Existing dashboard uses vanilla JS and no npm runtime dependencies; Node >=20.
- NEXUS Supabase project previously verified ACTIVE_HEALTHY; `nexus-chat` Edge Function was listed ACTIVE with `verify_jwt=true`. This does not prove HTTP/E2E conversation works.
- The deployed `nexus-chat` contract accepts `{ message, provider, conversation_id? }` and returns `{ conversation_id, provider, answer, knowledge_items_used }`. The dashboard now reads the canonical `answer` field first; a regression test covers this response contract and checks that no privileged/provider secrets are embedded in the browser. Provider key presence, frontend Supabase Auth integration, and cross-client E2E remain unverified.
- Do not claim the CLI or dashboard chat is operational until M3 passes.

## Next action
Inspect `nexus-chat` function source, Supabase Auth setup, and current dashboard code; then implement M1 in this branch without touching production or enabling paid services.
