/** RADAR-issued typed contracts for NEXUS knowledge/skill learning.
 * All external model output is untrusted data, never canonical truth. */
export const LEARNING_SCHEMA = 'radar-nexus-learning.v1' as const;
export const GRANT_SCHEMA = 'radar-capability-grant.v1' as const;

export type Sensitivity = 'public' | 'internal' | 'confidential';
export type SourceKind = 'grok' | 'deepseek' | 'model' | 'repository' | 'test' | 'document';
export type KnowledgeKind = 'fact' | 'procedure' | 'skill' | 'decision';
export type RecordStatus = 'proposed' | 'approved' | 'rejected' | 'superseded' | 'archived';
export type Verdict = 'approve' | 'reject' | 'needs_review';

export interface Claim {
  readonly text: string;
  readonly evidenceRef?: string;
}

export interface Provenance {
  readonly sourceId: string;
  readonly sourceKind: SourceKind;
  readonly provider?: string;
  readonly model?: string;
  readonly modelVersion?: string;
  readonly uri: string;
  readonly revision: string;
  readonly observedAt: string;
  readonly extractedBy: string;
  readonly method: string;
  readonly sensitivity: Sensitivity;
  readonly license?: string;
  readonly claims: readonly Claim[];
}

export interface Evidence {
  readonly kind: 'test' | 'repository_check' | 'source_comparison' | 'manual';
  readonly ref: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface Evaluation {
  readonly schema_version: typeof LEARNING_SCHEMA;
  readonly evaluationId: string;
  readonly acquisitionId: string;
  readonly correctness: number;
  readonly grounding: number;
  readonly completeness: number;
  readonly safety: number;
  readonly reproducibility: number;
  readonly verdict: Verdict;
  readonly reasons: readonly string[];
  readonly evidence: readonly Evidence[];
  readonly evaluatedAt: string;
  readonly evaluator: string;
}

export interface ModelResponse {
  readonly schema_version: typeof LEARNING_SCHEMA;
  readonly taskId: string;
  readonly provider: string;
  readonly model: string;
  readonly modelVersion: string;
  readonly text: string;
  readonly claims: readonly Claim[];
  readonly observedAt: string;
  readonly flags: readonly string[];
}

export interface LearningTask {
  readonly taskId: string;
  readonly instruction: string;
  readonly sourceRef: string;
  readonly scope: { readonly type: 'project' | 'division' | 'agent' | 'task'; readonly id: string };
  readonly sensitivity: Sensitivity;
  readonly correlationId: string;
}

export interface KnowledgeRecord {
  readonly schema_version: typeof LEARNING_SCHEMA;
  readonly knowledgeId: string;
  readonly kind: KnowledgeKind;
  readonly title: string;
  readonly content: string;
  readonly scope: { readonly type: 'project' | 'division' | 'agent' | 'task'; readonly id: string };
  readonly status: RecordStatus;
  readonly version: number;
  readonly supersedes?: string;
  readonly provenance: Provenance;
  readonly evaluation?: Evaluation;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly retentionUntil: string;
}

export interface RetrievalQuery {
  readonly scope: { readonly type: 'project' | 'division' | 'agent' | 'task'; readonly id: string };
  readonly tags?: readonly string[];
  readonly kind?: KnowledgeKind;
  readonly status: RecordStatus;
  readonly limit: number;
}

export type GrantAction = 'knowledge.read' | 'knowledge.propose' | 'knowledge.approve' | 'repo.read' | 'repo.patch.propose';

export interface CapabilityGrant {
  readonly schema_version: typeof GRANT_SCHEMA;
  readonly issuer: 'RADAR';
  readonly subject: string;
  readonly role: string;
  readonly actions: readonly GrantAction[];
  readonly resources: readonly string[];
  readonly autonomyStage: 0 | 1 | 2;
  readonly expiresAt: string;
  readonly correlationId: string;
  readonly policyRevision: string;
  readonly approvalRequired: boolean;
}

export interface AccessDecision {
  readonly allowed: boolean;
  readonly reason: string;
}

export class ContractError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ContractError';
    this.code = code;
  }
}

