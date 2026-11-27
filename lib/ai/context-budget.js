'use strict';

// NEXUS context budgeting — deterministic, dependency-free, fail-closed.
// Purpose: keep every request to a provider inside a hard internal token budget
// so a 8,000 TPM limit cannot be hit by a 14k-token prompt. No tokenizer package
// is added; estimation is a documented conservative heuristic (see docs).

const DEFAULT_BUDGET_TOKENS = 6000;
const MIN_BUDGET_TOKENS = 800;
const MAX_BUDGET_TOKENS = 6000;
const CHARS_PER_TOKEN = 4; // conservative for Indonesian prose + JSON punctuation
const TRUNCATION_MARKER = ' [konteks dipotong aman]';
const SECRET_RE = /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9/+=._-]{12,})/gi;

function redactSecrets(value) {
  return String(value ?? '').replace(SECRET_RE, '[redacted]');
}

function estimateTokens(value) {
  if (value === null || value === undefined) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(String(text ?? '').length / CHARS_PER_TOKEN);
}

function clampBudget(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BUDGET_TOKENS;
  return Math.max(MIN_BUDGET_TOKENS, Math.min(MAX_BUDGET_TOKENS, Math.floor(parsed)));
}

function budgetFromEnv(env = process.env) {
  return clampBudget(env.NEXUS_CONTEXT_TOKEN_BUDGET ?? DEFAULT_BUDGET_TOKENS);
}

// Never cut in the middle of a line/word: keep the beginning and the end,
// insert an explicit marker, and keep the result shorter than the input.
function truncateSafe(text, maxChars) {
  const source = String(text ?? '');
  const limit = Math.max(24, Math.floor(maxChars));
  if (source.length <= limit) return source;
  const marker = TRUNCATION_MARKER;
  const room = limit - marker.length;
  if (room < 16) return source.slice(0, limit);
  const headTarget = Math.ceil(room * 0.6);
  const tailTarget = room - headTarget;
  let head = source.slice(0, headTarget);
  const headCut = head.lastIndexOf('\n');
  if (headCut > headTarget * 0.5) head = head.slice(0, headCut);
  else {
    const wordCut = head.lastIndexOf(' ');
    if (wordCut > headTarget * 0.6) head = head.slice(0, wordCut);
  }
  let tail = source.slice(source.length - tailTarget);
  const tailCut = tail.indexOf('\n');
  if (tailCut >= 0 && tailCut < tailTarget * 0.5) tail = tail.slice(tailCut + 1);
  else {
    const wordCut = tail.indexOf(' ');
    if (wordCut >= 0 && wordCut < tailTarget * 0.4) tail = tail.slice(wordCut + 1);
  }
  const result = `${head}${marker}${tail}`;
  return result.length <= limit ? result : result.slice(0, limit);
}

// Structural JSON compaction: always returns valid JSON, never blind string cuts.
function compactJson(value, limits = {}) {
  const maxArrayItems = Math.max(1, limits.maxArrayItems ?? 8);
  const maxKeys = Math.max(1, limits.maxKeys ?? 24);
  const maxStringChars = Math.max(40, limits.maxStringChars ?? 1600);
  const maxDepth = Math.max(1, limits.maxDepth ?? 4);

  function walk(node, depth) {
    if (typeof node === 'string') return redactSecrets(truncateSafe(node, maxStringChars));
    if (typeof node === 'number' || typeof node === 'boolean' || node === null) return node;
    if (depth >= maxDepth) return '[level dibatasi]';
    if (Array.isArray(node)) {
      const kept = node.slice(0, maxArrayItems).map((item) => walk(item, depth + 1));
      if (node.length > maxArrayItems) kept.push(`[+${node.length - maxArrayItems} item dihilangkan]`);
      return kept;
    }
    if (node && typeof node === 'object') {
      const out = {};
      let used = 0;
      for (const [key, item] of Object.entries(node)) {
        if (used >= maxKeys) { out.__omitted__ = `[+${Object.keys(node).length - used} field dihilangkan]`; break; }
        out[key] = walk(item, depth + 1);
        used += 1;
      }
      return out;
    }
    return '[tipe tidak didukung]';
  }
  return walk(value, 0);
}

