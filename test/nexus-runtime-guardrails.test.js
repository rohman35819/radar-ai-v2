'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../supabase/functions/nexus-chat/index.ts'),'utf8');
const providers=fs.readFileSync(require.resolve('../supabase/functions/nexus-chat/providers.mjs'),'utf8');
test('NEXUS chat uses a server-pinned free-provider chain regardless of client input',()=>{
 assert.match(source,/askWithFreeProviderFallback\(messages\)/);
 assert.doesNotMatch(source,/body\.provider|body\.model/);
 assert.match(providers,/FREE_PROVIDER_ORDER = Object\.freeze\(\["nvidia", "gemini", "groq", "openrouter"\]\)/);
 assert.match(providers,/google\/gemma-4-31b-it/);
 assert.match(providers,/gemini-3\.8-flash/);
 assert.match(providers,/openai\/gpt-oss-20b/);
 assert.match(providers,/openrouter\/free/);
 assert.doesNotMatch(providers,/getEnv\(["'](?:MISTRAL_API_KEY|CLOUDFLARE_API_TOKEN|XAI_API_KEY|OPENAI_API_KEY)["']\)|api\.openai\.com|api\.x\.ai/i);
});
test('provider failures are normalized and never fall back to paid models',()=>{
 assert.match(providers,/provider_not_configured/);
 assert.match(providers,/all_free_providers_unavailable/);
 assert.match(providers,/http_\$\{response\.status\}/);
 assert.doesNotMatch(providers,/response\.text\(\)|JSON\.stringify\(payload\).*slice/i);
 assert.match(providers,/model,/);
 assert.match(providers,/openrouter\/free/);
});