const SENSITIVITIES: readonly Sensitivity[] = ['public', 'internal', 'confidential'];
const SOURCE_KINDS: readonly SourceKind[] = ['grok', 'deepseek', 'model', 'repository', 'test', 'document'];
const KNOWLEDGE_KINDS: readonly KnowledgeKind[] = ['fact', 'procedure', 'skill', 'decision'];
const STATUSES: readonly RecordStatus[] = ['proposed', 'approved', 'rejected', 'superseded', 'archived'];
const ACTIONS: readonly GrantAction[] = ['knowledge.read', 'knowledge.propose', 'knowledge.approve', 'repo.read', 'repo.patch.propose'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, code: string, max = 16000): string {
  if (typeof value !== 'string') throw new ContractError(code, 'field harus string');
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) throw new ContractError(code, `panjang field wajib 1..${max}`);
  return trimmed;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], code: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new ContractError(code, 'nilai tidak diizinkan');
  return value as T;
}

export function validateProvenance(value: unknown): Provenance {
  if (!isObject(value)) throw new ContractError('INVALID_PROVENANCE', 'provenance harus object');
  const claimsRaw = value.claims;
  if (!Array.isArray(claimsRaw) || claimsRaw.length < 1 || claimsRaw.length > 10) {
    throw new ContractError('INVALID_CLAIMS', 'claims wajib 1..10 butir');
  }
  const claims: Claim[] = claimsRaw.map((item, index) => {
    if (!isObject(item)) throw new ContractError('INVALID_CLAIM', `claim ${index} bukan object`);
    return { text: text(item.text, 'INVALID_CLAIM', 500), ...(typeof item.evidenceRef === 'string' ? { evidenceRef: text(item.evidenceRef, 'INVALID_CLAIM', 200) } : {}) };
  });
  return {
    sourceId: text(value.sourceId, 'INVALID_PROVENANCE', 128),
    sourceKind: oneOf(value.sourceKind, SOURCE_KINDS, 'INVALID_SOURCE_KIND'),
    uri: text(value.uri, 'INVALID_PROVENANCE', 512),
    revision: text(value.revision, 'INVALID_PROVENANCE', 128),
    observedAt: text(value.observedAt, 'INVALID_PROVENANCE', 40),
    extractedBy: text(value.extractedBy, 'INVALID_PROVENANCE', 96),
    method: text(value.method, 'INVALID_PROVENANCE', 96),
    sensitivity: oneOf(value.sensitivity, SENSITIVITIES, 'INVALID_SENSITIVITY'),
    claims,
    ...(typeof value.provider === 'string' ? { provider: text(value.provider, 'INVALID_PROVENANCE', 64) } : {}),
    ...(typeof value.model === 'string' ? { model: text(value.model, 'INVALID_PROVENANCE', 64) } : {}),
    ...(typeof value.modelVersion === 'string' ? { modelVersion: text(value.modelVersion, 'INVALID_PROVENANCE', 64) } : {}),
    ...(typeof value.license === 'string' ? { license: text(value.license, 'INVALID_PROVENANCE', 64) } : {}),
  };
}

export function validateTask(value: unknown): LearningTask {
  if (!isObject(value) || !isObject(value.scope)) throw new ContractError('INVALID_TASK', 'task/scope harus object');
  return {
    taskId: text(value.taskId, 'INVALID_TASK', 96),
    instruction: text(value.instruction, 'INVALID_TASK', 2000),
    sourceRef: text(value.sourceRef, 'INVALID_TASK', 512),
    scope: {
      type: oneOf(value.scope.type, ['project', 'division', 'agent', 'task'] as const, 'INVALID_SCOPE'),
      id: text(value.scope.id, 'INVALID_SCOPE', 96),
    },
    sensitivity: oneOf(value.sensitivity, SENSITIVITIES, 'INVALID_SENSITIVITY'),
    correlationId: text(value.correlationId, 'INVALID_TASK', 96),
  };
}

