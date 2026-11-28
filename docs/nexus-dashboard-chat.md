# NEXUS Chat — Dashboard Integration

Date: 2026-11-28 (Asia/Jakarta)
Status: implementation branch; not deployed or end-to-end verified.

## Verified backend contract
- NEXUS Supabase project `radar-nexus-core` is ACTIVE_HEALTHY on the Free plan.
- Edge Functions `nexus-chat` and `nexus-agent-runtime` are ACTIVE with `verify_jwt=true`.
- `nexus-chat` accepts POST JSON `{ message, provider, conversation_id? }` and returns `{ conversation_id, provider, answer, knowledge_items_used }`.
- `nexus-chat` verifies the bearer session with Supabase Auth, scopes conversation lookup to `owner_subject`, persists messages, retrieves approved shared knowledge and invokes the selected server-side provider. Missing provider configuration returns an explicit 503; it must not be represented as a successful AI answer.
- Database introspection found the NEXUS schema tables for conversations, messages, memory, knowledge, agents, tasks, dependencies, evaluations and audit events. Supabase migration history currently lists three NEXUS migrations.

## Client implementation
- `public/nexus.html` provides email/password signup/login/logout and authenticated chat.
- Public publishable/anon key is entered by the user; service-role and provider secrets are never embedded in the browser.
- The client reads the canonical `answer` response field and preserves `conversation_id` for subsequent turns.
- Regression tests cover response-field compatibility, JWT use, absence of privileged secrets and fail-closed response handling.

## Production backend activation — 28 November 2026
- Applied Supabase migration `20261128002708 / nexus_chat_storage_rpc_v1` to the NEXUS project. It adds two narrowly scoped SECURITY DEFINER RPCs with fixed search_path; EXECUTE is granted only to `service_role`, explicitly revoked from PUBLIC/anon/authenticated. The `nexus` schema remains private and no direct table grants were added.
- Deployed `nexus-chat` Edge Function version 2 with `verify_jwt=true`. It now uses `nexus_prepare_chat` and `nexus_complete_chat` RPCs for owner-scoped, transactional message persistence rather than direct PostgREST access to private tables.
- Disposable-in-transaction smoke test on the live project passed as `service_role`: create conversation, append user message, append assistant message, reject a different owner, and verify anon/authenticated cannot execute the RPCs. Transaction rolled back; live conversation/message counts remain zero.


- Repository source of truth now includes the private foundation, learning/knowledge RPCs, bounded agent queue RPCs and chat storage RPC migration files plus disposable PostgreSQL smoke tests. The test workflow applies these four migrations and runs their smoke tests in order. This CI path is configured but has not yet produced an exact-head run in GitHub Actions.

## Remaining operational truth
- No authenticated end-to-end message was sent during this implementation; provider-secret presence and account-level Auth settings were not inspected.
- The page and navigation are code on this branch only. GitHub merge, Hostless deploy and public LIVE availability are separate gates.
- Chat history listing across sessions, NEXUS CLI, background workers, autonomous division execution and tool permissions are not activated by this client.
- Do not enable paid provider usage, live trading, withdrawals, arbitrary shell execution or production mutations as part of chat activation.

## Cross-session history activation — 28 November 2026
- Added private-schema RPCs `nexus_list_conversations` and `nexus_list_messages`, both SECURITY DEFINER with fixed search_path and EXECUTE only for service_role. They enforce owner scope and bounded result limits.
- Applied `nexus_chat_history_rpc_v1` and deployed `nexus-chat` Edge Function v3 (`verify_jwt=true`). API actions now include `list_conversations` and `history` in addition to authenticated chat.
- Dashboard client now lists recent conversations, restores the selected conversation ID from sessionStorage, loads prior messages after login/reload, and supports starting a new conversation. The server remains canonical; sessionStorage contains only the selected conversation ID and public key, never message content or provider secrets.
- Live SQL smoke passed conversation list, history retrieval, wrong-owner rejection and role privilege denial; transaction rolled back and live conversation/message counts remain zero. Migration apply was invoked twice; Supabase records two version rows with the same migration name, but CREATE OR REPLACE is idempotent and verified schema/function state is correct. Do not delete migration history rows.
