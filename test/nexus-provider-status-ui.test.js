'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../public/nexus.js'),'utf8');
test('NEXUS chat displays the actual provider and model returned by the server',()=>{
 assert.match(source,/data\.provider\+' · Model: '\+\(data\.model\|\|'tidak dilaporkan'\)/);
});
test('NEXUS displays the explicit free-quota exhaustion message and sanitized attempts',()=>{
 assert.match(source,/Semua kuota free sudah habis atau provider gratis sedang tidak tersedia/);
 assert.match(source,/provider_attempts/);
 assert.match(source,/a\.provider\+': '\+\(a\.code\|\|a\.status\|\|'failed'\)/);
 assert.doesNotMatch(source,/OPENROUTER_API_KEY belum tersedia/);
});
