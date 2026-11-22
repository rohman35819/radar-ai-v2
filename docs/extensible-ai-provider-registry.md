# Extensible AI Workspace Provider Registry — Secure Operating Contract

Date: 2026-11-22 (Asia/Jakarta)  
Status: implementation candidate on a feature branch; not merged or deployed  
Budget: Rp0 unless BOS explicitly changes policy

## Goal

Allow additional AI services to join RADAR AI Workspace without hardcoding provider names. The registry discovers provider IDs from server-side environment variables and exposes only safe metadata to the authenticated Command Center.

The first adapter supports OpenAI-compatible chat-completions APIs. Native protocols can join through additional protocol adapters; provider names are not hardcoded into the orchestration layer.

## Configuration

For each provider, use a unique uppercase ID:

- AI_PROVIDER_<ID>_ENABLED=1
- AI_PROVIDER_<ID>_COST_CLASS=free
- AI_PROVIDER_<ID>_API_KEY=<server-side secret>
- AI_PROVIDER_<ID>_BASE_URL=https://vendor.example/v1
- AI_PROVIDER_<ID>_MODEL=<vendor model id>
- AI_PROVIDER_<ID>_PROTOCOL=openai-compatible
- AI_PROVIDER_<ID>_DISPLAY_NAME=Optional display name
- AI_PROVIDER_<ID>_ROLE=Optional role instruction

Custom providers are registered only when:
- ENABLED is exactly 1;
- COST_CLASS is free, or paid with explicit AI_WORKSPACE_ALLOW_PAID=1 after BOS has approved a budget-policy change;
- API key, model and valid HTTPS base URL are present;
- protocol is supported.

Under the current Rp0 policy, keep AI_WORKSPACE_ALLOW_PAID=0. The paid override is a policy gate, not a recommendation to enable paid APIs. Verify free quota, request limits and overage terms before declaring any provider free.

Example (only after verifying the provider's no-cost quota):

```dotenv
AI_PROVIDER_DEEPSEEK_ENABLED=1
AI_PROVIDER_DEEPSEEK_COST_CLASS=free
AI_PROVIDER_DEEPSEEK_API_KEY=<secret-in-Hostless-only>
AI_PROVIDER_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
AI_PROVIDER_DEEPSEEK_MODEL=deepseek-chat
AI_PROVIDER_DEEPSEEK_PROTOCOL=openai-compatible
AI_PROVIDER_DEEPSEEK_DISPLAY_NAME=DeepSeek
AI_PROVIDER_DEEPSEEK_ROLE=Independent strategy and engineering reviewer
```

Never put real API keys in Git, browser storage, UI, chat or logs.

## Participant selection and cost controls

- Existing configured free-tier built-ins remain available.
- Paid built-in OpenAI is excluded unless the explicit paid policy gate is enabled.
- Custom providers are never auto-selected in background/default sessions.
- A custom provider must be explicitly selected in the Command Center for each meeting.
- The server validates participant IDs against its current configured registry; client-supplied arbitrary IDs are rejected.
- The provider-list endpoint requires ADMIN_TOKEN and returns only ID, label, model, role, cost class and default-selection metadata. It never returns API keys.
- The existing round count remains bounded; providers are proposal sources only and receive no GitHub write, merge, deploy, trading or production permissions.

## Network and secret boundaries

- HTTPS only; reject embedded credentials, query strings, fragments, non-443 ports, literal IP addresses, trailing-dot hostnames and local/internal suffixes.
- Fetch uses redirect:error so an upstream cannot redirect a request carrying a Bearer key to another host.
- Provider endpoints are administrator-controlled server configuration, never user-supplied URLs. DNS rebinding/private-address resolution remains a residual risk for untrusted hostnames; configure only vendor domains trusted by BOS. A future multi-tenant endpoint feature would require DNS/IP pinning or a strict hostname allowlist.
- Upstream HTTP bodies and raw network exceptions are not surfaced to Workspace users. Results contain safe error classes/status codes only.
- Outbound context is allowlisted to project facts, bounded market summary, safe source status, dashboard sections and sanitized discussion fields. Arbitrary context keys and raw source error text are not forwarded.
- Common bearer/API-key/JWT patterns are redacted from instructions, summaries and model outputs. Do not send secrets or sensitive account/exchange payloads in meeting instructions.

## Command Center flow

1. BOS enters ADMIN_TOKEN in the Command Center.
2. BOS clicks “Muat provider server”.
3. Server returns configured, policy-eligible providers without secrets.
4. Existing built-ins may be preselected according to default policy; custom providers are unchecked until selected.
5. Server validates the final participant list again before making any provider call.

## Compatibility boundary

The registry is open by provider ID, not by a fixed brand roster. This release supports OpenAI-compatible chat-completions. Providers with native non-compatible APIs require a dedicated adapter implementing the same normalized proposal contract. Unknown protocols are rejected rather than silently sent to an incompatible endpoint.

## Validation required before merge

- No custom provider call occurs in default/background sessions.
- Explicit participant selection allows any configured compatible provider ID.
- Paid/unknown-cost providers are blocked under Rp0.
- Provider metadata endpoint requires ADMIN_TOKEN and never exposes keys.
- Redirects, URL credentials, query/fragment, non-443 ports, IP literals and local hostnames are rejected.
- Redirect responses cannot forward Authorization headers.
- Outbound context is allowlisted and redacted; upstream error text never leaks.
- Regression tests cover built-ins, missing keys, custom selection, cost gates, failure paths and UI/server dynamic provider selection.
- Exact-head CI and independent Divisi 01/04/05 review pass.
- Hostless deployment/live test is a separate gate; do not claim a provider is connected until server environment is configured, redeployed and tested.

## Current state

This branch is not merged or deployed. No provider secret was added to Hostless. No live API call was made. Configured providers are not automatically active in production.
