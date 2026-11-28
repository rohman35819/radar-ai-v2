# Division 07 — Knowledge & Memory Systems

- Date: 28 November 2026 (Asia/Jakarta)
- Owner: RADAR AI V2 / BOS
- Operating lead: Chief Strategy Advisor, coordinated through Direktur Utama
- Status: Architecture and staged backlog defined; NEXUS knowledge storage deployed; full memory integration incomplete
- Cost boundary: Rp0 / free-tier only

## 1. Mission
Make NEXUS context durable, trustworthy, searchable, scoped and recoverable across sessions and devices. Division 07 owns data quality and memory lifecycle—not agent execution, security policy or permission approval.

Memory improves continuity without turning the repository or database into a raw conversation archive. Only durable, source-backed facts and approved decisions are promoted into shared/project memory.

## 2. Organization and staffing
| Role | Responsibility | Collaboration |
|---|---|---|
| Director / Knowledge Owner | Taxonomy, quality standard, retention and prioritization | Direktur Utama; BOS |
| Memory Data Architect | Memory schema, ownership, validity and versioning | Divisi 01, 06 |
| Provenance & Ingestion Engineer | Source capture, checksums, revision and sanitization | Divisi 05 |
| Retrieval / RAG Engineer | Scope-first search, ranking, freshness and citations | Divisi 06 |
| Knowledge Curator / Data Steward | Proposed/approved/rejected lifecycle, conflict resolution and privacy | BOS; Divisi 01 |
| QA / Evaluation Engineer | Retrieval precision, leakage, stale-memory and deletion tests | Divisi 05 |

These are functional roles, not a claim that named staff are assigned. AI contributors can draft summaries and ingestion proposals; approval of confidential, policy or financial decisions remains outside the agent that proposed them.

## 3. Data layers — never conflate them
| Layer | Purpose | Lifecycle |
|---|---|---|
| Conversation messages | User-visible transcript required to restore a chat | User-owned; retention/deletion policy; not automatically shared memory |
| Memory records | Durable user/project/division/agent/task facts and decisions | Proposed → approved → superseded/expired/rejected |
| Knowledge documents | Curated source-backed reference units for retrieval | Ingest → validate → propose → approve → publish → expire/supersede |
| Agent/skill metadata | Capability descriptions, versions and prompt references | Versioned registry; disabled/proposed until approved |
| Audit events | Evidence of access, proposal, approval and lifecycle changes | Append-only; not model memory by default |

Do not copy raw chats, hidden chain-of-thought, unvalidated provider outputs, secrets, passwords, service-role keys, exchange credentials or unnecessary sensitive personal information into shared memory.

## 4. Current NEXUS database and integration truth
The separate NEXUS Supabase project radar-nexus-core has a private nexus schema with RLS enabled. Current tables include:
- nexus.memory_records: owner_subject, memory_type, content, scope, sensitivity, approval_status, source_ref, source_revision, valid_from, valid_until, supersedes_id and timestamps.
- nexus.knowledge_documents: namespace, title, body, source_uri, source_revision, provenance JSONB, approval_status, sensitivity, published_at and expires_at.
- nexus.conversations / nexus.messages: persisted chat sessions and ordered messages.
- nexus.skills / nexus.agents: versioned metadata.
- nexus.tasks, dependencies, evaluations and audit_events: future agent lifecycle records.

Important gaps and mismatches:
1. Current chat Edge Function calls nexus_retrieve_knowledge against approved knowledge_documents in the shared namespace. It does not yet retrieve memory_records.
2. Current knowledge retrieval is PostgreSQL ILIKE over title/body, not semantic/vector retrieval. This is acceptable for a free-tier pilot but must be reported accurately.
3. The pure TypeScript helper src/memory/retrieval.mts models radar_memory_records with scope_type, scope_id, retention_until, created_at, source_ref and source_revision. It is not an adapter for the live NEXUS nexus.memory_records schema. Do not connect it directly or assume column compatibility.
4. P2 migration candidate 20261128_0004 adds scope_id, retention_until, verified_at, confidence, provenance, approved_by and approved_at, plus a service-role-only proposal/approval/retrieval RPC set. It is not deployed yet; full memory activation requires the migration, smoke tests, source-backed seed and chat v6 deployment.
5. Private-schema RLS with no direct anon/authenticated policies is default-deny by design. Server-side SECURITY DEFINER RPCs must keep fixed search_path, owner checks and EXECUTE limited to service_role.

