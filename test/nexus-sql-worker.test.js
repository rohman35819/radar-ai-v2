'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../supabase/nexus-migrations/20261128_0006_nexus_sql_worker_tick.sql'),'utf8');
test('SQL worker processes only healthcheck and proposal-only knowledge ingestion',()=>{
 assert.match(source,/nexus_claim_task\('nexus-sql-cron',60\)/);
 assert.match(source,/v_task\.task_type='system\.healthcheck'/);
 assert.match(source,/v_task\.task_type='knowledge\.ingest'/);
 assert.match(source,/nexus_ingest_knowledge/);
 assert.match(source,/nexus_finish_task/);
 assert.doesNotMatch(source,/nexus_approve_knowledge|knowledge\.approve/);
});
test('SQL worker cron schedule is low-frequency and only created when pg_cron exists',()=>{
 assert.match(source,/extname='pg_cron'/);
 assert.match(source,/\*\/5 \* \* \* \*/);
 assert.match(source,/nexus-sql-worker-tick/);
});
