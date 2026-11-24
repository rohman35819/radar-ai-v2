'use strict';
const { runWithAIRequestSlot } = require('./request-queue');

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

function analysisResponseSchema() {
  return {
    type: 'object', additionalProperties: false,
    properties: {
      decision: { type: 'string', enum: ['LONG', 'SHORT', 'WAIT'] },
      confidence_score: { type: 'number' }, timeframe: { type: 'string' },
      reasons: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
      missing_data: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' }
    },
    required: ['decision', 'confidence_score', 'timeframe', 'reasons', 'risks', 'missing_data', 'summary']
  };
}

function retryable(provider, status, message) {
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  return provider === 'openrouter' && status === 401 && String(message || '').toLowerCase().includes('user not found');
}

async function requestStructured({ provider, apiKey, baseUrl, model, messages, maxTokens = 4096, timeoutMs = 25000, headers = {}, fetchImpl = fetch, temperature = 0.15, reasoningEffort, retryDelayMs = 350, onUsage }) {
  if (!apiKey) throw new Error(provider.toUpperCase() + '_API_KEY belum dikonfigurasi');
  let forceJsonObject = false;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    let usageRecorded = false;
    const useGroqSchema = provider === 'groq' && /gpt-oss/i.test(model) && !forceJsonObject;
    const body = {
      model, messages, max_completion_tokens: maxTokens,
      ...(provider === 'openai' || temperature === null || temperature === undefined ? {} : { temperature }),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      response_format: useGroqSchema
        ? { type: 'json_schema', json_schema: { name: 'radar_market_analysis', strict: true, schema: analysisResponseSchema() } }
        : { type: 'json_object' }
    };
    try {
      response = await runWithAIRequestSlot(() => fetchImpl(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey, ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      }));
      let payload;
      try { payload = await response.json(); } catch { throw new Error(provider + ': respons bukan JSON'); }
      if (!response.ok) {
        try { onUsage?.({ provider, model, ok: false, statusCode: response.status, headers: response.headers }); } catch {}
        usageRecorded = true;
        const message = payload?.error?.message || payload?.message || ('HTTP ' + response.status);
        lastError = new Error(provider + ': ' + String(message).slice(0, 180));
        if (provider === 'groq' && useGroqSchema && /failed_generation|json/i.test(String(message))) {
          forceJsonObject = true;
          continue;
        }
        if (attempt === 0 && retryable(provider, response.status, message)) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        throw lastError;
      }
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error(provider + ': jawaban kosong');
      try { onUsage?.({ provider, model, ok: true, statusCode: response.status, headers: response.headers, usage: payload?.usage }); } catch {}
      usageRecorded = true;
      return normalizeAnalysis(parseJson(content), provider, model);
    } catch (error) {
      if (!usageRecorded && error.code !== 'AI_QUEUE_FULL') { try { onUsage?.({ provider, model, ok: false, statusCode: response?.status ?? null, headers: response?.headers }); } catch {} }
      if (lastError && error === lastError) throw error;
      if (attempt === 0 && (error.name === 'AbortError' || error.name === 'TimeoutError' || error.name === 'TypeError')) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error(provider + ': request gagal setelah retry');
}

module.exports = { requestStructured, normalizeAnalysis, parseJson };