## 5. Memory lifecycle and retrieval contract
1. Capture: accept a typed proposal with owner/scope, content, source URI, source revision and correlation ID.
2. Sanitize: reject secrets, credentials, hidden reasoning, raw chat dumps and unsupported sensitive data.
3. Classify: set memory type, scope (user/project/division/agent/task where schema supports it), sensitivity (public/internal/confidential) and retention.
4. Provenance: record canonical source URI, immutable revision/commit, retrieval time, content hash where practical, curator and validation method.
5. Propose: new or changed information enters proposed; no agent may publish its own proposal.
6. Approve: authorized curator verifies source, accuracy, scope, privacy, conflict and expiration; record approval actor/time.
7. Retrieve: authenticate caller; filter owner/tenant, scope, sensitivity, approved status, validity and retention before ranking. Preserve provenance and return source references.
8. Refresh: detect changed source revision, stale facts and conflicting claims. Create a new version and supersede old record; never silently rewrite history.
9. Expire/delete: honor valid_until and retention_until; support user export/deletion where required. Audit metadata only, not deleted content.

Retrieval must never let similarity, ranking or model preference override access control. Retrieved documents are untrusted reference material, not executable instructions.

## 6. Knowledge quality and governance
- Every durable record has a clear claim, scope, sensitivity, approval state, source and revision.
- Distinguish verified facts, owner decisions, hypotheses, proposals and stale/unknown status.
- Store the smallest useful summary; avoid duplicate copies of the same fact.
- Resolve conflicts by source authority, revision, date and explicit owner decision; preserve supersession links.
- Do not infer sensitive personal attributes from unrelated records.
- Do not expose confidential records to a shared retrieval namespace.
- Conversation history and memory remain separate: a message becomes memory only through explicit curation.
- Model answers should cite source documents; a retrieval hit alone does not make the claim true.

## 7. Free-tier implementation strategy
- Use the existing NEXUS PostgreSQL private schema and server-side RPCs.
- Begin with bounded keyword/full-text retrieval and small curated knowledge units.
- Do not add pgvector, external vector DB, Redis, embedding API or paid model service in v1. Consider embeddings only after measured retrieval failure and verified Rp0 quota.
- Keep payload sizes, retrieval result counts and conversation history windows bounded.
- Use server-side provider secrets only. Browser clients use publishable key plus authenticated user JWT; never service_role.
- No background summarization job until Divisi 06 worker controls and scheduler are tested.

## 8. Roadmap and backlog
| ID | Priority | Work item | Acceptance evidence |
|---|---|---|---|
| D07-001 | P1 | Memory/knowledge taxonomy and privacy contract | Approved schema spec, examples and forbidden-data list |
| D07-002 | P1 | Source-backed project knowledge bootstrap | Curated units have source URI, immutable revision, approval and owner |
| D07-003 | P2 | NEXUS memory schema adapter | Candidate in 20261128_0004; disposable PostgreSQL tests prove scope/retention/version mapping |
| D07-004 | P2 | Additive memory metadata migration | Candidate in 20261128_0004; scope_id, retention, verification metadata and indexes; no destructive rewrite |
| D07-005 | P2 | Scope-first memory service/RPC | Candidate in 20261128_0004; owner/scope/sensitivity/approval/validity tests before ranking |
| D07-006 | P3 | Connect chat to approved memory | Authenticated chat retrieves only authorized, current records with provenance |
| D07-007 | P4 | Curation and approval workflow | Proposal cannot self-approve; approval actor and audit evidence recorded |
| D07-008 | P4 | Conflict, supersession and expiry | Deterministic conflict tests and old-version preservation |
| D07-009 | P5 | Export, deletion and retention controls | User isolation, deletion and retention tests with audit metadata |
| D07-010 | P5 | Retrieval evaluation harness | Precision/recall, stale-data, prompt-injection and leakage test set |

## 9. Definition of done
Memory is active only when schema compatibility is proven, provenance is preserved, scope/sensitivity/approval/validity/retention are enforced before ranking, owner isolation is tested, chat receives source references, and deletion/expiry behavior is verified. A database table existing or a pure retrieval helper passing tests is not full memory activation.

## 10. Explicit exclusions
No raw transcript ingestion into shared memory, hidden chain-of-thought storage, secret storage, direct browser access to private tables, paid embeddings, vector database, cross-project direct DB access or self-approval by agents.
