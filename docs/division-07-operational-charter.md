# Divisi 07 — Knowledge & Memory Systems (Operational Charter)

**Status:** proposed operational split under NEXUS; no durable knowledge service is active. Owner: BOS · Lead: Direktur Utama · Engineering lead: Grok. Rp0 only.

## Mandate

Provide provenance-first, access-controlled knowledge and memory so decisions, tasks, strategies and research results remain traceable and retrievable without becoming a chat archive or a secret channel.

## Responsibilities

- Knowledge ingestion, memory schema and provenance, retrieval and access control.
- Memory validation, expiry/supersession, change audit, backup and recovery.
- Taxonomy for approved decisions, facts, task handoffs, execution evidence, research results and sourced knowledge.

## Inputs / outputs

- **Input:** committed artifacts (reports, experiment summaries, PR/issue/commit references), BOS-approved decisions, validated research outputs from Divisi 04, observe-only receipts from Divisi 06.
- **Output:** canonical knowledge records with `source_ref`, `source_revision`, `scope`, `sensitivity`, `approval_state`, `valid_from/valid_until`, `supersedes`, `retention_until`, `confidence`, `artifact_refs`.
- **Contracts:** Divisi 06 task/audit events; Divisi 04 report schema; Divisi 01 access/privacy policy; Divisi 05 QA evidence. No private account data, secrets or raw chats.

## AI/agent needs

Curator role that proposes records; human/Direktur review for promotion. Retrieval filters by identity, scope and sensitivity before ranking. No vector DB, Redis or paid SaaS without measured need and approval.

## KPIs

- % records with complete provenance; stale/conflicting record rate; unauthorized retrieval attempts = 0; supersession traceability; recovery drill success; retention compliance; no secret/chat-archive findings.

## Risks

Provenance drift, stale facts treated as current, sensitive leakage, unbounded retention, unrecoverable loss, false "memory active" claims. Controls: append/version records, explicit expiry, access filters, backup in disposable env, truthful status labels.

## Roadmap (gates, not dates)

- **N0:** taxonomy + sample records + privacy review (current design).
- **N1:** relational metadata schema + full-text search prototype in disposable DB.
- **N2:** ingestion from committed artifacts with validation and dedupe.
- **N3:** retrieval with scope/sensitivity filters and provenance-preserving results.
- **N4:** backup/restore and expiry drills; Divisi 01/05 sign-off.
- **N5:** any runtime integration after BOS approval; no always-on claim without tested worker.

Current state: N0 design only. No durable memory tables/service/runtime active in production.
