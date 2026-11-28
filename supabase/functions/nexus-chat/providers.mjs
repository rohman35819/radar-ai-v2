// Free-tier-only NEXUS provider chain. Never add a paid model or provider here without BOS approval.
export const FREE_PROVIDER_ORDER = Object.freeze(["nvidia", "gemini", "openrouter"]);

export const FREE_PROVIDER_MODELS = Object.freeze({
  nvidia: "google/gemma-4-31b-it",
  gemini: "gemini-3.8-flash",
  openrouter: "openrouter/free",
});

const PROVIDER_KEYS = Object.freeze({
  nvidia: "NVIDIA_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
});
const TIMEOUT_MS = 15000;
const MAX_OUTPUT_TOKENS = 1200;

class ProviderFailure extends Error {
  constructor(provider, code, status = null) {
    super(code);
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

function extractOpenAIText(payload) {
  const value = payload?.choices?.[0]?.message?.content;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const text = value.filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text).join("\n").trim();
    if (text) return text;
  }
  return "";
}

async function postJson(fetchImpl, provider, url, key, body, headers = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const code = error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "timeout" : "network_error";
    throw new ProviderFailure(provider, code);
  }
  if (!response.ok) throw new ProviderFailure(provider, `http_${response.status}`, response.status);
  const payload = await response.json().catch(() => null);
  const answer = extractOpenAIText(payload);
  if (!answer) throw new ProviderFailure(provider, "empty_or_invalid_response", response.status);
  return answer;
}

async function askOpenAICompatible(provider, key, messages, fetchImpl) {
  const model = FREE_PROVIDER_MODELS[provider];
  const endpoint = {
    nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
  }[provider];
  const headers = provider === "openrouter"
    ? { "HTTP-Referer": "https://radar-ai-v2.hostless.app", "X-Title": "RADAR AI V2 NEXUS" }
    : {};
  const answer = await postJson(fetchImpl, provider, endpoint, key, {
    model,
    messages,
    temperature: 0.2,
    max_tokens: MAX_OUTPUT_TOKENS,
  }, headers);
  return { answer, model };
}

async function askGemini(key, messages, fetchImpl) {
  const provider = "gemini";
  const model = FREE_PROVIDER_MODELS.gemini;
  const systemText = messages.filter((item) => item.role === "system")
    .map((item) => item.content).join("\n\n");
  const contents = messages.filter((item) => item.role !== "system").map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: String(item.content ?? "") }],
  }));
  let response;
  try {
    response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
          contents,
          generationConfig: { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch (error) {
    const code = error?.name === "TimeoutError" || error?.name === "AbortError"
      ? "timeout" : "network_error";
    throw new ProviderFailure(provider, code);
  }
  if (!response.ok) throw new ProviderFailure(provider, `http_${response.status}`, response.status);
  const payload = await response.json().catch(() => null);
  const answer = (payload?.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => typeof part?.text === "string")
    .map((part) => part.text).join("\n").trim();
  if (!answer) throw new ProviderFailure(provider, "empty_or_invalid_response", response.status);
  return { answer, model };
}

async function askProvider(provider, key, messages, fetchImpl) {
  if (provider === "gemini") return askGemini(key, messages, fetchImpl);
  return askOpenAICompatible(provider, key, messages, fetchImpl);
}

/**
 * Tries only explicitly selected free-tier models in deterministic order.
 * It never reads GROQ_API_KEY, MISTRAL_API_KEY or Cloudflare credentials: Groq account billing tier
 * cannot be verified at runtime; Mistral API requires payment activation, and Cloudflare's over-quota
 * behavior depends on account plan.
 */
export async function askWithFreeProviderFallback(
  messages,
  { getEnv = (name) => Deno.env.get(name), fetchImpl = fetch } = {},
) {
  const attempts = [];
  let configured = 0;
  for (const provider of FREE_PROVIDER_ORDER) {
    const key = getEnv(PROVIDER_KEYS[provider]);
    if (typeof key !== "string" || !key.trim()) continue;
    configured += 1;
    try {
      const result = await askProvider(provider, key.trim(), messages, fetchImpl);
      attempts.push({ provider, status: "success" });
      return { ...result, provider, attempts };
    } catch (error) {
      attempts.push({
        provider,
        status: "failed",
        code: error instanceof ProviderFailure ? error.code : "provider_error",
        http_status: error instanceof ProviderFailure ? error.status : null,
      });
    }
  }
  const failure = new Error(configured ? "all_free_providers_unavailable" : "provider_not_configured");
  failure.code = configured ? "all_free_providers_unavailable" : "provider_not_configured";
  failure.attempts = attempts;
  throw failure;
}
