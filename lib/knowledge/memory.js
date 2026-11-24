'use strict';

const BASE_COLUMNS = 'memory_id,memory_key,memory_type,scope_type,scope_id,title,summary,content,status,sensitivity,source_type,source_ref,source_revision,created_by,created_at,valid_from,valid_until,retention_until,supersedes_memory_id,confidence,task_id,artifact_refs';
const SECRET_PATTERN = /(?:sk-[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._-]{16,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/+=._-]{12,})/i;
const TYPES = new Set(['decision', 'fact', 'policy', 'task_handoff', 'execution_result', 'knowledge']);
const SCOPES = new Set(['project', 'division', 'agent', 'task']);
const SENSITIVITY = new Set(['public', 'internal', 'confidential']);
const SOURCES = new Set(['github', 'owner_instruction', 'external']);

class MemoryError extends Error {
  constructor(code) { super(code); this.name = 'MemoryError'; this.code = code; }
}

function requiredText(value, max, code) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new MemoryError(code);
  return value.trim();
}

function validateProposal(input, actor) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new MemoryError('MEMORY_INVALID_INPUT');
  const memoryType = requiredText(input.memoryType, 32, 'MEMORY_INVALID_TYPE');
  const scopeType = requiredText(input.scopeType, 16, 'MEMORY_INVALID_SCOPE');
  const scopeId = requiredText(input.scopeId, 96, 'MEMORY_INVALID_SCOPE');
  const sensitivity = requiredText(input.sensitivity || 'internal', 16, 'MEMORY_INVALID_SENSITIVITY');
  const sourceType = requiredText(input.sourceType, 24, 'MEMORY_INVALID_SOURCE');
  const sourceRef = requiredText(input.sourceRef, 512, 'MEMORY_SOURCE_REQUIRED');
  const sourceRevision = requiredText(input.sourceRevision, 128, 'MEMORY_SOURCE_REVISION_REQUIRED');
  const memoryKey = requiredText(input.memoryKey, 128, 'MEMORY_INVALID_KEY');
  const title = requiredText(input.title, 160, 'MEMORY_INVALID_TITLE');
  const summary = requiredText(input.summary, 1000, 'MEMORY_INVALID_SUMMARY');
  const content = requiredText(input.content, 16000, 'MEMORY_INVALID_CONTENT');
  const createdBy = requiredText(actor && actor.id, 96, 'MEMORY_ACTOR_REQUIRED');
  const retentionUntil = requiredText(input.retentionUntil, 40, 'MEMORY_RETENTION_REQUIRED');
  if (!TYPES.has(memoryType)) throw new MemoryError('MEMORY_INVALID_TYPE');
  if (!SCOPES.has(scopeType)) throw new MemoryError('MEMORY_INVALID_SCOPE');
  if (!SENSITIVITY.has(sensitivity)) throw new MemoryError('MEMORY_INVALID_SENSITIVITY');
  if (!SOURCES.has(sourceType)) throw new MemoryError('MEMORY_INVALID_SOURCE');
  const artifactRefs = input.artifactRefs === undefined ? [] : input.artifactRefs;
  if (!Array.isArray(artifactRefs) || artifactRefs.length > 20 || artifactRefs.some((v) => typeof v !== 'string' || !v.trim() || v.length > 512)) {
    throw new MemoryError('MEMORY_INVALID_ARTIFACT_REFS');
  }
  if (SECRET_PATTERN.test([memoryKey, scopeId, title, summary, content, sourceRef, sourceRevision, ...artifactRefs].join('\n'))) {
    throw new MemoryError('MEMORY_SECRET_LIKE_CONTENT_REJECTED');
  }
  if (!Number.isFinite(Date.parse(retentionUntil))) throw new MemoryError('MEMORY_INVALID_RETENTION');
  if (input.validFrom && !Number.isFinite(Date.parse(input.validFrom))) throw new MemoryError('MEMORY_INVALID_VALIDITY');
  if (input.validUntil && !Number.isFinite(Date.parse(input.validUntil))) throw new MemoryError('MEMORY_INVALID_VALIDITY');
  if (input.validFrom && input.validUntil && Date.parse(input.validUntil) < Date.parse(input.validFrom)) throw new MemoryError('MEMORY_INVALID_VALIDITY');
  const confidence = input.confidence === undefined || input.confidence === null ? null : Number(input.confidence);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new MemoryError('MEMORY_INVALID_CONFIDENCE');
  return {
    memory_key: memoryKey,
    memory_type: memoryType,
    scope_type: scopeType,
    scope_id: scopeId,
    title,
    summary,
    content,
    status: 'proposed',
    sensitivity,
    source_type: sourceType,
    source_ref: sourceRef,
    source_revision: sourceRevision,
    created_by: createdBy,
    retention_until: new Date(retentionUntil).toISOString(),
    valid_from: input.validFrom ? new Date(input.validFrom).toISOString() : null,
    valid_until: input.validUntil ? new Date(input.validUntil).toISOString() : null,
    supersedes_memory_id: input.supersedesMemoryId || null,
    confidence,
    task_id: input.taskId || null,
    artifact_refs: artifactRefs
  };
}

