/** NEXUS API client: the same HTTP contract used by the dashboard. */
import {
  NexusContractError, sanitizeAssistantText, validateCommandId, validateInstruction,
  type NexusChatResult, type NexusStatus, type ProviderState,
} from './contracts.mts';

export interface NexusClientOptions {
  readonly baseUrl: string;
  readonly adminToken: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly participants?: readonly string[];
}

const PARTICIPANT_ALLOWLIST = ['gemini', 'groq', 'openrouter', 'openai'] as const;

export interface NexusClient {
  readonly status: () => Promise<NexusStatus>;
  readonly chat: (instruction: string) => Promise<NexusChatResult>;
  readonly result: (commandId: string) => Promise<string>;
  readonly memorySummary: () => Promise<string>;
}

function join(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

export function createNexusClient(options: NexusClientOptions): NexusClient {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  if (!/^https?:\/\//.test(baseUrl)) throw new NexusContractError('INVALID_BASE_URL', 'base_url wajib http/https');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const adminConfigured = options.adminToken.length > 0;

  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(join(baseUrl, path), {
        ...init,
        signal: controller.signal,
        cache: 'no-store',
        headers: { accept: 'application/json', ...(init.headers ?? {}) },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function status(): Promise<NexusStatus> {
    let reachable = false;
    let providerState: ProviderState = adminConfigured ? 'unknown' : 'not_configured';
    let detail = adminConfigured ? 'ADMIN_TOKEN tersedia; status provider belum diverifikasi.' : 'ADMIN_TOKEN belum dikonfigurasi.';
    try {
      const health = await request('/api/health');
      reachable = health.ok;
      if (!health.ok) detail = `Server tidak sehat (HTTP ${health.status}).`;
    } catch {
      detail = 'Server RADAR tidak dapat dijangkau dari CLI ini.';
      providerState = 'unavailable';
    }
    if (reachable && adminConfigured) {
      try {
        const usage = await request('/api/ai/usage', { headers: { 'x-admin-token': options.adminToken } });
        if (usage.ok) {
          const payload = await usage.json() as { usage?: { providers?: Record<string, { status?: string }> } };
          const states = Object.values(payload.usage?.providers ?? {}).map((item) => item.status ?? '').filter(Boolean);
          if (states.some((value) => value === 'ACTIVE')) {
            providerState = 'available';
            detail = 'Provider teramati aktif oleh NEXUS Model Engine.';
          } else if (states.length > 0) {
            providerState = 'unavailable';
            detail = `Terakhir teramati: ${states.join(', ')}.`;
          }
        } else if (usage.status === 403) {
          providerState = 'not_configured';
          detail = 'ADMIN_TOKEN ditolak oleh server.';
        }
      } catch {
        providerState = 'unavailable';
        detail = 'Status provider tidak dapat dibaca.';
      }
    }
    return {
      schema_version: 'radar-nexus-client.v1',
      identity: 'RADAR NEXUS',
      base_url: baseUrl,
      admin_configured: adminConfigured,
      provider_state: providerState,
      provider_detail: detail,
      memory_available: reachable,
      model_is_proprietary: false,
    };
  }

  async function chat(instruction: string): Promise<NexusChatResult> {
    const text = validateInstruction(instruction);
    if (!adminConfigured) {
      return { kind: 'unavailable', status: 'not_configured', detail: 'ADMIN_TOKEN belum dikonfigurasi; percakapan distroknya. Atur NEXUS_ADMIN_TOKEN.' };
    }
    const requested = options.participants ?? PARTICIPANT_ALLOWLIST;
    const participants = requested.filter((item): item is (typeof PARTICIPANT_ALLOWLIST)[number] =>
      (PARTICIPANT_ALLOWLIST as readonly string[]).includes(item));
    try {
      const response = await request('/api/ai/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': options.adminToken },
        body: JSON.stringify({ instruction: text, participants: participants.length ? participants : [...PARTICIPANT_ALLOWLIST] }),
      });
      if (response.status === 403) return { kind: 'unavailable', status: 'not_configured', detail: 'ADMIN_TOKEN ditolak server.' };
      if (response.status === 503) return { kind: 'unavailable', status: 'unavailable', detail: 'NEXUS Model Engine tidak tersedia.' };
      if (!response.ok) return { kind: 'unavailable', status: 'unavailable', detail: `HTTP ${response.status}.` };
      const payload = await response.json() as { command_id?: unknown; status?: unknown };
      return { kind: 'accepted', command_id: validateCommandId(payload.command_id), status: 'started' };
    } catch {
      return { kind: 'unavailable', status: 'unavailable', detail: 'Gagal menghubungi NEXUS Core.' };
    }
  }

  async function result(commandId: string): Promise<string> {
    const id = validateCommandId(commandId);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt > 0) await new Promise((done) => setTimeout(done, 3000));
      try {
        const response = await request('/api/ai/workspace');
        if (!response.ok) continue;
        const payload = await response.json() as {
          workspace?: { last?: { command_id?: unknown; final?: { summary?: unknown } } }
        };
        const last = payload.workspace?.last;
        if (last?.command_id === id) {
          return sanitizeAssistantText(last.final?.summary) || 'Rapat selesai tanpa ringkasan teks.';
        }
      } catch {
        // Keep polling; the server may be restarting.
      }
    }
    return `Perintah ${id} masih diproses. Lihat hasil di dashboard RADAR AI → AI Workspace.`;
  }

  async function memorySummary(): Promise<string> {
    try {
      const response = await request('/api/ai/workspace');
      if (!response.ok) return 'Ringkasan NEXUS Memory belum tersedia.';
      const payload = await response.json() as { workspace?: { last?: { final?: { summary?: unknown } } } };
      return sanitizeAssistantText(payload.workspace?.last?.final?.summary) || 'Belum ada ringkasan rapat tersimpan.';
    } catch {
      return 'NEXUS Memory tidak dapat dijangkau.';
    }
  }

  return { status, chat, result, memorySummary };
}

export const __all__ = ['createNexusClient', 'NexusClient', 'NexusClientOptions'] as const;
