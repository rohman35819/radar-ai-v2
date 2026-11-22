# Division 08 — Procurement Audit (Rp0)

Date: 2026-11-22 (Asia/Jakarta)
Repository: https://github.com/rohman35819/radar-ai-v2
Base branch: main
Audit base HEAD: 5a8a5b9e0bd74f776da6a59279dd71c4be9d8c9b
Scope: P0 repository/CI/Hostless evidence audit; candidate review for requested tools.
Status: Research and repository audit only. No external accounts/resources created. No production integration claimed.

## Executive decision

- Keep the existing Hostless application as-is. Hostless plan, account usage, remaining free quota, overage controls, database/worker entitlements, deployment SHA, and live health could not be inspected from the available connection. Do not provision resources until BOS verifies these in the Hostless dashboard.
- Reuse the existing public GitHub repository and GitHub Actions workflow first. Current CI is already running and successful on recent main pushes.
- PR #18 (feat/agent-platform-foundation) contains the proposed PostgreSQL schema, architecture, free-first policy, and PostgreSQL smoke test. It remains open and is not in main. Its PR workflow succeeded, but merge status is not equivalent to production deployment.
- Neon is the leading disposable PostgreSQL test candidate; it is not approved as production database or always-on queue. Existing Agent Platform design explicitly says no production provisioning before quota/overage checks.
- Redis/Upstash is deferred: PostgreSQL is sufficient for the first queue pilot and another service adds cost/operational complexity.
- No Cloudflare, Neon, UptimeRobot, AI Studio, Hugging Face, Sentry, or Upstash resource was created. No API keys were requested or handled.

## P0 — verified repository and existing facilities

