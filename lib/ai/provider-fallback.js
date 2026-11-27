'use strict';

// Fallback candidates are limited to providers already documented in this
// repository as usable at Rp0. They are NOT enabled automatically: activation
// requires an explicit owner decision and a configured server-side key.
// Paid models (OpenAI gpt-*, paid OpenRouter routes, trials, Dev Tier) are
// deliberately absent and are rejected by assertNoPaidFallback().
const FREE_CANDIDATES = Object.freeze([
  Object.freeze({
    provider: 'openrouter',
    model: 'openrouter/free',
    envKey: 'OPENROUTER_API_KEY',
    basis: 'Rute gratis `openrouter/free` yang sudah dipakai repo (RADAR_AI_SHARED_MEMORY.md).',
  }),
  Object.freeze({
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    envKey: 'GROQ_API_KEY',
    basis: 'Tier gratis Groq yang sudah dipakai repo; model 20b dipilih agar tidak menabrak batas TPM 8.000 dari 120b. Provider tetap opt-in/OFF.',
  }),
]);

const PAID_PROVIDER_NAMES = Object.freeze(['openai', 'paid', 'dev-tier']);
// Groq hosts openai/gpt-oss-20b on its free tier; the "openai/" prefix is a
// model namespace, not a paid OpenAI route. Explicitly allow that one model.
const PAID_MODEL_RE = /gpt-(?:6|5|4o|-turbo)|120b|paid|dev-tier/i;
const FREE_MODELS_ALLOWLIST = Object.freeze(['openai/gpt-oss-20b', 'openrouter/free']);

// Returns [] unless the caller explicitly opts in. Availability must be
// probed separately; configuration presence is not proof of a live provider.
function resolveFallbackChain({ optIn = false, env = process.env, availableProviders = null } = {}) {
  if (optIn !== true) return [];
  const available = Array.isArray(availableProviders) ? new Set(availableProviders.map(String)) : null;
  return FREE_CANDIDATES.filter((candidate) => {
    if (!env || !env[candidate.envKey]) return false;
    if (available && !available.has(candidate.provider)) return false;
    return true;
  }).map((candidate) => ({ ...candidate }));
}

function assertNoPaidFallback(chain) {
  const list = Array.isArray(chain) ? chain : [];
  if (list.some((item) => {
    const provider = String(item?.provider ?? '').toLowerCase();
    const model = String(item?.model ?? '');
    if (PAID_PROVIDER_NAMES.some((name) => provider.includes(name))) return true;
    if (FREE_MODELS_ALLOWLIST.includes(model)) return false;
    return PAID_MODEL_RE.test(model);
  })) {
    throw new Error('Fallback berbayar dilarang oleh kebijakan Rp0');
  }
  return list;
}

module.exports = { FREE_CANDIDATES, resolveFallbackChain, assertNoPaidFallback };
