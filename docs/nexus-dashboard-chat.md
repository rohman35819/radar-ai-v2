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

## Remaining operational truth
- No authenticated end-to-end message was sent during this implementation; provider-secret presence and account-level Auth settings were not inspected.
- The page and navigation are code on this branch only. GitHub merge, Hostless deploy and public LIVE availability are separate gates.
- Chat history listing across sessions, NEXUS CLI, background workers, autonomous division execution and tool permissions are not activated by this client.
- Do not enable paid provider usage, live trading, withdrawals, arbitrary shell execution or production mutations as part of chat activation.
