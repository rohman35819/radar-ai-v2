'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../supabase/functions/nexus-chat/index.ts'),'utf8');
test('NEXUS chat is pinned to OpenRouter Free regardless of client input',()=>{assert.match(source,/const PROVIDER = "openrouter"/);assert.match(source,/const MODEL = "openrouter\/free"/);assert.match(source,/Deno\.env\.get\("OPENROUTER_API_KEY"\)/);assert.doesNotMatch(source,/body\.provider|body\.model/);assert.doesNotMatch(source,/OPENAI_API_KEY|XAI_API_KEY|GEMINI_API_KEY|ANTHROPIC_API_KEY|api\.openai\.com|api\.x\.ai|generativelanguage|anthropic\.com/i);});
test('provider failures are normalized and never fall back to paid models',()=>{assert.match(source,/provider_not_configured/);assert.match(source,/provider_request_failed/);assert.doesNotMatch(source,/provider_error:|JSON\.stringify\(j\)\.slice/);assert.match(source,/model:MODEL/);});
