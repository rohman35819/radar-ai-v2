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
  const destinations=['overview','screener','early-gems','action','intel','watch','analytics','news','unlock','alerts','ai','workspace','system'];
  for(const destination of destinations)assert.match(html,new RegExp('data-t="'+destination+'"'));
  assert.match(html,/href="\/trading\.html"/);
  assert.match(html,/href="\/market\.html"/);
  assert.match(html,/href="\/solscan\.html"/);
  assert.match(html,/href="\/command\.html"/);
});

const membershipHtml=fs.readFileSync(require.resolve('../public/membership.html'),'utf8');
const membershipCss=fs.readFileSync(require.resolve('../public/membership.css'),'utf8');

test('Top 5 and Radar Intelligence navigation resolve to their own renderers',()=>{
  assert.match(app,/function renderAction\(\)/);
  assert.match(app,/function renderIntel\(\)/);
  assert.match(app,/else if\(tab==='action'\)renderAction\(\)/);
  assert.match(app,/else if\(tab==='intel'\)renderIntel\(\)/);
  assert.match(app,/else renderSystem\(\)/);
});

test('Membership preview keeps the registration name field hidden in login mode',()=>{
  assert.match(membershipHtml,/id="name-field" hidden/);
  assert.match(membershipCss,/#name-field\[hidden\]\s*\{\s*display:\s*none\s*\}/);
});

const css=fs.readFileSync(require.resolve('../public/style.css'),'utf8');
function ruleBodies(selector,source){
  const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('(?:^|[\\s{}])'+escaped+'\\s*\\{([^{}]*)\\}','g');
  const bodies=[];let match;
  while((match=pattern.exec(source)))bodies.push(match[1]);
  return bodies;
}

test('Sidebar has one scroll owner and no conflicting duplicate panel rules',()=>{
  const panels=ruleBodies('.sidebar',css);
  assert.ok(panels.length>0,'sidebar rules exist');
  for(const body of panels){
    assert.doesNotMatch(body,/overflow-y\s*:\s*(auto|scroll)/,'the sidebar panel must not own vertical scrolling');
    assert.doesNotMatch(body,/overscroll-behavior\s*:\s*contain/,'scroll containment belongs to .side-nav');
  }
  assert.ok(panels.some(body=>/overflow\s*:\s*hidden/.test(body)),'sidebar panel is clipped');
  assert.equal((css.match(/\.sidebar\.open\s*\{[^}]*transform\s*:\s*translateX\(0\)/g)||[]).length,1,'exactly one open-drawer rule');
  assert.doesNotMatch(css,/width\s*:\s*min\(82vw,300px\)|width\s*:\s*260px/,'stale drawer width declarations are removed');
  const nav=ruleBodies('.side-nav',css).join('\n');
  for(const pattern of [/overflow-y\s*:\s*auto/,/overscroll-behavior-y\s*:\s*contain/,/touch-action\s*:\s*pan-y/,/min-height\s*:\s*0/,/flex\s*:\s*1 1 0/])assert.match(nav,pattern,'side-nav must own scrolling: '+pattern);
});

test('Drawer controls close the drawer and the main shell stays fixed',()=>{
  assert.match(html,/id="menu-toggle"[^>]*aria-controls="sidebar"[^>]*aria-expanded="false"/);
  assert.match(html,/id="sidebar-backdrop"[^>]*aria-label="Tutup menu"/);
  assert.match(app,/\$\('#sidebar-backdrop'\)\.addEventListener\('click',closeSidebar\)/);
  assert.match(app,/event\.key==='Escape'[\s\S]*?closeSidebar\(\)/);
  assert.match(app,/window\.addEventListener\('resize',\(\)=>\{if\(window\.innerWidth>760\)closeSidebar\(\);\}\)/);
  assert.match(app,/document\.body\.classList\.toggle\('sidebar-open',open\)/);
  assert.match(app,/toggle\.setAttribute\('aria-expanded',String\(open\)\)/);
  assert.match(css,/body\.sidebar-open\{overflow:hidden\}/);
  assert.match(css,/\.main-shell\{margin-left:0\}/);
  assert.match(css,/\.sidebar\{position:fixed/);
});
