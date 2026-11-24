'use strict';

const PROVIDERS = Object.freeze({
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY'
});

const RATE_HEADERS = [
  'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-reset-requests',
  'x-ratelimit-limit-tokens', 'x-ratelimit-remaining-tokens', 'x-ratelimit-reset-tokens',
  'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
  'x-ratelimit-limit-requests-day', 'x-ratelimit-remaining-requests-day'
];

function emptyUsageState() {
  return { version: 1, providers: {} };
}

function readHeaders(headers) {
  const result = {};
  if (!headers || typeof headers.get !== 'function') return result;
  for (const name of RATE_HEADERS) {
    const value = headers.get(name);
    const text = value === null || value === undefined ? '' : String(value).trim();
    // Provider headers are untrusted input and this endpoint is intentionally public.
    // Keep only compact rate-limit values; never reflect arbitrary header text.
    if (text.length <= 80 && /^[A-Za-z0-9.:/_ -]*$/.test(text)) result[name] = text;
  }
  return result;
}

function jakartaDay(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return fields.year + '-' + fields.month + '-' + fields.day;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function recordProviderUsage(state, provider, event = {}, now = new Date()) {
  if (!Object.hasOwn(PROVIDERS, provider)) return state;
  if (!state || typeof state !== 'object') state = emptyUsageState();
  if (!state.providers || typeof state.providers !== 'object') state.providers = {};
  const day = jakartaDay(now);
  const previous = state.providers[provider] && typeof state.providers[provider] === 'object'
    ? state.providers[provider] : {};
  const sameDay = previous.day === day;
  const usage = event.usage && typeof event.usage === 'object' ? event.usage : {};
  const prompt = numberOrNull(usage.prompt_tokens ?? usage.input_tokens);
  const completion = numberOrNull(usage.completion_tokens ?? usage.output_tokens);
  const total = numberOrNull(usage.total_tokens) ?? (prompt !== null && completion !== null ? prompt + completion : null);
  const statusCode = numberOrNull(event.statusCode);
  const success = event.ok === true;
  const status = success ? 'ACTIVE' : statusCode === 429 ? 'LIMITED' : 'ERROR';
  state.version = 1;
  state.providers[provider] = {
    day,
    requests_today: (sameDay ? Number(previous.requests_today || 0) : 0) + 1,
    input_tokens_today: (sameDay ? Number(previous.input_tokens_today || 0) : 0) + (prompt || 0),
    output_tokens_today: (sameDay ? Number(previous.output_tokens_today || 0) : 0) + (completion || 0),
    total_tokens_today: (sameDay ? Number(previous.total_tokens_today || 0) : 0) + (total || 0),
    input_tokens_observed: prompt !== null || (sameDay && previous.input_tokens_observed === true),
    output_tokens_observed: completion !== null || (sameDay && previous.output_tokens_observed === true),
    total_tokens_observed: total !== null || (sameDay && previous.total_tokens_observed === true),
    last_status: status,
    last_status_code: statusCode,
    last_model: typeof event.model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(event.model)
      ? event.model : (previous.last_model || null),
    last_request_at: now.toISOString(),
    last_error_code: success ? null : (statusCode === 429 ? 'RATE_LIMITED' : (statusCode ? 'PROVIDER_HTTP_ERROR' : 'REQUEST_FAILED')),
    rate_limits: readHeaders(event.headers),
    quota_remaining: numberOrNull(event.quotaRemaining) ?? (sameDay ? numberOrNull(previous.quota_remaining) : null),
    quota_limit: numberOrNull(event.quotaLimit) ?? (sameDay ? numberOrNull(previous.quota_limit) : null),
    quota_source: event.quotaSource || (sameDay ? previous.quota_source : null)
  };
  return state;
}

function getProviderUsageSnapshot(state, env = process.env, now = Date.now()) {
  const providers = {};
  for (const [provider, keyName] of Object.entries(PROVIDERS)) {
    const item = state?.providers?.[provider] || {};
    const configured = Boolean(env[keyName]);
    const ageMs = item.last_request_at ? Math.max(0, now - Date.parse(item.last_request_at)) : null;
    let status = !configured ? 'NOT_CONFIGURED' : 'UNKNOWN';
    if (configured && ageMs !== null && Number.isFinite(ageMs) && ageMs <= 86400000) {
      status = item.last_status || 'UNKNOWN';
    }
    providers[provider] = {
      provider,
      configured,
      status,
      model: item.last_model || null,
      last_request_at: item.last_request_at || null,
      last_status_code: item.last_status_code ?? null,
      last_error_code: item.last_error_code || null,
      requests_today: item.day === jakartaDay(new Date(now)) ? Number(item.requests_today || 0) : 0,
      input_tokens_today: item.day === jakartaDay(new Date(now)) && item.input_tokens_observed ? Number(item.input_tokens_today || 0) : null,
      output_tokens_today: item.day === jakartaDay(new Date(now)) && item.output_tokens_observed ? Number(item.output_tokens_today || 0) : null,
      total_tokens_today: item.day === jakartaDay(new Date(now)) && item.total_tokens_observed ? Number(item.total_tokens_today || 0) : null,
      rate_limits: item.rate_limits || {},
      quota_remaining: item.quota_remaining ?? null,
      quota_limit: item.quota_limit ?? null,
      quota_source: item.quota_source || null,
      observed_at: item.last_request_at || null
    };
  }
  return { generated_at: new Date(now).toISOString(), accounting: 'Observed RADAR requests only; provider account totals may differ.', providers };
}

module.exports = { PROVIDERS, emptyUsageState, recordProviderUsage, getProviderUsageSnapshot, readHeaders };
