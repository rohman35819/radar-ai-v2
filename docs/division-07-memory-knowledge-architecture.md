# RADAR AI — Divisi 07: Shared Memory & Knowledge Architecture

Date: 2026-11-22 (Asia/Jakarta)  
Status: **Design proposal only — no memory service or production tables are active**  
Budget: **Rp0 hard ceiling**

## 1. Mandate

Divisi 07 owns the canonical, traceable memory layer used by Direktur Utama and Divisi 01–08 so work can continue across conversations and while BOS is offline.

The repository remains the canonical project record until a persistent memory service is implemented and independently accepted. Chat transcripts and model context are not a durable database and must never be represented as one.

Divisi 07 is responsible for:
- project facts and approved decisions;
- task handoffs, outcomes and artifact references;
- knowledge-source provenance and conflict/supersession tracking;
- scoped retrieval, freshness and retention policy;
- preventing unsupported or untraceable statements from becoming durable project memory.

This document defines contracts and acceptance gates. It does not add tables, runtime dependencies, provider connections or autonomous behavior.

## 2. Design principles

1. **Provenance first:** every durable item must point to its source and source revision.
2. **Append, don't silently overwrite:** corrections create a new version and an explicit supersedes relation.
3. **Approval before canonicalization:** agents may propose memory; they cannot silently promote policy, budget, permission or production facts.
4. **Least privilege:** retrieval is filtered by scope and sensitivity before ranking.
5. **Minimum necessary data:** store concise summaries and references, not raw chat dumps or provider payloads.
6. **PostgreSQL first:** relational constraints and full-text search before any vector infrastructure.
7. **No hidden autonomy:** a memory record does not itself authorize an action.
8. **Rp0:** no new paid database, vector store, cache, SaaS or AI API.

## 3. Memory domains and ownership

| Domain | Examples | Primary steward | Approval |
|---|---|---|---|
| Owner directives and guardrails | Rp0, approval boundaries, permanent operating policy | Direktur + Divisi 01 | BOS |
| Architecture and decisions | ADR, accepted/rejected options, migration decisions | Divisi 06/07 | Direktur; BOS for material policy/cost |
| Task and handoff | owner, status, dependencies, acceptance, blockers | Divisi 06 | Direktur |
| Execution evidence | CI run, test output summary, deployment evidence | Divisi 05 | Divisi 05 QA gate |
| Security knowledge | threat model, permissions, incidents, exceptions | Divisi 01 | Divisi 01; BOS for policy changes |
| Product/domain knowledge | approved RADAR facts, integration constraints | Relevant division | Division lead |
| External knowledge | vendor docs, API docs, dated research | Relevant division | Source verification required |

Divisi 07 owns the record contract, curation and retrieval model. It does not override the subject-matter owner of a decision.

## 4. Canonical memory record contract

A future relational implementation should use a stable record with these logical fields:

| Field | Required | Meaning |
|---|---:|---|
| memory_id | Yes | Immutable UUID |
| memory_type | Yes | decision, fact, policy, task_handoff, execution_result, knowledge |
| scope_type / scope_id | Yes | project, division, agent or task boundary |
| title / summary | Yes | Short searchable statement |
| content | Yes | Minimal Markdown or structured JSON; no raw secrets |
| status | Yes | proposed, reviewed, approved, rejected, superseded, archived |
| sensitivity | Yes | public, internal, confidential; restricted data is not stored |
| source_type / source_ref | Yes | GitHub issue/PR/commit/file, owner instruction or external source |
| source_revision | Recommended | Commit SHA, document version or publication date |
| source_hash | Recommended | Hash of source snapshot when content is copied |
| created_by / created_at | Yes | Originator and timestamp |
| reviewed_by / approved_by | Conditional | Human/role that reviewed or approved |
| valid_from / valid_until | Recommended | Effective period for facts/policies |
| supersedes_memory_id | Conditional | Prior item replaced by this approved item |
| confidence | Conditional | Evidence quality, not model self-confidence alone |
| task_id / correlation_id | Conditional | Link to execution record |
| artifact_refs | Conditional | PR, commit, test run, report or file references |
| retention_until | Yes | Retention/archival date or explicit policy class |

memory_type, status, scope_type and sensitivity must be constrained enums/checks in a future schema. A future implementation must reject unknown values rather than silently accept them.

### Relations

A separate relation table should support:
- supersedes
- derived_from
- supports
- contradicts
- implements
- blocks
- references

Relations must be explicit and directional. A contradiction is not resolved by timestamp alone; the authority and evidence must be examined.

## 5. Lifecycle and approval

proposed → reviewed → approved → superseded → archived

Alternative terminal path: proposed → rejected.

Rules:
- Any agent may submit a proposal only within its authorized scope.
- The Director reviews task, architecture and project-fact proposals.
- Divisi 01 reviews sensitivity, access, redaction and retention classification.
- Divisi 05 verifies execution evidence and test provenance.
- BOS approval is mandatory for owner policy, budget, external provisioning, secret/permission changes, production migrations and other reserved decisions.
- Approved records are immutable. Corrections create a new record linked by supersedes.
- A superseded record remains retrievable for audit but must not be presented as current.
- Rejected proposals remain traceable with a reason; they are not silently erased.

## 6. Provenance and conflict resolution

