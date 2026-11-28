# NEXUS free-provider failover

Status: implementation candidate on `feat/nexus-free-provider-fallback-20261128`; not live until reviewed, merged and deployed.

## Active request order

1. NVIDIA NIM — `google/gemma-4-31b-it` (NVIDIA catalog currently marks its Free Endpoint available).
2. Gemini Developer API — `gemini-3.8-flash` (use only while the Google project remains on its Free tier).
3. OpenRouter — `openrouter/free` (router is restricted to free models; no paid model fallback list is sent).

For each chat request, the server tries the providers in this order. Missing keys are skipped. HTTP quota errors (including 429/402), auth errors, 5xx, timeouts, network errors and invalid/empty responses move to the next configured provider. No provider error body or credential is returned to the browser. The response records the provider/model that actually answered and a sanitized attempt summary.

## Deliberately excluded

- Groq: the currently documented GPT-OSS production model is token-priced. Since runtime cannot verify account tier or enforce a zero-spend cap, `GROQ_API_KEY` is deliberately excluded from this strict Rp0 chain.
- Mistral: official API quickstart says payment activation is required to use API keys; therefore `MISTRAL_API_KEY` is not read by this Rp0 chain.
- Cloudflare Workers AI: its free allocation is 10,000 Neurons/day on Workers Free, but overage behavior depends on whether the account is on Workers Free or Workers Paid. Keep excluded until BOS verifies the account is on the Free plan and over-quota requests fail closed.
- No xAI Grok endpoint is configured; Groq is a different provider.

## Cost guardrails

- This code selects free-tier models only and never requests a paid model.
- Free-tier use is not an absolute zero-cost guarantee if an account is upgraded or billing is enabled. Keep Google AI Studio on Free, Groq on Free, NVIDIA on the Free Endpoint allowance, and do not enable provider billing or upgrades.
- OpenRouter requests use only `openrouter/free`; never add paid models to a fallback array.
- A quota exhaustion or outage results in failover. If all free providers fail, NEXUS returns an explicit unavailable response and does not fabricate an answer or fall back to paid inference.
- Keys remain server-side Supabase Edge Function Secrets.

## Verification still required

- Unit tests use mocked provider responses and do not prove the BOS secrets are valid.
- After merge/deploy, perform one authenticated NEXUS chat. Confirm returned `provider` and `model`, then verify quota failure on a test-only provider path without intentionally burning real provider quota.
- Confirm the actual Google/Groq/NVIDIA account tiers in their consoles before live use. Never paste secrets into chat, logs, or Git.
