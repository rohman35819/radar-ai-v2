'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../supabase/functions/nexus-chat/index.ts'),'utf8');
test('NEXUS chat retrieves project memory and owner-scoped user memory after JWT validation',()=>{
 const auth=source.indexOf('userClient.auth.getUser()'),project=source.indexOf('nexus_retrieve_memory');
 assert.ok(auth>=0&&project>auth,'memory retrieval must occur after authentication');
 assert.match(source,/p_owner_subject:"project:radar-ai-v2"/);
 assert.match(source,/p_scope:"project",p_scope_id:"radar-ai-v2"/);
 assert.match(source,/p_owner_subject:owner,p_scope:"user",p_scope_id:owner/);
 assert.match(source,/p_include_confidential:true/);
 assert.match(source,/memory_items_used:memory.length/);
});
test('memory context preserves provenance and is bounded before entering the prompt',()=>{
 assert.match(source,/m\.source_ref/);
 assert.match(source,/m\.source_revision/);
 assert.match(source,/m\.content\.slice\(0,3000\)/);
 assert.match(source,/approval_status/).toBeUndefined?.();
});
