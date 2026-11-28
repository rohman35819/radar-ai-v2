'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/nexus.js'),'utf8');
test('NEXUS chat displays the actual provider and model returned by the server',()=>{
 assert.match(source,/data\.provider\+' · Model: '\+\(data\.model\|\|'tidak dilaporkan'\)/);
});
test('NEXUS displays sanitized provider failover reasons when every free provider fails',()=>{
 assert.match(source,/provider_attempts/);
 assert.match(source,/a\.provider\+': '\+\(a\.code\|\|a\.status\|\|'failed'\)/);
 assert.doesNotMatch(source,/OPENROUTER_API_KEY belum tersedia/);
});