function createMemoryStore(options = {}) {
  const url = String(options.url || '').trim().replace(/\/$/, '');
  const key = String(options.serviceKey || '').trim();
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new MemoryError('MEMORY_INVALID_URL'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new MemoryError('MEMORY_INVALID_URL');
    }
  }
  const fetchImpl = options.fetchImpl || fetch;
  const table = options.table || 'radar_memory_records';
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(table)) throw new MemoryError('MEMORY_INVALID_TABLE');

  function endpoint(params) {
    if (!url || !key) throw new MemoryError('MEMORY_NOT_CONFIGURED');
    const query = new URLSearchParams(params);
    return url + '/rest/v1/' + table + '?' + query.toString();
  }

  async function request(method, params, body) {
    const response = await fetchImpl(endpoint(params), {
      method,
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(method === 'POST' ? { Prefer: 'return=representation' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new MemoryError('MEMORY_STORAGE_HTTP_' + response.status);
    if (method === 'GET') return response.json();
    return response.json();
  }

  function activeRecordParams() {
    const now = new Date().toISOString();
    return {
      retention_until: 'gt.' + now,
      and: '(or(valid_from.is.null,valid_from.lte.' + now + '),or(valid_until.is.null,valid_until.gte.' + now + '))'
    };
  }

  function scopeParams(scope) {
    if (!scope || !SCOPES.has(scope.type) || typeof scope.id !== 'string' || !scope.id.trim() || scope.id.length > 96) {
      throw new MemoryError('MEMORY_SCOPE_REQUIRED');
    }
    return { scope_type: 'eq.' + scope.type, scope_id: 'eq.' + scope.id };
  }

  return Object.freeze({
    async propose(input, actor) {
      const row = validateProposal(input, actor);
      const rows = await request('POST', { select: BASE_COLUMNS }, row);
      if (!Array.isArray(rows) || !rows[0]) throw new MemoryError('MEMORY_STORAGE_INVALID_RESPONSE');
      return rows[0];
    },

    async listProposals(scope, options = {}) {
      const limit = Math.max(1, Math.min(50, Math.floor(Number(options.limit) || 20)));
      const params = {
        select: BASE_COLUMNS,
        ...scopeParams(scope),
        ...activeRecordParams(),
        status: 'eq.proposed',
        sensitivity: 'in.(public,internal)',
        order: 'created_at.desc',
        limit: String(limit)
      };
      return request('GET', params);
    },

    async searchApproved(scope, query, options = {}) {
      const limit = Math.max(1, Math.min(50, Math.floor(Number(options.limit) || 20)));
      const params = {
        select: BASE_COLUMNS,
        ...scopeParams(scope),
        ...activeRecordParams(),
        status: 'eq.approved',
        sensitivity: 'in.(public,internal)',
        order: 'created_at.desc',
        limit: String(limit)
      };
      if (typeof query === 'string' && query.trim()) params.search_vector = 'wfts.' + query.trim().slice(0, 200);
      return request('GET', params);
    }
  });
}

module.exports = { createMemoryStore, validateProposal, MemoryError, SECRET_PATTERN };
