# Division 07 — Provenance-first memory sample records

- Status: **PROPOSAL / TEST FIXTURES ONLY**
- Date: 22 November 2026
- Owner: Divisi 07; review: Divisi 01 privacy/access, Divisi 05 QA
- These examples are synthetic project fixtures, not production memory rows.

## 1. Record envelope

Every stored record uses a common envelope:

| Field | Meaning |
|---|---|
| memory_id | Stable UUID |
| record_type | decision, project_fact, task_handoff, execution_evidence, sourced_knowledge |
| title / summary / content | Bounded human-readable content |
| scope_type / scope_id | project, division, task, or owner-only |
| sensitivity | public, internal, restricted, secret (secret values are never stored) |
| lifecycle | proposed, reviewed, approved, rejected, superseded, archived |
| source_type / source_ref / source_revision | Exact GitHub file/commit/PR/issue/run or approved source reference |
| asserted_by / reviewed_by / approved_by | Authenticated identities, not free-form caller claims |
| valid_from / valid_until | Validity window |
| supersedes_id | Prior record replaced by this one |
| created_at / updated_at | Server-generated timestamps |
| retention_class | policy, task_summary, diagnostic, rejected_proposal |
| metadata | Bounded typed metadata only; no credential/payload dumps |

## 2. Synthetic examples

### A. Approved project decision

```json
{
  "memory_id": "00000000-0000-4000-8000-000000000001",
  "record_type": "decision",
  "title": "Hard project budget remains Rp0",
  "summary": "No paid provisioning or unverified overage is permitted.",
  "scope_type": "owner",
  "scope_id": "project",
  "sensitivity": "internal",
  "lifecycle": "approved",
  "source_type": "github_commit",
  "source_ref": "RADAR_AI_MASTER_CONTEXT.md#zero-budget-policy",
  "source_revision": "main@verified-commit",
  "asserted_by": "director",
  "reviewed_by": ["security"],
  "approved_by": "BOS",
  "valid_from": "2026-11-22T00:00:00+07:00",
  "valid_until": null,
  "supersedes_id": null,
  "retention_class": "policy",
  "metadata": {"policy_key": "budget.hard_cap", "amount": 0, "currency": "USD"}
}
```

### B. Proposed task handoff

```json
{
  "memory_id": "00000000-0000-4000-8000-000000000002",
  "record_type": "task_handoff",
  "title": "Divisi 07 sample records and retrieval QA",
  "summary": "Prepare fixtures and access-aware retrieval acceptance cases.",
  "scope_type": "division",
  "scope_id": "07",
  "sensitivity": "internal",
  "lifecycle": "proposed",
  "source_type": "github_issue",
  "source_ref": "https://github.com/rohman35819/radar-ai-v2/issues/30",
  "source_revision": "issue-current-at-review",
  "asserted_by": "division-07-agent",
  "reviewed_by": [],
  "approved_by": null,
  "valid_from": "2026-11-22T00:00:00+07:00",
  "valid_until": null,
  "supersedes_id": null,
  "retention_class": "task_summary",
  "metadata": {"task_key": "div07.memory-samples", "acceptance_criteria": ["provenance complete", "scope isolation", "supersession tested"]}
}
```

### C. Execution evidence

```json
{
  "memory_id": "00000000-0000-4000-8000-000000000003",
  "record_type": "execution_evidence",
  "title": "Schema migration smoke test passed",
  "summary": "PostgreSQL 16 disposable CI migration and observer-role smoke succeeded on the cited exact PR head.",
  "scope_type": "task",
  "scope_id": "agent-platform-schema-review",
  "sensitivity": "internal",
  "lifecycle": "approved",
  "source_type": "github_actions_run",
  "source_ref": "https://github.com/rohman35819/radar-ai-v2/actions",
  "source_revision": "exact-head-sha-required",
  "asserted_by": "qa",
  "reviewed_by": ["qa"],
  "approved_by": "qa-gate",
  "valid_from": "2026-11-22T00:00:00+07:00",
  "valid_until": null,
  "supersedes_id": null,
  "retention_class": "task_summary",
  "metadata": {"result": "pass", "scope": "schema-and-smoke-only", "does_not_prove": ["worker", "scheduler", "hostless-live"]}
}
```

### D. Superseding a stale project fact

```json
{
  "memory_id": "00000000-0000-4000-8000-000000000004",
  "record_type": "project_fact",
  "title": "Current Agent Platform schema candidate",
  "summary": "PR #34 is the current schema-only candidate; earlier PRs are superseded.",
  "scope_type": "project",
  "scope_id": "agent-platform",
  "sensitivity": "internal",
  "lifecycle": "approved",
  "source_type": "github_issue",
  "source_ref": "https://github.com/rohman35819/radar-ai-v2/issues/30",
  "source_revision": "issue-current-at-review",
  "asserted_by": "director",
  "reviewed_by": ["security", "qa"],
  "approved_by": "director",
  "valid_from": "2026-11-22T00:00:00+07:00",
  "valid_until": null,
  "supersedes_id": "00000000-0000-4000-8000-000000000099",
  "retention_class": "task_summary",
  "metadata": {"current_candidate": 34, "runtime_active": false}
}
```

## 3. Retrieval QA fixture matrix

| Test | Caller | Query | Expected |
|---|---|---|---|
| R01 | BOS | current budget policy | Approved owner decision returned with exact provenance |
| R02 | Div 06 | queue lease design | Project-approved design + Div 06 scope returned |
| R03 | Div 06 | Div 03 restricted credential notes | Denied before ranking; safe audit event |
| R04 | Div 07 | memory retention proposal | Marked proposed; never described as active policy |
| R05 | Director | current Agent Platform status | Current approved record first; superseded PR history remains available only as history |
| R06 | Any agent | claim unsupported by a source | No approved memory fabricated; answer marked unknown |
| R07 | Div 05 | exact CI evidence | Exact SHA/run/status and test scope returned |
| R08 | Any division | secret value search | No secret can exist in index; write rejected and incident safely logged |
| R09 | Director | contradictory records | Conflict surfaced with both source refs and authority order |
| R10 | BOS | historical decision before supersession | Prior record returned with superseded status and replacement link |

## 4. Validation rules

- Reject approved records without a source reference and revision.
- Reject non-owner approval of owner-reserved policy.
- Reject caller-supplied actor IDs unless bound to authenticated service identity.
- Apply row-level scope and sensitivity authorization before full-text search.
- Never rank an unauthorized record and then filter it afterwards.
- Approved/current records rank above proposals; superseded records are excluded from current-state answers unless history is requested.
- Contradictions remain explicit until reviewed; timestamp alone does not resolve them.
- Enforce size limits and secret-pattern scanning at write boundary; never store raw prompts, tokens or provider payloads.
- Keep immutable history by creating a superseding record, not overwriting approved content.

## 5. Retention and deletion test cases

Retention classes remain proposals pending Divisi 01 and BOS approval:
- policy/ADR: preserve current and superseded audit history;
- task summary: proposed 12 months;
- transient diagnostics: proposed 30 days;
- rejected proposals: proposed 90 days.

QA must prove expiry/archive/purge policy, legal/incident hold, audit of deletion, and that deletion does not leave sensitive content in search indexes or copied artifacts. Do not implement purge until policy is approved.

## 6. Current implementation boundary

This document adds fixtures and test expectations only. It does not create memory tables, database adapters, APIs, indexes, embeddings, vector services, persistence or background agents. Use PostgreSQL full-text search only after a verified Rp0 durable database is available and approved.
