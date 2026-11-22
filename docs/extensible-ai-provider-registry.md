# Extensible AI Workspace Provider Registry

Status: implemented on branch `feat/open-ai-provider-registry`; not merged or deployed.

## Decision

The built-in Gemini, Groq, OpenRouter, and OpenAI adapters remain available. The Workspace also discovers additional providers from server-side environment variables, so adding another compatible model does not require editing `lib/ai/workspace.js`.

## Configuration

For each provider, create a unique uppercase ID using these variables:

- `AI_PROVIDER_<ID>_API_KEY` — secret API key.
- `AI_PROVIDER_<ID>_BASE_URL` — public HTTPS API base URL, normally ending in `/v1`.
- `AI_PROVIDER_<ID>_MODEL` — model identifier required by that provider.
- `AI_PROVIDER_<ID>_PROTOCOL` — currently `openai-compatible` (default).
- `AI_PROVIDER_<ID>_ROLE` — optional role instruction, max 500 characters.

Example for DeepSeek:

```dotenv
AI_PROVIDER_DEEPSEEK_API_KEY=<secret-in-Hostless-only>
AI_PROVIDER_DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
AI_PROVIDER_DEEPSEEK_MODEL=deepseek-chat
AI_PROVIDER_DEEPSEEK_PROTOCOL=openai-compatible
AI_PROVIDER_DEEPSEEK_ROLE=Independent strategy and engineering reviewer
```

The provider ID is normalized to lowercase kebab-case (for example, `DEEPSEEK_V2` becomes `deepseek-v2`). Configured providers join all Workspace sessions by default. A session may select participants by normalized provider ID.

## Compatibility and limits

- This extension point supports OpenAI-compatible `POST /chat/completions` APIs. Native protocols (including non-compatible providers) require a dedicated adapter; the registry is designed to add those adapters without changing orchestration.
- Custom endpoints must use HTTPS and cannot use literal loopback/private/link-local IPs, localhost, local/internal hostnames, or embedded URL credentials.
- Only server-side environment variables are read. Keys are never returned in Workspace results.
- Every provider is an untrusted proposal source. Outputs are normalized and are not instructions to other agents.
- Providers can propose work; this change does not grant repository write, merge, deployment, financial, or production permissions.
- There is no artificial fixed provider roster. API quota, request timeout, provider availability, and cost remain practical operational constraints. Configure only services BOS has approved, and use Free-First limits.

## Validation

Tests cover an extra provider joining alongside Gemini, participant selection, and rejection of unsafe endpoint forms. CI and deployment must be checked separately after the branch is pushed. No Hostless deployment is implied by this document.
