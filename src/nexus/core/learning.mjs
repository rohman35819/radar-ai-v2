/** Deterministic ingest -> provenance -> evaluate -> curate -> store -> retrieve.
 * External model output is always untrusted; approval is explicit and deny-by-default. */
import { createHash } from 'node:crypto';
import {
  LEARNING_SCHEMA, ContractError, validateTask, validateProvenance,
} from './contracts.mts';
import { assertCapability } from './capability.mjs';

const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/+=._-]{12,})/gi;
const INJECTION_RE = /(ignore (all )?(previous|prior) instructions|abaikan (semua )?instruksi (sebelumnya|atasan)|you are now|system prompt|jangan ikuti instruksi| keluar dari peran)/i;
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;

export function redact(value) {
  return String(value ?? '').replace(SECRET_RE, '[redacted]');
}

function tokens(text) {
  return new Set(String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((word) => word.length >= 3));
}

function overlap(claim, facts) {
  const a = tokens(claim);
  if (a.size === 0) return 0;
  const b = tokens(facts);
  let hits = 0;
  for (const word of a) if (b.has(word)) hits += 1;
  return Math.round((hits / a.size) * 100);
}

export function ingest({ task, provider, clock = () => new Date(), acquisitionId }) {
  const valid = validateTask(task);
  if (!provider || typeof provider.complete !== 'function') throw new ContractError('PROVIDER_MISSING', 'provider tidak tersedia');
  const response = provider.complete(valid);
  if (!response || response.schema_version !== LEARNING_SCHEMA || response.taskId !== valid.taskId) {
    throw new ContractError('INVALID_MODEL_RESPONSE', 'respons provider tidak sesuai kontrak');
  }
  if (typeof response.text !== 'string' || response.text.length < 1 || response.text.length > 16000) {
    throw new ContractError('INVALID_MODEL_RESPONSE', 'text wajib 1..16000 karakter');
  }
  if (!Array.isArray(response.claims) || response.claims.length < 1 || response.claims.length > 10) {
    throw new ContractError('INVALID_CLAIMS', 'claims wajib 1..10');
  }
  if (!response.provenance) throw new ContractError('MISSING_PROVENANCE', 'provenance wajib ada');
  const provenance = validateProvenance(response.provenance);
  if (provenance.sensitivity === 'confidential' && valid.sensitivity !== 'confidential') {
    throw new ContractError('SENSITIVITY_DENIED', 'konten confidential tidak boleh disimpan di knowledge umum');
  }

  const flags = [...(Array.isArray(response.flags) ? response.flags : [])];
  if (INJECTION_RE.test(response.text)) flags.push('PROMPT_INJECTION_SUSPECTED');
  if (SECRET_RE.test(response.text)) flags.push('SECRET_LIKE_CONTENT');
  SECRET_RE.lastIndex = 0;
  const safeText = redact(response.text.replace(CONTROL_RE, ' '));
  const claims = response.claims.map((claim) => {
    if (typeof claim?.text !== 'string' || claim.text.length < 1) throw new ContractError('INVALID_CLAIM', 'claim kosong');
    return { text: redact(claim.text.replace(CONTROL_RE, ' ')).slice(0, 500), ...(claim.evidenceRef ? { evidenceRef: redact(claim.evidenceRef).slice(0, 200) } : {}) };
  });
  const id = acquisitionId || `acq_${createHash('sha256').update(`${valid.taskId}:${provenance.revision}`).digest('hex').slice(0, 16)}`;
  return Object.freeze({
    acquisitionId: id,
    task: valid,
    provider: String(response.provider ?? 'unknown'),
    model: String(response.model ?? 'unknown'),
    modelVersion: String(response.modelVersion ?? 'unknown'),
    text: safeText,
    claims,
    provenance,
    flags: Object.freeze([...new Set(flags)]),
    evidence: Array.isArray(response.evidence) ? response.evidence.slice(0, 8) : [],
    observedAt: clock().toISOString(),
  });
}

