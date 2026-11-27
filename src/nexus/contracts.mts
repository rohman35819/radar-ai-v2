/** Shared NEXUS client contract. Mirrors the dashboard API contract; no second backend. */
export const NEXUS_SCHEMA = 'radar-nexus-client.v1' as const;
export const PROVIDER_STATES = ['available', 'unavailable', 'not_configured', 'unknown'] as const;
export type ProviderState = (typeof PROVIDER_STATES)[number];

export interface NexusStatus {
  readonly schema_version: typeof NEXUS_SCHEMA;
  readonly identity: 'RADAR NEXUS';
  readonly base_url: string;
  readonly admin_configured: boolean;
  readonly provider_state: ProviderState;
  readonly provider_detail: string;
  readonly memory_available: boolean;
  readonly model_is_proprietary: false;
}

export interface NexusChatRequest {
  readonly instruction: string;
  readonly participants: readonly string[];
}

export interface NexusChatAccepted {
  readonly kind: 'accepted';
  readonly command_id: string;
  readonly status: 'started';
}

export interface NexusChatUnavailable {
  readonly kind: 'unavailable';
  readonly status: ProviderState;
  readonly detail: string;
}

export type NexusChatResult = NexusChatAccepted | NexusChatUnavailable;

export interface SessionMessage {
  readonly role: 'bos' | 'nexus' | 'system';
  readonly content: string;
  readonly at: string;
}

export interface SessionRecord {
  readonly schema_version: typeof NEXUS_SCHEMA;
  readonly id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly messages: readonly SessionMessage[];
}

export class NexusContractError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'NexusContractError';
    this.code = code;
  }
}

const ID_RE = /^[A-Za-z0-9._:-]{1,96}$/;

export function validateInstruction(value: unknown): string {
  if (typeof value !== 'string') throw new NexusContractError('INVALID_INSTRUCTION', 'Instruksi harus string');
  const text = value.trim();
  if (text.length < 1 || text.length > 2000) throw new NexusContractError('INVALID_LENGTH', 'Instruksi wajib 1..2000 karakter');
  if (/(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/+=._-]{12,})/i.test(text)) {
    throw new NexusContractError('SECRET_LIKE_INPUT', 'Instruksi mengandung pola secret dan ditolak');
  }
  return text;
}

export function validateCommandId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 3 || value.length > 128 || !ID_RE.test(value)) {
    throw new NexusContractError('INVALID_COMMAND_ID', 'command_id tidak valid');
  }
  return value;
}

export function sanitizeAssistantText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
}

export const __all__ = [
  'NEXUS_SCHEMA', 'PROVIDER_STATES', 'NexusContractError', 'NexusStatus',
  'NexusChatRequest', 'NexusChatResult', 'SessionRecord', 'validateInstruction',
  'validateCommandId', 'sanitizeAssistantText',
] as const;
