/** Local NEXUS sessions. Stored outside the repository; never a chat archive in Git. */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MAX_SESSIONS = 10;
const MAX_MESSAGES = 100;
const MAX_CONTENT = 4000;
const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/+=._-]{12,})/gi;

export function redact(value) {
  return String(value ?? '').replace(SECRET_RE, '[redacted]');
}

export function createSessionStore(directory = join(homedir(), '.radar-nexus')) {
  const filePath = join(directory, 'sessions.json');

  async function readAll() {
    try {
      const value = JSON.parse(await readFile(filePath, 'utf8'));
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  async function writeAll(records) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(filePath, JSON.stringify(records, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  }

  async function list() {
    return Object.keys(await readAll()).sort();
  }

  async function create() {
    const records = await readAll();
    const now = new Date().toISOString();
    const record = {
      schema_version: 'radar-nexus-client.v1',
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      messages: [],
    };
    records[record.id] = record;
    const ids = Object.keys(records).sort();
    for (const extra of ids.slice(0, Math.max(0, ids.length - MAX_SESSIONS))) delete records[extra];
    await writeAll(records);
    return record;
  }

  async function get(id) {
    const record = (await readAll())[id];
    if (!record) throw new Error(`Sesi tidak ditemukan: ${id}`);
    return record;
  }

  async function append(id, message) {
    const records = await readAll();
    const record = records[id];
    if (!record) throw new Error(`Sesi tidak ditemukan: ${id}`);
    const safe = {
      role: message.role,
      content: redact(message.content).slice(0, MAX_CONTENT),
      at: new Date().toISOString(),
    };
    const updated = { ...record, messages: [...record.messages, safe].slice(-MAX_MESSAGES), updated_at: safe.at };
    records[id] = updated;
    await writeAll(records);
    return updated;
  }

  async function clear(id) {
    const records = await readAll();
    delete records[id];
    await writeAll(records);
  }

  return { directory, list, create, get, append, clear };
}