- Repository is public; default branch is main; current permission through GitHub connector includes read/write.
- AGENTS.md, RADAR_AI_MASTER_CONTEXT.md, and DIVISION_08_PROCUREMENT_TOOLS.md were read from main.
- Main HEAD at audit time: 5a8a5b9e0bd74f776da6a59279dd71c4be9d8c9b.
- Main has .github/workflows/test.yml; it runs npm test on pull requests and pushes to main/feature branches.
- Recent main push workflow runs returned completed/success for the latest documentation commits.
- package.json: Node >=20, no runtime npm dependencies, npm test includes syntax checks and node --test test/*.test.js.
- server.js: Node HTTP server; existing GET /api/health, GET /api/snapshot, AI routes; rate limiting and server-side token checks.
- lib/ingest.js: state persists as DATA_DIR/state.json via temp file + rename. This is not a distributed queue and requires a writable persistent mount.
- .env.example: existing provider settings include Gemini, Groq, OpenRouter, OpenAI, CoinGecko Demo, Telegram, Binance/Bybit. No third-party database connection string is present on main.
- Root tree on main does not contain the db/ migration directory; those files exist in PR #18 only.
- Open PR #18 includes db/migrations/001_agent_platform.sql, a PostgreSQL smoke test, architecture docs, free-first policy and a schema test. PR #18 is still open. Do not assume it has been merged or deployed.
- Hostless live URL could not be fetched through the available inspection route; no Hostless administration connector is available in this session. Plan, quota, overage settings, deployment and runtime remain UNKNOWN.

## P1 — requested service candidates

| Tool | Free status and limits checked | Risk / decision | Owner |
|---|---|---|---|
| Neon — https://neon.com/ | Free plan: 100 projects, 100 CU-hours/project/month, 1 GB storage/project (up to 20 GB account total); 10 branches/project; compute scales to zero. | Candidate for disposable PostgreSQL migration/CI testing only. Usage/bandwidth and paid-plan pricing create risk if plan is changed. No production connection until account/overage verified. | Div 06 + Div 05 |
| Cloudflare — https://cloudflare.com/ | Workers Free: 100,000 requests/day, 10 ms CPU/request, 128 MB memory; 5 cron triggers/account per current limits. Queues Free: 10,000 operations/day, 24-hour retention. | Suitable for lightweight stateless webhook/cron trigger or small queue pilot; not a long-running Node worker. Avoid billing upgrade and check plan-specific quotas before creating resources. | Div 06 + Div 01 |
| UptimeRobot — https://uptimerobot.com/ | Free: 50 monitors, 5-minute checks, basic status page, no credit card; core HTTP/keyword/ping/port monitors. | Strong monitoring candidate for public app/API. Notification seats/integrations are limited. | Div 05 |
| Google AI Studio — https://aistudio.google.com/ | Gemini API has a free tier with limited model access and free input/output tokens; rate limits vary by model/project. Free-tier content may be used to improve Google products. | Candidate for non-sensitive experimentation only. Never enable paid tier or send secrets, exchange account data, or confidential task payloads. Confirm current model quota before use. | Div 04 |
| Hugging Face — https://huggingface.co/ | Hub/model hosting is free to browse/download subject to rate limits; hosted Inference Providers may have no free monthly credits depending on current account policy and may require paid credits. | Use for model discovery/download only; do not assume hosted inference is free. Local self-hosted inference is separate. | Div 04 |
| Sentry — https://sentry.io/ | Free Developer plan exists; quotas/features vary by product and account. Exact current project quota was not established in this audit. | Optional; defer until native logs/health and UptimeRobot are in place. Configure strict quota/notifications before SDK integration. | Div 05 |
| Gitleaks — https://github.com/gitleaks/gitleaks | Open-source MIT CLI/action; scans Git history/files for secrets. Upstream notes feature-complete and future releases focused on security patches. | Recommended for CI/pre-commit, but pin a reviewed release/action SHA and monitor maintenance/security advisories. | Div 01 + Div 05 |
| Trivy — https://trivy.dev/ | Open-source vulnerability/misconfiguration/secrets scanner; CLI can run in CI without managed SaaS. | Recommended CI scan for filesystem/dependencies/config; pin version/action SHA and control scan duration. | Div 01 + Div 05 |
| Semgrep — https://semgrep.dev/ | Semgrep CE is open source (LGPL-2.1), local CLI, community rules. Hosted Free Edition has product-specific repository/contributor limits; paid tiers unlock additional features. | Use CE locally/CI with community rules; do not rely on paid Pro rules or cloud features. | Div 01 + Div 05 |
| GitHub Actions — https://github.com/features/actions | Standard hosted runners in public repositories are free; current repo is public. | Already active; highest-priority existing facility. Avoid paid larger runners and excessive scheduled jobs. | Div 05 |
| Ollama — https://ollama.com/ | Local software is MIT licensed; model downloads/runtime require user's own computer, disk, RAM/VRAM and electricity. | Good optional offline development tool; not a cloud Hostless integration. Hardware availability is unknown. | Div 04 + Div 06 |
| Upstash — https://upstash.com/ | Redis Free: 1 DB, 250 MB, 10 GB monthly bandwidth, 500K commands/month. Pay-as-you-go is metered; adding a card/upgrading changes billing. | Defer. PostgreSQL queue is already the proposed initial architecture; do not add Redis without measured need. | Div 06 |

## P2 — recommended adoption order

1. Keep GitHub Actions as the first test runner; inspect current workflow and add security scanning only after independent Div 05 review.
2. Use Gitleaks and Trivy as pinned CI tools; Semgrep CE as an optional local/CI SAST check.
3. Use UptimeRobot Free for external uptime checks after BOS creates/authorizes the monitor.
4. Run PostgreSQL migration and queue integration tests against an ephemeral/free disposable database only after no-card/no-overage conditions are confirmed. Do not connect Neon to production.
5. Consider Cloudflare Workers/Queues only if Hostless cannot supply a verified zero-cost trigger/queue capacity and Cloudflare free quota is available.
6. Use Google AI Studio free tier only for non-sensitive evaluation; Hugging Face for model discovery; Ollama only if local hardware is available.
7. Defer Sentry and Upstash until there is an observed need that native logging/health, UptimeRobot, and PostgreSQL cannot meet.

## Security and provisioning gates

- Rp0 hard ceiling. No card, billing upgrade, paid trial, auto-charge, or resource creation without BOS approval and visible quota/overage evidence.
- No secret/API key in chat, issue, source, frontend, CI logs, or this report.
- Keep all provider secrets in server-side environment/secret storage with least privilege.
- Do not replace production storage/provider or migrate live state in this audit.
- Div 01 reviews threat model/secret handling; Div 06 validates technical fit; Div 05 independently validates tests and CI.

## Tests and evidence

- GitHub Actions on recent main pushes: completed/success (see Actions tab).
- PR #18 Agent Platform CI: success for PR commit 18c37f63cb9b5176a724d2c43b1eb1b8ee33b5d5; PR remains open.
- No local npm test executed in this session because no local checkout/runtime was available through the GitHub connector.
- No Neon migration executed in this session.
- No Hostless build/live check completed; status UNKNOWN.
- No external service account/resource created; integrations are NOT INSTALLED.

## NEXT TASK

1. BOS/Executive Office verifies Hostless account plan, free quota remaining, overage/auto-upgrade controls, and whether a standalone worker/database is included at Rp0.
2. Div 06 + Div 05 reconcile PR #18 against current main, validate migration smoke test and queue acceptance tests, then merge only through the normal review gates.
3. Div 01 + Div 05 add pinned Gitleaks/Trivy checks to GitHub Actions on a separate branch and review false positives/secret handling.
4. Div 05 sets up UptimeRobot Free only after account authorization and confirms HTTP monitor alerts.
5. Reassess Neon/Cloudflare provisioning only after the free-plan gate is evidenced.
