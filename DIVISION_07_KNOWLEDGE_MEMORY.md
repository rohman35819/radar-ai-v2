# DIVISION 07 — KNOWLEDGE & MEMORY SYSTEMS

**Status:** Charter and staged architecture proposal; no claim of active durable NEXUS memory service.  
**Owner:** Executive Office / Chief AI Officer. **Lead domain:** Knowledge and memory.

## Mission
Give RADAR AI NEXUS reliable, durable, attributable knowledge across sessions and agents. Preserve decisions and validated learning without turning chat transcripts, hidden reasoning or unreviewed model output into canonical truth.

## Responsibilities
1. Knowledge taxonomy and canonical record schemas.
2. Decision memory, task outcomes, project facts, technical knowledge and versioned skills.
3. Provenance: source URI/ref, revision/hash, observed time, author/agent, extraction method and confidence.
4. Lifecycle: proposed, reviewed, approved, rejected, superseded, expired and revoked.
5. Scope and sensitivity labels; retrieval authorization before ranking.
6. Deduplication, conflict detection, temporal validity and supersession.
7. Retrieval interfaces and evaluation datasets; coordinate model/provider use with Divisi 04.
8. Backup/restore, retention, deletion and integrity evidence with Divisi 01.

## Canonical record classes
- Decision: approved choice, rationale summary, approver, effective date, scope, supersedes.
- Knowledge: claim, source provenance, revision, validity interval, confidence and review state.
- Skill: executable or procedural capability, version, owner, prerequisites, allowed tools and tests.
- Task outcome: task ID, objective, artifact refs, tests, review result and follow-up.
- Evaluation: benchmark case, model/agent version, rubric, result and regression link.
- Memory pointer: reference to source artifact; do not duplicate sensitive source payloads.

## Non-negotiable data rules
- Never store credentials, API keys, tokens, raw exchange secrets, private keys, or unrelated sensitive personal data.
- Never store raw conversation transcripts, hidden chain-of-thought, routine prompts/responses or private reasoning logs.
- Store concise decision/rationale summaries and verifiable outputs only.
- Unmerged PRs and model suggestions are proposals, not approved project facts.
- Every factual record must carry provenance and status; unsupported claims cannot be promoted.
- Apply tenant/agent/division/sensitivity access filters before retrieval ranking.
- Conflicts remain visible; newest timestamp alone does not make a record authoritative.
- Respect retention/deletion policy and preserve audit evidence without retaining deleted sensitive payloads.

## Retrieval and learning pipeline
Capture candidate → validate schema/provenance → classify sensitivity/scope → deduplicate/conflict-check → domain review → approve/reject → index → authorization filter → retrieve with citations → verify against current source → record feedback/evaluation.
Model-generated knowledge is never auto-approved. External models may propose or critique; Divisi 04 evaluates model outputs, Divisi 05 checks reproducibility, Divisi 01 checks privacy/security, BOS retains reserved policy approvals.

## Staged roadmap and acceptance criteria
### D07-N0 — Taxonomy and schemas
Define record schemas, provenance requirements, lifecycle transitions, scope/sensitivity model and retention proposal.
Accept when invalid/missing provenance and illegal transitions fail validation; examples cover decisions, skills, task outcomes and evaluations.

### D07-N1 — Curated repository knowledge
Curate approved project decisions and technical records in version-controlled Markdown/JSON; no new service or paid vector database.
Accept when every record links to a source/revision, carries approval status and has an owner/review date.

### D07-N2 — PostgreSQL retrieval design
Evaluate existing database/migrations first; propose relational storage + full-text retrieval before vector search. No new DB, Redis or vector service without cost/security approval.
Accept with authorization-before-ranking tests, stale/superseded filtering, conflict tests, deletion/retention tests and restore plan.

### D07-N3 — Memory adapter and evaluation
Implement read/write adapter only after schema, DB capacity and independent reviews are accepted.
Accept with provenance-preserving round trips, role isolation, deterministic retrieval tests and benchmarked precision/recall; memory OFF until separately approved.

### D07-N4 — Continuous learning loop
Capture feedback and benchmark regressions; curate skill/knowledge updates through review. No automatic model-weight changes.
Accept when every promoted change is traceable, reversible and tested against a fixed regression set.

### D07-N5 — Model ownership research
Only Divisi 04-led feasibility study for licensed open-weight model fine-tuning/distillation after dataset licensing, compute, privacy, benchmark and cost review. This is not implied by RAG or memory.

## KPIs
Provenance completeness 100%; unauthorized retrieval zero; stale/superseded retrieval rate; duplicate/conflict rate; retrieval precision/recall; decision recovery time; regression rate after knowledge updates; backup restore success; Rp0 operating cost.

## First backlog
- D07-001: inventory existing shared memory, master context and existing migration/PR work; identify canonical source per fact.
- D07-002: schema for Decision/Knowledge/Skill/TaskOutcome/Evaluation with provenance and lifecycle.
- D07-003: curated seed set from approved project decisions; no chat archive.
- D07-004: retrieval authorization and stale-record tests with Divisi 01/05.
- D07-005: PostgreSQL full-text feasibility using existing infrastructure; no provisioning.
- D07-006: fixed NEXUS capability benchmark dataset with Divisi 04/05.

## Handoff format
Record ID, class, claim/summary, source ref+revision, scope, sensitivity, validity, status, confidence, owner, reviewer, created/updated time, supersedes and retention class. Never store hidden reasoning.