// Task-based selector: only issue, file, contract, decision and test-result
// items relevant to the task are admitted. Security/hard-constraint items are
// protected and always kept (but still bounded by a safe truncation).
function selectContext({ task = '', catalog = [], budget = DEFAULT_BUDGET_TOKENS, kinds = null } = {}) {
  const cap = clampBudget(budget);
  const taskText = String(task ?? '').toLowerCase();
  const keywords = [...new Set(taskText.split(/[^a-z0-9]+/).filter((word) => word.length >= 3))];
  const allowedKinds = kinds ? new Set(kinds) : null;

  const scored = catalog.map((item, index) => {
    const text = `${item.title ?? ''} ${item.content ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase();
    const tagHits = (item.tags ?? []).filter((tag) => taskText.includes(String(tag).toLowerCase())).length;
    const wordHits = keywords.filter((word) => text.includes(word)).length;
    const score = tagHits * 6 + wordHits + (item.priority === 'critical' ? 100 : item.priority === 'high' ? 10 : 0);
    return { item, index, score, critical: item.priority === 'critical', tokens: estimateTokens(item.content ?? '') };
  }).filter((row) => !allowedKinds || allowedKinds.has(row.item.kind))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen = [];
  const omitted = [];
  let used = 0;
  for (const row of scored) {
    if (row.critical) {
      const allowance = Math.min(row.tokens, Math.max(200, cap - used));
      const content = truncateSafe(row.item.content ?? '', allowance * CHARS_PER_TOKEN);
      chosen.push({ ...row.item, content, tokens: estimateTokens(content), protected: true });
      used += estimateTokens(content);
      continue;
    }
    if (row.score <= 0) { omitted.push({ id: row.item.id, reason: 'not_relevant' }); continue; }
    const remaining = cap - used;
    if (remaining <= 0) { omitted.push({ id: row.item.id, reason: 'budget_exhausted' }); continue; }
    if (row.tokens > remaining) {
      const content = truncateSafe(row.item.content ?? '', remaining * CHARS_PER_TOKEN);
      chosen.push({ ...row.item, content, tokens: estimateTokens(content), truncated: true });
      used += estimateTokens(content);
      omitted.push({ id: row.item.id, reason: 'budget_truncated' });
      continue;
    }
    chosen.push({ ...row.item, tokens: row.tokens });
    used += row.tokens;
  }
  chosen.sort((a, b) => a.index - b.index);
  return {
    items: chosen.map(({ index, ...rest }) => rest),
    omitted,
    estimated_tokens: used,
    budget_tokens: cap,
    within_budget: used <= cap,
  };
}

// Applies the budget to provider messages. System messages are protected
// instructions; user payloads are JSON-compacted before any truncation.
function budgetMessages(messages, { budget = DEFAULT_BUDGET_TOKENS, onBudget } = {}) {
  const cap = clampBudget(budget);
  const report = { budget_tokens: cap, before_tokens: 0, after_tokens: 0, compacted: [], truncated: [] };
  const input = Array.isArray(messages) ? messages : [];
  report.before_tokens = estimateTokens(input);
  const protectedTokens = input.filter((m) => m.role === 'system').reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const userSlots = input.filter((m) => m.role !== 'system');
  const available = Math.max(0, cap - protectedTokens);
  const share = userSlots.length ? Math.floor(available / userSlots.length) : 0;

  const output = input.map((message) => {
    if (message.role === 'system') return message;
    const allowance = Math.max(MIN_BUDGET_TOKENS / 2, share);
    let compacted;
    const original = message.content;
    let parsed;
    try { parsed = JSON.parse(original); } catch { parsed = null; }
    if (parsed && typeof parsed === 'object') {
      compacted = JSON.stringify(compactJson(parsed, { maxStringChars: Math.max(400, allowance * CHARS_PER_TOKEN / 3) }));
      if (compacted.length < String(original).length) report.compacted.push(message.role);
    } else {
      compacted = truncateSafe(String(original ?? ''), allowance * CHARS_PER_TOKEN);
      if (compacted !== original) report.truncated.push(message.role);
    }
    return { ...message, content: compacted };
  });
  report.after_tokens = estimateTokens(output);
  report.within_budget = report.after_tokens <= cap;
  if (typeof onBudget === 'function') {
    try { onBudget(report); } catch { /* observability must never break a request */ }
  }
  return { messages: output, report };
}

// Compact, factual handoff usable across sessions. No conversation archive.
function buildHandoffSummary({ identity = 'RADAR NEXUS', decisions = [], evidence = [], blockers = [], next = [], limit = 2400 } = {}) {
  const section = (title, values, max) => {
    const rows = values.filter((v) => typeof v === 'string' && v.trim()).slice(0, max)
      .map((v) => `- ${redactSecrets(v.trim()).replace(/\s+/g, ' ').slice(0, 220)}`);
    return rows.length ? `\n${title}\n${rows.join('\n')}` : '';
  };
  const text = [
    `Identitas: ${identity}`,
    'Batas tetap: Rp0; tanpa paid provider/trial/Dev Tier; tanpa worker/scheduler; tanpa live order/withdrawal; tanpa klaim LIVE atau always-on.',
    `Dibuat: ${new Date().toISOString()}`,
    section('Keputusan', decisions, 5),
    section('Bukti tes', evidence, 5),
    section('Blocker', blockers, 3),
    section('NEXT TASK', next, 3),
  ].join('\n');
  return truncateSafe(text, limit);
}

module.exports = {
  DEFAULT_BUDGET_TOKENS, MIN_BUDGET_TOKENS, MAX_BUDGET_TOKENS, CHARS_PER_TOKEN,
  redactSecrets, estimateTokens, clampBudget, budgetFromEnv, truncateSafe,
  compactJson, selectContext, budgetMessages, buildHandoffSummary,
};
