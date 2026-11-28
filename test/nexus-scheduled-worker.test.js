'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../supabase/functions/nexus-scheduled-worker/index.ts'),'utf8');
const config=fs.readFileSync(require.resolve('../supabase/config.toml'),'utf8');
test('scheduled worker authenticates with a private token before forwarding',()=>{
 assert.match(source,/x-nexus-worker-token/);
 assert.match(source,/nexus_validate_worker_token/);
 assert.match(source,/valid !== true/);
 assert.match(source,/functions\/v1\/nexus-agent-runtime/);
 assert.match(source,/action: "worker_tick"/);
 assert.match(source,/Bearer " \+ serviceRoleKey/);
});
test('scheduled worker does not accept arbitrary client actions and keeps custom auth explicit',()=>{
 assert.doesNotMatch(source,/await req\.json\(\)/);
 assert.match(config,/\[functions\.nexus-scheduled-worker\]\s*verify_jwt\s*=\s*false/);
});
