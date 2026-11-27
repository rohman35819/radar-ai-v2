/** Versioned in-memory knowledge store with deterministic snapshot reload.
 * NOT durable NEXUS storage: no database, no network, no credentials. */
import { createHash } from 'node:crypto';
import { LEARNING_SCHEMA, ContractError, validateKnowledgeRecord } from './contracts.mts';

const MAX_RECORDS = 500;
const MAX_CONTENT = 16000;

export function knowledgeId(provenance, title) {
  const basis = `${provenance.sourceId}:${provenance.revision}:${title}`;
  return `kn_${createHash('sha256').update(basis).digest('hex').slice(0, 16)}`;
}

export function createKnowledgeStore() {
  const records = new Map();

  function put(input) {
    const record = validateKnowledgeRecord({ ...input, schema_version: LEARNING_SCHEMA });
    if (record.content.length > MAX_CONTENT) throw new ContractError('KNOWLEDGE_TOO_LARGE', 'content melebihi batas');
    const existing = records.get(record.knowledgeId);
    if (existing && existing.content === record.content && existing.status === record.status) return { record: existing, deduplicated: true };
    let stored = record;
    if (existing) {
      const lineage = [...records.values()].filter((item) => item.supersedes === existing.knowledgeId || item.knowledgeId === existing.knowledgeId);
      const version = Math.max(existing.version, ...lineage.map((item) => item.version)) + 1;
      records.set(existing.knowledgeId, { ...existing, status: 'superseded' });
      stored = {
        ...record,
        knowledgeId: `${knowledgeId(record.provenance, record.title)}_v${version}`,
        version,
        supersedes: existing.knowledgeId,
      };
    }
    records.set(stored.knowledgeId, stored);
    while (records.size > MAX_RECORDS) records.delete(records.keys().next().value);
    return { record: stored, deduplicated: false };
  }

  function get(id) {
    const record = records.get(String(id ?? ''));
    return record ? { ...record } : null;
  }

  function retrieve(query = {}) {
    const limit = Math.max(1, Math.min(50, Number(query.limit) || 10));
    const scope = query.scope;
    const tags = Array.isArray(query.tags) ? query.tags.map(String) : [];
    return [...records.values()]
      .filter((record) => record.status === (query.status ?? 'approved'))
      .filter((record) => !scope || (record.scope.type === scope.type && record.scope.id === scope.id))
      .filter((record) => !query.kind || record.kind === query.kind)
      .filter((record) => tags.length === 0 || tags.some((tag) => record.tags.includes(tag)))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, limit)
      .map((record) => ({
        ...record,
        content: record.content.slice(0, MAX_CONTENT),
        provenance: { ...record.provenance },
      }));
  }

  function listVersions(id) {
    const root = String(id ?? '');
    const chain = [];
    const seen = new Set();
    let cursor = records.get(root) ?? null;
    while (cursor && !seen.has(cursor.knowledgeId)) {
      seen.add(cursor.knowledgeId);
      chain.push({ knowledgeId: cursor.knowledgeId, version: cursor.version, status: cursor.status, supersedes: cursor.supersedes ?? null });
      cursor = cursor.supersedes ? (records.get(cursor.supersedes) ?? null) : null;
    }
    return chain;
  }

  function exportState() {
    return { schema_version: LEARNING_SCHEMA, records: [...records.values()].map((record) => ({ ...record })) };
  }

  function importState(snapshot) {
    if (!snapshot || snapshot.schema_version !== LEARNING_SCHEMA || !Array.isArray(snapshot.records)) {
      throw new ContractError('INVALID_SNAPSHOT', 'snapshot tidak valid');
    }
    records.clear();
    for (const record of snapshot.records) put(record);
    return records.size;
  }

  return { put, get, retrieve, listVersions, exportState, importState, size: () => records.size };
}