export function evaluate({ acquisition, facts = [], clock = () => new Date(), evaluationId }) {
  if (!acquisition || !acquisition.provenance) throw new ContractError('INVALID_ACQUISITION', 'acquisition tidak valid');
  const factText = Array.isArray(facts) ? facts.join('\n') : '';
  const grounding = Math.round(acquisition.claims.reduce((sum, claim) => sum + overlap(claim.text, factText), 0) / acquisition.claims.length);
  const suspicious = acquisition.flags.includes('PROMPT_INJECTION_SUSPECTED') || acquisition.flags.includes('SECRET_LIKE_CONTENT');
  const safety = suspicious ? 0 : 100;
  const reproducibility = acquisition.evidence.length > 0 ? 100 : 40;
  const completeness = Math.min(100, 60 + acquisition.claims.length * 10);
  const correctness = grounding;
  const scores = { correctness, grounding, completeness, safety, reproducibility };
  const reasons = [];
  if (suspicious) reasons.push(`flag berbahaya: ${acquisition.flags.join(', ')}`);
  if (grounding < 50) reasons.push('klaim tidak bersandar pada fakta lokal yang tersedia');
  if (reproducibility < 100) reasons.push('tidak ada bukti reproduksi yang disertakan');
  let verdict = 'approve';
  if (safety === 0 || grounding < 50) verdict = 'reject';
  else if (Object.values(scores).some((value) => value < 60)) verdict = 'needs_review';
  if (verdict === 'approve') reasons.push('semua klaim terverifikasi terhadap fakta dan bukti lokal');

  return Object.freeze({
    schema_version: LEARNING_SCHEMA,
    evaluationId: evaluationId || `eval_${createHash('sha256').update(acquisition.acquisitionId).digest('hex').slice(0, 12)}`,
    acquisitionId: acquisition.acquisitionId,
    ...scores,
    verdict,
    reasons: Object.freeze(reasons),
    evidence: Object.freeze(acquisition.evidence.map((item) => ({
      kind: ['test', 'repository_check', 'source_comparison', 'manual'].includes(item?.kind) ? item.kind : 'manual',
      ref: redact(item?.ref ?? '').slice(0, 200),
      passed: Boolean(item?.passed),
      detail: redact(item?.detail ?? '').slice(0, 300),
    }))),
    evaluatedAt: clock().toISOString(),
    evaluator: 'radar-deterministic-evaluator-v1',
  });
}

export function curate({ acquisition, evaluation, decision = 'reject', clock = () => new Date(), knowledgeId }) {
  const approved = evaluation.verdict === 'approve' && decision === 'approve';
  const status = approved ? 'approved' : 'rejected';
  const title = redact(acquisition.claims[0]?.text ?? acquisition.task.instruction).slice(0, 160);
  const now = clock().toISOString();
  const retention = new Date(Date.parse(now) + 365 * 24 * 3600 * 1000).toISOString();
  return {
    schema_version: LEARNING_SCHEMA,
    knowledgeId: knowledgeId || `kn_${createHash('sha256').update(`${acquisition.provenance.sourceId}:${acquisition.provenance.revision}:${title}`).digest('hex').slice(0, 16)}`,
    kind: acquisition.task.scope.type === 'task' ? 'procedure' : 'fact',
    title,
    content: acquisition.text,
    scope: acquisition.task.scope,
    status,
    version: 1,
    provenance: acquisition.provenance,
    evaluation,
    tags: [...new Set([acquisition.provider, acquisition.model, ...acquisition.flags])].slice(0, 12),
    createdAt: now,
    updatedAt: now,
    retentionUntil: retention,
  };
}

export function runLearningPipeline({ task, provider, facts = [], approver, store, grant, clock = () => new Date(), now = clock() }) {
  const resource = `knowledge:${task.scope.type}:${task.scope.id}`;
  assertCapability(grant, { action: 'knowledge.propose', resource, now, correlationId: task.correlationId });
  const acquisition = ingest({ task, provider, clock });
  const evaluation = evaluate({ acquisition, facts, clock });
  const decision = typeof approver === 'function' ? approver(acquisition, evaluation) : 'reject';
  const record = curate({ acquisition, evaluation, decision, clock });
  if (record.status === 'approved') {
    assertCapability(grant, { action: 'knowledge.approve', resource, now, correlationId: task.correlationId, approved: true });
  }
  const stored = store.put(record);
  return { acquisition, evaluation, record: stored.record, deduplicated: stored.deduplicated };
}
