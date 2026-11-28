# NEXUS free-provider failover

Status: backend failover merged to `develop` in PR #181 and deployed as `nexus-chat` v19. This branch narrows the active provider allowlist to providers that can be used under the strict Rp0 policy without relying on an unverified billing tier; redeployment is pending.

## Active request order

1. NVIDIA NIM — `google/gemma-4-31b-it` (NVIDIA catalog currently marks its Free Endpoint available).
2. Gemini Developer API — `gemini-3.8-flash` (use only while the Google project remains on its Free tier).
4. OpenRouter — `openrouter/free` (router is restricted to free models; no paid model fallback list is sent).

For each chat request, the server tries the providers in this order. Missing keys are skipped. HTTP quota errors (including 429/402), auth errors, 5xx, timeouts, network errors and invalid/empty responses move to the next configured provider. No provider error body or credential is returned to the browser. The response records the provider/model that actually answered and a sanitized attempt summary.

## Deliberately excluded

- GroqCloud: excluded from the active chain until the account's Free plan and fail-closed over-quota behavior can be verified independently. The function cannot inspect account billing tier; presence of `GROQ_API_KEY` is not proof of free eligibility. `GROQ_API_KEY` is deliberately ignored.

- Mistral: official API quickstart says payment activation is required to use API keys; therefore `MISTRAL_API_KEY` is not read by this Rp0 chain.
- Cloudflare Workers AI: its free allocation is 10,000 Neurons/day on Workers Free, but overage behavior depends on whether the account is on Workers Free or Workers Paid. Keep excluded until BOS verifies the account is on the Free plan and over-quota requests fail closed.
- No xAI Grok endpoint is configured; Groq is a different provider.

## Cost guardrails

- This code selects free-tier models only and never requests a paid model.
- Free-tier use is not an absolute zero-cost guarantee if an account is upgraded or billing is enabled. Keep Google AI Studio on Free, NVIDIA on the Free Endpoint allowance, and do not enable provider billing or upgrades. Groq remains excluded until independently verified.
- OpenRouter requests use only `openrouter/free`; never add paid models to a fallback array.
- A quota exhaustion or outage results in failover. If all free providers fail, NEXUS returns an explicit unavailable response and does not fabricate an answer or fall back to paid inference.
- Keys remain server-side Supabase Edge Function Secrets.

## Verification still required

- Unit tests use mocked provider responses and do not prove the BOS secrets are valid.
- After merge/deploy, perform one authenticated NEXUS chat. Confirm returned `provider` and `model`, then verify quota failure on a test-only provider path without intentionally burning real provider quota.
- Confirm the actual Google and NVIDIA account tiers in their consoles before live use. Groq requires a separate review before re-enablement. Never paste secrets into chat, logs, or Git.