Every durable statement must answer:
1. Who or what asserted it?
2. Which exact source supports it?
3. Which source revision/date was inspected?
4. Who reviewed or approved it?
5. Is it still valid, superseded or disputed?

Authority order for project facts:
1. Explicit current BOS decision.
2. Current approved repository policy/ADR on main.
3. Merged code and exact-head passing tests.
4. Current operational evidence from the platform.
5. Verified vendor/API documentation.
6. Unmerged PRs and proposals.
7. Model inference or unverified chat statements.

Important distinction: an unmerged PR is evidence of proposed work, not current production behavior. A passing schema CI is not proof of a deployed worker. A vendor page is not proof of the Owner's current account quota.

When two sources conflict:
- preserve both source references;
- prefer explicit supersession or an explicit higher-authority decision;
- mark unresolved conflicts as disputed;
- never silently rewrite the older record;
- report uncertainty to the Director/BOS when it affects a decision.

## 7. Retrieval pipeline

1. Authenticate caller and resolve agent/division identity.
2. Apply scope, sensitivity and row-level access filters before search.
3. Prefer approved and currently valid records; include superseded records only for historical questions.
4. Resolve exact IDs, task keys, decision keys and artifact references first.
5. Use PostgreSQL full-text search and indexed metadata filters.
6. Rank by authority, source quality, scope match, freshness and confidence.
7. Return the concise memory plus its source refs, revision and approval state.
8. If evidence conflicts or is stale, surface the conflict instead of guessing.

No model may cite a memory item without carrying its provenance reference into the answer or downstream artifact.

## 8. Storage and indexing — free-first

Initial target if/when a verified no-cost PostgreSQL capacity exists:
- relational tables for memory items and relations;
- B-tree indexes for scope, type, status, valid dates and retention;
- GIN index on a generated tsvector for title/summary/content;
- JSONB only for bounded, typed metadata that has a clear query need;
- object/file artifacts remain in GitHub or approved existing storage; the memory record stores references and hashes, not duplicated binaries.

Do not add:
- vector database or embeddings;
- Redis or a second queue;
- external knowledge SaaS;
- a new paid model/API dependency.

Revisit vector retrieval only if measured full-text retrieval fails a documented relevance target on a representative evaluation set and BOS approves a genuinely Rp0/no-overage option.

## 9. Security, privacy and retention

Never store:
- API keys, passwords, tokens, cookies, authorization headers or secret values;
- raw exchange request/response payloads, private account identifiers or trading credentials;
- personal sensitive data unrelated to the project purpose;
- unredacted provider prompts/responses that may contain secrets or private data.

Use secret-manager references only where necessary; never copy secret values into memory.

Access:
- owner-only policy/approval records;
- division-scoped working knowledge by default;
- cross-division access only where the task requires it;
- restricted/private source content is not copied into shared memory;
- every write, approval, supersession and access denial must produce a safe audit event.

Proposed retention classes, pending Divisi 01 and BOS approval:
- approved policy/ADR: retain while effective and preserve superseded history;
- task handoff/outcome summary: 12 months, then archive/minimize;
- transient execution diagnostics: 30 days unless incident/legal hold requires longer;
- rejected proposals: 90 days, then archive or purge according to policy.

Retention periods are proposals, not active policy. Divisi 01 must review privacy, legal obligations, deletion and incident-hold requirements before implementation.

## 10. Responsibilities across divisions

- **Divisi 07 — owner:** record schema, taxonomy, provenance, relations, curation, search and retention design.
- **Divisi 06 — platform:** persistence adapter, transaction boundaries, memory APIs and integration with task IDs; no direct memory write bypass.
- **Divisi 01 — security:** identity, scope authorization, classification, redaction, retention, deletion and audit threat model.
- **Divisi 05 — QA:** migration, provenance completeness, access isolation, supersession, conflict and retrieval regression tests.
- **Divisi 02 — BOS interface:** show approved/current decisions, stale facts, pending proposals and blockers.
- **Direktur Utama — orchestration:** approve project-level memory, assign owners and ensure handoff completeness.
- **BOS:** reserved approval for policy, budget, external provisioning and production/security boundary changes.

## 11. Acceptance criteria before implementation

- [ ] 100% of approved memory records have a valid source reference and revision/date.
- [ ] Every policy/architecture record has reviewer and approver metadata.
- [ ] No secrets or restricted payloads appear in records, indexes, logs or search results.
- [ ] Scope isolation tests prove one division cannot read another division's restricted memory.
- [ ] Supersession and contradiction tests preserve history and prevent stale records being returned as current.
- [ ] Retention/archive/purge behavior is tested with audit evidence.
- [ ] Search returns source refs and distinguishes approved from proposed/unverified items.
- [ ] All writes are proposal-first and transactionally audited.
- [ ] PostgreSQL full-text retrieval is measured before considering embeddings.
- [ ] Existing free quota/no-overage is evidenced; otherwise implementation remains repository-only.
- [ ] BOS approves production storage/provisioning explicitly.

## 12. Current status and next action

- This is a design document only. No persistent shared-memory service, memory tables, vector store or background retrieval agent is active.
- PR #34 is the current Agent Platform schema-only candidate and remains subject to independent Divisi 01/05 review.
- Divisi 07 next delivers a reviewed taxonomy, provenance/retention policy and sample records using repository artifacts; do not add database tables until the schema and zero-cost gates are accepted.
