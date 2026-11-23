'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');
const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');

test('Screener mounts its controls before querying or binding them',()=>{
  const start=app.indexOf('function renderScreener(){');
  const end=app.indexOf('\nfunction renderWatch(){',start);
  assert.ok(start>=0&&end>start,'renderScreener function exists');
  const source=app.slice(start,end);
  const mount=source.indexOf("v.append(sectionHead('Temukan aset'");
  const setTrend=source.indexOf("$('#filter-trend').value=screenerFilters.trend");
  const setSort=source.indexOf("$('#filter-sort').value=screenerFilters.sort");
  const bind=source.indexOf("$('#'+id).addEventListener");
  assert.ok(mount>=0,'Screener controls are mounted');
  assert.ok(setTrend>mount,'trend control is queried after mount');
  assert.ok(setSort>mount,'sort control is queried after mount');
  assert.ok(bind>mount,'input listeners are attached after mount');
});

test('Dashboard keeps all existing primary navigation destinations',()=>{
  const destinations=['overview','screener','watch','analytics','news','unlock','alerts','ai','workspace','system'];
  for(const destination of destinations)assert.match(html,new RegExp('data-t="'+destination+'"'));
  assert.match(html,/href="\/trading\.html"/);
  assert.match(html,/href="\/command\.html"/);
});

const membershipHtml=fs.readFileSync(require.resolve('../public/membership.html'),'utf8');
const membershipCss=fs.readFileSync(require.resolve('../public/membership.css'),'utf8');

test('Membership preview keeps the registration name field hidden in login mode',()=>{
  assert.match(membershipHtml,/id="name-field" hidden/);
  assert.match(membershipCss,/#name-field\[hidden\]\s*\{\s*display:\s*none\s*\}/);
});


test('Early Gem GoPlus audit uses the published chain catalog and verifies credentials first',()=>{
  assert.match(app,/goplus_supported_networks/);
  assert.match(app,/goPlusChain=goPlusNetworks\.find/);
  assert.match(app,/GoPlus tidak mendukung chain/);
  assert.match(app,/\/api\/market-intelligence\/goplus\/status/);
  assert.match(app,/credentialStatus\.verified/);
});