export function validateGrant(value: unknown): CapabilityGrant {
  if (!isObject(value)) throw new ContractError('INVALID_GRANT', 'grant harus object');
  if (value.issuer !== 'RADAR') throw new ContractError('INVALID_ISSUER', 'hanya RADAR yang menerbitkan grant');
  if (typeof value.subject === 'string' && value.subject === 'RADAR') {
    throw new ContractError('SELF_GRANT_DENIED', 'RADAR tidak boleh menjadi subject grant');
  }
  const actionsRaw = value.actions;
  if (!Array.isArray(actionsRaw) || actionsRaw.length < 1) throw new ContractError('INVALID_ACTIONS', 'actions wajib tidak kosong');
  const actions = actionsRaw.map((item) => oneOf(item, ACTIONS, 'INVALID_ACTION'));
  const resourcesRaw = value.resources;
  if (!Array.isArray(resourcesRaw) || resourcesRaw.length < 1) throw new ContractError('INVALID_RESOURCES', 'resources wajib tidak kosong');
  const stage = value.autonomyStage;
  if (stage !== 0 && stage !== 1 && stage !== 2) throw new ContractError('INVALID_AUTONOMY', 'autonomyStage wajib 0..2');
  const expiresAt = text(value.expiresAt, 'INVALID_GRANT', 40);
  if (Number.isNaN(Date.parse(expiresAt))) throw new ContractError('INVALID_GRANT', 'expiresAt bukan timestamp');
  return {
    schema_version: GRANT_SCHEMA,
    issuer: 'RADAR',
    subject: text(value.subject, 'INVALID_GRANT', 96),
    role: text(value.role, 'INVALID_GRANT', 64),
    actions: [...new Set(actions)],
    resources: resourcesRaw.map((item) => text(item, 'INVALID_RESOURCES', 160)),
    autonomyStage: stage,
    expiresAt,
    correlationId: text(value.correlationId, 'INVALID_GRANT', 96),
    policyRevision: text(value.policyRevision, 'INVALID_GRANT', 64),
    approvalRequired: value.approvalRequired === true,
  };
}

export function validateKnowledgeRecord(value: unknown): KnowledgeRecord {
  if (!isObject(value) || !isObject(value.scope)) throw new ContractError('INVALID_KNOWLEDGE', 'record/scope harus object');
  const version = value.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ContractError('INVALID_VERSION', 'version wajib integer >= 1');
  }
  const retentionUntil = text(value.retentionUntil, 'INVALID_KNOWLEDGE', 40);
  if (Number.isNaN(Date.parse(retentionUntil))) throw new ContractError('INVALID_KNOWLEDGE', 'retentionUntil bukan timestamp');
  return {
    schema_version: LEARNING_SCHEMA,
    knowledgeId: text(value.knowledgeId, 'INVALID_KNOWLEDGE', 128),
    kind: oneOf(value.kind, KNOWLEDGE_KINDS, 'INVALID_KNOWLEDGE_KIND'),
    title: text(value.title, 'INVALID_KNOWLEDGE', 160),
    content: text(value.content, 'INVALID_KNOWLEDGE', 16000),
    scope: {
      type: oneOf(value.scope.type, ['project', 'division', 'agent', 'task'] as const, 'INVALID_SCOPE'),
      id: text(value.scope.id, 'INVALID_SCOPE', 96),
    },
    status: oneOf(value.status, STATUSES, 'INVALID_STATUS'),
    version,
    provenance: validateProvenance(value.provenance),
    tags: Array.isArray(value.tags) ? value.tags.slice(0, 12).map((item) => text(item, 'INVALID_TAG', 40)) : [],
    createdAt: text(value.createdAt, 'INVALID_KNOWLEDGE', 40),
    updatedAt: text(value.updatedAt, 'INVALID_KNOWLEDGE', 40),
    retentionUntil,
    ...(typeof value.supersedes === 'string' ? { supersedes: text(value.supersedes, 'INVALID_KNOWLEDGE', 128) } : {}),
  };
}

export const __all__ = [
  'LEARNING_SCHEMA', 'GRANT_SCHEMA', 'ContractError', 'validateProvenance',
  'validateTask', 'validateGrant', 'validateKnowledgeRecord',
] as const;
