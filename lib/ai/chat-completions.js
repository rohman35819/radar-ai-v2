'use strict';

function parseJson(text) {
  const cleaned = String(text || '').replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '').trim();
  try { return JSON.parse(cleaned); }
  catch {
    const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('Model tidak mengirim JSON valid');
    return JSON.parse(cleaned.slice(a, b + 1));
  }
}

function list(value, max = 4) {
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string').slice(0, max).map((x) => x.slice(0, 180)) : [];
}

function normalizeAnalysis(raw, provider, model) {
  const decision = ['LONG', 'SHORT', 'WAIT'].includes(String(raw.decision || '').toUpperCase())
    ? String(raw.decision).toUpperCase() : 'WAIT';
  const score = Number(raw.confidence_score);
  return {
    provider, model, decision,
    confidence_score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    timeframe: String(raw.timeframe || 'unknown').slice(0, 20),
    reasons: list(raw.reasons), risks: list(raw.risks), missing_data: list(raw.missing_data),
    summary: String(raw.summary || '').slice(0, 500),
    analyzed_at: new Date().toISOString()
  };
}

async function requestStructured({ provider, apiKey, baseUrl, model, messages, maxTokens = 220, timeoutMs = 25000, headers = {}, fetchImpl = fetch, temperature = 0.15, reasoningEffort }) {
  if (!apiKey) throw new Error(provider.toUpperCase() + '_API_KEY belum dikonfigurasi');
  const body = { model, messages, max_tokens: maxTokens, response_format: { type: 'json_object' } };
  if (temperature !== null && temperature !== undefined) body.temperature = temperature;
  if (reasoningEffort) body.reasoning_effort = reasoningEffort;
  const response = await fetchImpl(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey, ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(provider + ': respons bukan JSON'); }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || ('HTTP ' + response.status);
    throw new Error(provider + ': ' + String(message).slice(0, 180));
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error(provider + ': jawaban kosong');
  return normalizeAnalysis(parseJson(content), provider, model);
}

module.exports = { requestStructured, normalizeAnalysis, parseJson };
