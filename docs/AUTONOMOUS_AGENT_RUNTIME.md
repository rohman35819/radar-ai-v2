# RADAR AI Autonomous Agent Runtime

**Status:** Stage 1 cloud-worker hardening is prepared in a PR. It is not a continuously running service. Groq execution remains opt-in and disabled by default.

## Objective

Run safe RADAR engineering work on GitHub-hosted infrastructure so the owner's Android phone and Termux do not need to stay on. Termux/OpenCode becomes an optional control and emergency troubleshooting tool, not the worker host.

## What already exists (verified on 25 November 2026)

1. `.github/workflows/autonomous-development.yml` schedules a GitHub Actions worker every two hours and also supports manual dispatch.
2. `lib/ai/autonomous-agent.js` asks a model for a small unified patch, validates the patch, applies it in an ephemeral runner, runs `npm test`, pushes a task branch, and opens a Draft PR. It does not merge or deploy.
3. The current worker has a strict allowlist: at most three existing files under `lib/ai/*.js` and `test/*.test.js`; no file creation/deletion/rename, server/auth/workflow/database/secret/exchange/trading edits, or dependency changes.
4. PostgreSQL migrations `db/migrations/001_agent_platform.sql` and `002_queue_operations.sql` already define agent registry, durable task queue, dependencies, lease/heartbeat/retry, audit events, approvals and global pause/kill switch.
5. The database control plane is intentionally inactive: `platform_control` defaults to paused + kill switch on; agents are capped at autonomy stage 1, concurrency 1 and daily budget USD 0. Queue/control functions are revoked from PUBLIC, anon, authenticated, service_role and `radar_agent_runtime`. No worker currently has permission to claim production tasks.

## Stage 1 — phone-free scheduled proposal worker

- Use GitHub Actions hosted runners; no Android/Termux process is needed.
- Keep the existing two-hour schedule and manual dispatch. Each run is ephemeral and stops after the job; this is periodic automation, not 24/7 continuous execution.
- Checkout `develop`, create `fix/*` branches and open Draft PRs against `develop`, consistent with repository branch-source policy.
- Groq API is supported only when both `GROQ_AUTONOMOUS_ENABLED=1` and the `GROQ_API_KEY` Actions secret exist. The flag defaults to `0`. Do not enable it until BOS has reviewed provider billing/quota and explicitly authorizes activation.
- If Groq is not enabled or fails, the only automatic fallback is OpenRouter's explicit `openrouter/free` router. No paid model fallback is allowed.
- Preserve the existing three-file allowlist, patch validation, `npm test`, secret-stripping child environment, Draft PR only, and one-outstanding-agent-PR backpressure.
- This worker is a narrow maintenance pilot; it is not the full OpenCode CLI, not a general shell agent, and not yet a multi-division task orchestrator.

### Required GitHub configuration (not performed by this PR)

- Optional secret: `GROQ_API_KEY`.
- Optional repository variable: `GROQ_AUTONOMOUS_ENABLED=1` only after explicit BOS approval; default remains `0`.
- Optional variable: `GROQ_MODEL`, default `openai/gpt-oss-20b`.
- Never paste a key into chat or commit it. Store it only in GitHub Actions Secrets.
- Confirm GitHub Actions quota/plan and provider quota before enabling. A scheduled runner can consume Actions minutes; Groq API usage may be billable depending on the account.

## Stage 2 — durable queue-driven worker (not activated)

Connect an ephemeral scheduled worker to `radar_agent.task_queue` only after a dedicated least-privilege runtime role and database grants have been designed and independently reviewed. Do not reuse the Supabase `service_role` key for a worker.

Required behavior:
- Atomic `claim_task` with lease fencing; heartbeat before lease expiry.
- Idempotent enqueue; bounded attempts, deadlines, retry backoff and dead-letter handling.
- Per-agent concurrency 1, task size/time limits and daily budget enforcement.
- Check platform pause and kill switch before claim and before every side effect.
- Append-only audit for enqueue, claim, heartbeat, completion, failure, approval and denial.
- Approval requests for production, secret/permission, destructive, paid activation and financial actions.
- Restart-safe recovery: expired leases return to queue or dead-letter; no duplicate side effects.
- Worker receives only the credentials and tools for its assigned task; provider keys never enter child processes or logs.

Do not apply migrations, grant production database permissions, or activate a production worker as part of a documentation/worker-code PR. Production Supabase activation remains a separately gated action.

## Stage 3 — multi-agent orchestration (not activated)

- Main Director decomposes a task into scoped work items with dependencies and acceptance criteria.
- Division agents (01–08) are registered with explicit tool/file scopes; one active task per agent initially.
- Independent QA worker checks exact diff, tests, secret scan, compatibility and rollback.
- Routine low-risk work may proceed to a PR; no agent can approve its own high-risk request or raise its own permissions.
- Merge and deployment remain behind verified repository checks and release policy. No direct push to `main`.
- Shared memory is distilled project context, not raw conversation transcripts.

## Stage 4 — continuous server worker (only if periodic Actions is insufficient)

A continuously polling worker may run on a dedicated container/VPS or managed worker service. Do not run an infinite worker inside the Hostless web request process. Compare free tiers, quotas, region, persistence, sleep behavior, uptime and total monthly cost first. No paid server/service may be provisioned without BOS approval.

## Operational guarantees and limitations

- Closing Termux, turning off the phone, or losing the phone's mobile data does not stop a GitHub Actions job already running in GitHub's hosted environment.
- A scheduled job still needs GitHub availability and provider connectivity. It runs at its next scheduled time, not continuously between schedule ticks.
- GitHub scheduled workflows can be delayed or skipped under platform load; they are not a hard real-time scheduler.
- A workflow merged only to `develop` is not scheduled by GitHub until the workflow is present on the repository's default branch (`main`). The current PR changes code/policy only; it does not activate Groq or provision infrastructure.
- GitHub CI success is not evidence that a worker has been enabled, a provider secret exists, a database worker is active, or Hostless has deployed a commit.

## Acceptance criteria before claiming autonomous operation

1. Exact-head tests and security scans pass.
2. Workflow is present on default branch and a manual/scheduled run is observed.
3. Run logs show a sanitized provider selection and a clear SKIP reason when disabled; no credentials or raw prompts/responses are logged.
4. A test-only low-risk proposal opens a Draft PR against `develop` with a valid `fix/*` branch and all checks passing.
5. Groq is reported active only after explicit enablement and a verified successful Groq response; otherwise the worker is described as disabled or using OpenRouter Free.
6. No merge, deployment, production DB mutation, paid service activation or financial action occurs without its separate gate.

## Rollback

Set `AUTONOMOUS_AGENT_ENABLED=0` to stop scheduled worker execution, or revert the worker/workflow PR. Set `GROQ_AUTONOMOUS_ENABLED=0` to disable Groq while retaining the explicitly free OpenRouter fallback. The worker never writes to production data or sends exchange orders.
