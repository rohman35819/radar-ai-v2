'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../supabase/functions/nexus-agent-runtime/index.ts'),'utf8');
test('NEXUS worker cannot approve knowledge or execute unknown task types',()=>{assert.match(source,/ALLOWED_WORKER_TASKS=new Set\(\["system\.healthcheck","knowledge\.ingest"\]\)/);assert.doesNotMatch(source,/nexus_approve_knowledge|knowledge\.approve|action==="approve"/);assert.match(source,/task_type_not_allowed/);assert.match(source,/approval:"proposed"/);});
test('agent runtime remains service-role authenticated and does not expose credentials',()=>{assert.match(source,/SUPABASE_SERVICE_ROLE_KEY/);assert.match(source,/bearer!=="Bearer "\+service/);assert.doesNotMatch(source,/console\.(log|error).*service/);});
