'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require.resolve('../public/command.html'),'utf8'),css=fs.readFileSync(require.resolve('../public/command.css'),'utf8'),js=fs.readFileSync(require.resolve('../public/command.js'),'utf8');
test('Command Center exposes access, participants, prompt, and result controls',()=>{for(const id of ['admin-token','instruction','send','status','seats','chatlog','meeting-count','clear-chat'])assert.match(html,new RegExp('id="'+id+'"'));assert.equal((html.match(/class="participant-card"/g)||[]).length,4);assert.match(html,/maxlength="2000"/);});
test('Admin token is not prompted or persisted in browser storage',()=>{assert.doesNotMatch(js,/window\.prompt|localStorage|sessionStorage/);assert.match(js,/x-admin-token/);assert.match(js,/tokenInput\.value=''/);});
test('Command polling handles authorization, busy state, and matching command IDs',()=>{assert.match(js,/response\.status===409/);assert.match(js,/response\.status===403/);assert.match(js,/result\?\.command_id===id/);assert.match(js,/const max=90/);});
test('Command Center includes mobile layout and accessible controls',()=>{assert.match(css,/@media\(max-width:680px\)/);assert.match(css,/:focus-within/);assert.match(html,/aria-live="polite"/);});
