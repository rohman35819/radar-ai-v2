# Architecture Decision Record: Separate RADAR and NEXUS Storage

- Date: 2026-11-27 (Asia/Jakarta)
- Status: **Approved by BOS; implementation pending**
- Owner: BOS
- Lead: Chief Strategy Advisor; execution coordinated through Executive Office
- Repository: `rohman35819/radar-ai-v2`

## Decision

RADAR AI V2 and RADAR NEXUS will use **separate persistent database projects / storage boundaries**, while remaining fully interoperable as one ecosystem through documented, authenticated APIs.

- RADAR's operational data remains in the existing RADAR Supabase project.
- NEXUS persistent AI data belongs in a separate NEXUS Supabase project, subject to verified free-tier project/quota availability.
- The systems may exchange information and invoke each other's permitted capabilities through APIs. Storage separation is not a capability restriction.
- No shared tables, cross-project foreign keys, or silent writes into the other system's database.
- Each system owns its schema, migrations, backups, retention, access policies, and recovery procedure.

## Why

Separate ownership reduces accidental data mixing, allows independent backup/restore and lifecycle management, and gives NEXUS room to evolve its memory and agent-state model without coupling it to RADAR's operational schema. API integration preserves two-way collaboration.

## Communication model

1. RADAR Backend exposes versioned, authenticated APIs for the RADAR data/actions it intentionally shares.
2. NEXUS Core consumes those APIs using a dedicated least-privilege service identity.
3. NEXUS exposes versioned, authenticated reasoning/knowledge/agent APIs to RADAR where appropriate.
4. Each service validates caller identity, scopes, payload shape, freshness/provenance, rate limits, and audit context.
5. No database credential or Supabase service-role key is shared between systems or placed in Termux, browser code, model prompts, Git, or logs.
6. API failures must be explicit. No hidden fallback that writes one system's data into the other's database or to persistent phone storage.

## Data ownership

### RADAR database
Market observations, scanner results, watchlists, portfolio/exchange operational state, alerts, and RADAR-owned audit records.

### NEXUS database
Conversation sessions/messages, durable AI memory, curated knowledge, skills metadata, agent/task state, evaluations, provenance, and NEXUS-owned audit records.

Shared information is exchanged as API payloads or explicitly published snapshots. The receiving system stores its own copy only when its retention and provenance policy permits it.

## Security and operational requirements

- Separate Supabase projects and credentials, with server-side secret storage only.
- Least-privilege roles and RLS where applicable; service-role credentials never exposed to clients.
- No unrestricted cross-database access.
- Explicit API contracts, authentication, authorization, idempotency, rate limits, timeout/retry policy, and audit trails.
- Independent migration, backup, restore, retention, and deletion procedures.
- NEXUS cloud persistence is authoritative; Termux is a thin client. Local cache, if any, is bounded and disposable; cloud write failure must be visible and must not silently persist to phone storage.
- Rp0/free-only policy remains mandatory. Do not activate paid compute, storage, add-ons, trials that convert to paid, or overages.
- Verify Supabase organization project limits, free-tier quotas, inactivity pausing, database size, egress, backup/restore availability, and project creation eligibility before provisioning NEXUS.
- If a second Supabase project cannot fit the approved free tier, **do not silently collapse the databases**. Present a no-cost alternative and trade-offs to BOS before changing this decision.

## Migration and rollout plan

### Phase 0 — Verify feasibility (no production changes)
- Confirm existing RADAR project ownership, region, free-tier status, project count limits, quotas, and backup options.
- Confirm NEXUS project can be created and operated at Rp0 without paid add-ons or payment activation.
- Inventory existing NEXUS migration proposals and identify any `public.*` assumptions.
- Produce a data ownership map and API trust boundary.

### Phase 1 — NEXUS database foundation
- Create the separate NEXUS Supabase project only after free-tier feasibility is verified.
- Redesign NEXUS migration namespace for its own database; do not apply the earlier shared-project proposal unchanged.
- Establish private tables, RLS/grants, server-only access, migration smoke tests, retention, and backup/restore evidence.
- Do not copy RADAR production data into NEXUS.

### Phase 2 — API bridge
- Define versioned RADAR↔NEXUS API contracts and dedicated identities.
- Start with read-only market/context requests and NEXUS analysis responses.
- Add request provenance, freshness, idempotency, rate limiting, audit, timeout, and failure behavior.
- Keep external actions, production mutation, trading, and withdrawal outside the initial bridge.

