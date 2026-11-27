# RADAR NEXUS Core — implemented boundary

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
