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

const styleCss=fs.readFileSync(require.resolve('../public/style.css'),'utf8');

test('Dashboard exposes truthful freshness, source and connection states',()=>{
  for(const marker of ['const ageLabel','const connectionState','const sourceFootnote','loadFailed'])
    assert.ok(app.includes(marker),'missing '+marker);
  assert.match(app,/Sumber: \/api\/snapshot/);
  assert.match(app,/data\.stale/);
  assert.match(app,/snapshotReachable/);
  assert.doesNotMatch(app,/Math\.random/,'dashboard must not fabricate data');
  assert.ok((app.match(/sourceFootnote\(\)/g)||[]).length>=8,'freshness footnote appears across dashboard views');
  assert.match(styleCss,/\.freshness-note/);
  assert.match(styleCss,/\.state-panel/);
});

test('Auto-refresh preserves input focus, cursor and scroll instead of resetting the view',()=>{
  assert.ok(app.includes('const renderPreservingFocus='),'focus-preserving render helper exists');
  assert.match(app,/renderPreservingFocus\(\);\s*return snapshotOk;/,'load() uses the helper after refreshing data');
  const start=app.indexOf('const renderPreservingFocus=');
  const source=app.slice(start,start+900);
  assert.match(source,/selectionStart/,'cursor position is captured');
  assert.match(source,/focus\(\{preventScroll:true\}\)/,'focus is restored without scrolling');
  assert.match(source,/setSelectionRange/,'text selection is restored');
  assert.match(source,/scrollTop/,'view scroll is preserved');
  assert.match(source,/window\.scrollY/,'page scroll is preserved');
});

test('AI Workspace token is entered inline and never persisted',()=>{
  assert.doesNotMatch(app,/window\.prompt/,'no blocking native prompt for the admin token');
  assert.match(app,/id:'workspace-token'/,'inline password field exists');
  assert.match(app,/type:'password'/,'token input is masked by default');
  assert.match(app,/headers:\{'x-admin-token':token\}/,'existing API contract is unchanged');
  assert.match(app,/workspaceToken='';/,'token is cleared after the request');
  assert.match(app,/clearWorkspaceToken\(\);\s*toast\('Rapat 4 AI dimulai/,'token is cleared before polling re-renders the field');
  assert.doesNotMatch(app,/localStorage\.setItem\([^)]*workspaceToken/,'token is never written to localStorage');
  assert.match(styleCss,/\.workspace-access/,'token field has responsive styling');
});

test('External news links only accept http(s) schemes',()=>{
  const start=app.indexOf('const safeExternalLink=');
  assert.ok(start>=0,'scheme guard exists');
  const source=app.slice(start,start+400);
  assert.match(source,/if\(!value\)return null;/,'empty link is rejected instead of resolving to the current page');
  assert.match(source,/url\.protocol==='http:'\|\|url\.protocol==='https:'/);
  assert.match(app,/href\?el\('a',\{href,target:'_blank',rel:'noopener noreferrer'\}/,'anchor is rendered only for a safe href');
});

test('Dashboard icon buttons and live result counts are screen-reader accessible',()=>{
  assert.match(html,/id="refresh"[^>]*aria-label="Muat ulang data"/);
  assert.match(html,/id="theme"[^>]*aria-label="Ganti tema"/);
  assert.match(html,/id="banner"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(app,/id:'result-count','aria-live':'polite'/);
  assert.match(app,/id:'gem-count','aria-live':'polite'/);
  assert.match(app,/'aria-label':favorite\?'Hapus '/);
  assert.match(app,/'aria-label':'Lihat detail '/);
});