### Phase 3 — Cloud-first NEXUS persistence
- Move NEXUS sessions, memory, knowledge, and task state to its own cloud database.
- Verify reinstall/device-change recovery and explicit failure when cloud storage is unavailable.
- Termux remains a thin client; no permanent phone-local memory/session/task storage.

### Phase 4 — Independent operations
- Exercise backup/restore and project isolation.
- Monitor quota/usage and API reliability.
- Reassess dedicated infrastructure only when justified by measured load and BOS approval.

## Provisioning status — 2026-11-27 (BOS dashboard evidence)

- The separate Supabase organization `RADAR NEXUS` and project `radar-nexus-core` have now been created by BOS on the Free plan.
- NEXUS project reference: `zhvznjcsxrtybqcpbryu`.
- NEXUS Project URL: `https://zhvznjcsxrtybqcpbryu.supabase.co`.
- Dashboard snapshot reports Status `Healthy`, Compute `nano`, branch `main`, no GitHub repository connected, no migrations, no backups, and zero requests/warnings/errors in the displayed last-60-minute window.
- This is provisioning evidence only. It does not prove schema, RLS/grants, API integration, backup/restore, or runtime persistence are implemented or tested.
- Database password and API keys are intentionally not recorded here. GitHub connection remains optional and is not required for the initial schema design.

## Existing state and migration warning

The currently known RADAR Supabase project is `gjchftphwexpjpvdpqoj` at `https://gjchftphwexpjpvdpqoj.supabase.co`. A dashboard snapshot supplied on 2026-11-27 showed the project healthy, with no migrations and no backups listed at that time. This does not establish current status; recheck before any migration.

An earlier NEXUS proposal migration `supabase/migrations/20261127_nexus_cloud_storage.sql` was drafted for tables under `public.*` in a shared project. It is **not approved for application** under this decision. Rework it for a separate NEXUS project and review authentication, ownership, RLS, grants, retention, and restore before use.

No new NEXUS Supabase project has been provisioned by this decision. No SQL has been applied, no data moved, no API bridge deployed, and no automation activated.

## Acceptance criteria

- RADAR and NEXUS point to distinct database project references and distinct server-side credentials.
- Automated tests prove each service cannot write to the other's database using its normal runtime identity.
- API contract tests prove allowed two-way exchange and reject unauthenticated, unauthorized, malformed, stale, replayed, and secret-bearing requests.
- Migration smoke tests pass against disposable PostgreSQL/Supabase-compatible environments.
- Backup and restore are demonstrated independently for both projects.
- NEXUS session/memory survives client reinstall/device replacement and cloud outage produces visible write failure without local persistent fallback.
- Usage remains within verified free quotas; no paid resources or overages.
- Security and QA reviews approve before production data or runtime is connected.

## Rollback

Before any production data movement, rollback means disabling the API bridge and retaining each system's existing database unchanged. After NEXUS data is created, rollback must preserve and export NEXUS-owned data before disabling or replacing its project. Never delete either database as a rollback shortcut.

## Next tasks

1. Division 08 / Executive Office: verify official Supabase Free project limits and current organization eligibility; no provisioning yet.
2. Division 01: threat model for separate projects, service identities, API authentication, RLS, secrets, and cross-system trust.
3. Division 07: redesign NEXUS migration for its own project and specify memory/session/task ownership.
4. Division 06: define API bridge contracts and permission boundary; no worker or production caller yet.
5. Division 05: disposable migration, isolation, API contract, backup/restore acceptance tests.
6. Advisor: reconcile this ADR into the master context and advisor handoff after review of the complete current files.

## Follow-up design artifact — 2026-11-27

- Added [NEXUS database foundation design](radar-nexus-database-foundation.md) on the same documentation branch.
- Design defines NEXUS-owned data boundaries, proposed private-schema tables, identity/RLS requirements, provenance-first retrieval, future task lifecycle, read-only API bridge boundary, Rp0 backup/restore controls, staged acceptance gates, and division backlog.
- The design is proposal-only. No SQL migration has been created or applied; no runtime, API bridge, worker, or scheduler has been activated.
- Lead: Division 07. Required reviewers: Divisions 01, 06 and 05. SQL deployment into the BOS NEXUS project remains a separate explicit approval gate.

## Change log

- 2026-11-27: BOS approved separate RADAR and NEXUS persistent storage with two-way API interoperability. NEXUS Supabase Free project provisioned and dashboard evidence recorded; logical database design added for review. SQL/runtime/API implementation remains pending.
