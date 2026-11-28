import test from "node:test";
import assert from "node:assert/strict";
import {
  askWithFreeProviderFallback,
  FREE_PROVIDER_MODELS,
  FREE_PROVIDER_ORDER,
} from "../supabase/functions/nexus-chat/providers.mjs";

const messages = [
  { role: "system", content: "You are NEXUS." },
  { role: "user", content: "Halo." },
];
const envFor = (keys) => (name) => keys[name] ?? "";

test("NVIDIA quota failure automatically falls through to Gemini free tier", async () => {
  const calls = [];
  const result = await askWithFreeProviderFallback(messages, {
    getEnv: envFor({ NVIDIA_API_KEY: "nvidia-test", GEMINI_API_KEY: "gemini-test" }),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      if (String(url).includes("integrate.api.nvidia.com")) {
        return new Response(JSON.stringify({ error: "rate limit" }), { status: 429 });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Halo BOS, saya NEXUS." }] } }],
      }), { status: 200 });
    },
  });
  assert.equal(result.provider, "gemini");
  assert.equal(result.model, FREE_PROVIDER_MODELS.gemini);
  assert.match(result.answer, /Halo BOS/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.model, FREE_PROVIDER_MODELS.nvidia);
  assert.deepEqual(calls[1].body.contents[0], { role: "user", parts: [{ text: "Halo." }] });
  assert.equal(result.attempts[0].code, "http_429");
  assert.equal(result.attempts[1].status, "success");
});

test("network failure falls through to OpenRouter Free without exposing credentials", async () => {
  const calls = [];
  const result = await askWithFreeProviderFallback(messages, {
    getEnv: envFor({ NVIDIA_API_KEY: "secret-nvidia", OPENROUTER_API_KEY: "secret-openrouter" }),
    fetchImpl: async (url, init) => {
      calls.push(String(url));
      if (String(url).includes("integrate.api.nvidia.com")) throw new TypeError("network unavailable");
      assert.equal(init.headers.Authorization, "Bearer secret-openrouter");
      return new Response(JSON.stringify({
        choices: [{ message: { content: "NEXUS aktif melalui OpenRouter Free." } }],
      }), { status: 200 });
    },
  });
  assert.equal(result.provider, "openrouter");
  assert.match(result.answer, /OpenRouter Free/);
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(result.attempts).includes("secret"), false);
});

test("OpenRouter Free is last fallback and sends only openrouter/free", async () => {
  const calls = [];
  const result = await askWithFreeProviderFallback(messages, {
    getEnv: envFor({
      NVIDIA_API_KEY: "n",
      GEMINI_API_KEY: "g",
      OPENROUTER_API_KEY: "o",
    }),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      if (calls.length < 3) return new Response("unavailable", { status: 503 });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Jawaban dari OpenRouter Free." } }],
      }), { status: 200 });
    },
  });
  assert.equal(result.provider, "openrouter");
  assert.equal(calls[2].body.model, "openrouter/free");
  assert.equal(calls.length, 3);
  assert.deepEqual(FREE_PROVIDER_ORDER, ["nvidia", "gemini", "openrouter"]);
});

test("Groq, Mistral and Cloudflare credentials are deliberately not used by strict Rp0 chain", async () => {
  let calls = 0;
  const result = await askWithFreeProviderFallback(messages, {
    getEnv: envFor({
      GROQ_API_KEY: "must-not-be-used",
      MISTRAL_API_KEY: "must-not-be-used",
      CLOUDFLARE_API_TOKEN: "must-not-be-used",
      CLOUDFLARE_ACCOUNT_ID: "account",
      OPENROUTER_API_KEY: "openrouter",
    }),
    fetchImpl: async (_url, init) => {
      calls += 1;
      assert.equal(JSON.parse(init.body).model, "openrouter/free");
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Free fallback." } }],
      }), { status: 200 });
    },
  });
  assert.equal(result.provider, "openrouter");
  assert.equal(calls, 1);
});

test("reports not configured without making outbound calls", async () => {
  let calls = 0;
  await assert.rejects(
    askWithFreeProviderFallback(messages, {
      getEnv: () => "",
      fetchImpl: async () => { calls += 1; },
    }),
    (error) => error.code === "provider_not_configured" && error.attempts.length === 0,
  );
  assert.equal(calls, 0);
});

test("all provider failures return sanitized attempts, never raw provider body", async () => {
  await assert.rejects(
    askWithFreeProviderFallback(messages, {
      getEnv: envFor({
        NVIDIA_API_KEY: "n",
        GEMINI_API_KEY: "g",
        GROQ_API_KEY: "q",
        OPENROUTER_API_KEY: "o",
      }),
      fetchImpl: async () => new Response("private provider error details", { status: 429 }),
    }),
    (error) => {
      assert.equal(error.code, "all_free_providers_unavailable");
      assert.deepEqual(error.attempts.map((item) => item.provider), FREE_PROVIDER_ORDER);
      assert.equal(JSON.stringify(error.attempts).includes("private provider"), false);
      return true;
    },
  );
});
