'use strict';
const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};
const money = (v) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v) >= 1e9 ? '$' + (Number(v)/1e9).toFixed(2)+'B' : Number(v)>=1e6 ? '$'+(Number(v)/1e6).toFixed(2)+'M' : Number(v)>=1e3 ? '$'+(Number(v)/1e3).toFixed(1)+'K' : '$'+Number(v).toFixed(2);
const pct = (v) => v == null || !Number.isFinite(Number(v)) ? '—' : (Number(v)>0?'+':'')+Number(v).toFixed(2)+'%';
const ratio = (v) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(2)+'x';
const dateTime = (v) => v ? new Date(v).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}) : 'Belum tersedia';
const esc = (v) => String(v ?? '—');
const FLAG = {fdv_unknown:'FDV tidak diketahui',fdv_gt_5x_mcap:'FDV > 5x MCap',volume_gt_mcap:'Volume > MCap',stale:'Data basi'};
const TITLES = {overview:'Ringkasan Pasar',screener:'Market Screener',watch:'Watchlist',analytics:'Analitik Pasar',news:'News Feed',unlock:'Token Unlock',alerts:'Alert Center',ai:'AI Council',workspace:'AI Workspace',system:'System Health'};
let data=null, aiGroup=null, aiWorkspace=null, tab='overview', watch=[], expanded=null, refreshBusy=false, toastTimer;
try { watch=JSON.parse(localStorage.getItem('radar-watch')||'[]'); } catch {}
const saveWatch=()=>{try{localStorage.setItem('radar-watch',JSON.stringify(watch));}catch{}};
const toast=(msg)=>{const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600);};
const statCard=(label,value,sub,icon,trend)=>el('article',{class:'stat-card'},el('div',{class:'stat-top'},el('span',{class:'stat-label'},label),el('span',{class:'stat-icon'},icon)),el('div',{class:'stat-value'},value),el('div',{class:'stat-bottom'},el('span',{class:trend||'muted'},sub)));
const sectionHead=(title,sub,action)=>el('div',{class:'section-head'},el('div',{},el('h2',{},title),el('p',{class:'muted'},sub||'')),action||null);
const card=(...children)=>el('section',{class:'panel'},...children);
const empty=(title,desc)=>el('div',{class:'empty-state'},el('div',{class:'empty-icon'},'◌'),el('b',{},title),el('p',{},desc));
const pctPill=(v)=>el('span',{class:'change '+(Number(v)>=0?'positive':'negative')},pct(v));
const getTokens=()=>Array.isArray(data?.tokens)?data.tokens:[];
const totals=()=>{
 const ts=getTokens(); return {count:ts.length,cap:ts.reduce((a,t)=>a+(Number(t.market_cap)||0),0),vol:ts.reduce((a,t)=>a+(Number(t.volume_24h)||0),0),positive:ts.filter(t=>Number(t.change_24h)>0).length,negative:ts.filter(t=>Number(t.change_24h)<0).length};
};
const topTokens=(key,dir=1,n=5)=>[...getTokens()].sort((a,b)=>dir*((Number(a[key])||0)-(Number(b[key])||0))).slice(0,n);
function tokenRow(t,showDetail=false){
 const favorite=watch.includes(t.id);
 const row=el('div',{class:'token-row'},
  el('div',{class:'token-identity'},el('span',{class:'coin-avatar'},esc(t.symbol).slice(0,3)),el('div',{},el('b',{},esc(t.symbol)),el('small',{},esc(t.name)))),
  el('div',{class:'token-price'},el('b',{},t.price==null?'—':'$'+Number(t.price).toPrecision(6)),el('small',{},'24J')),
  pctPill(t.change_24h),
  el('div',{class:'token-metric'},money(t.market_cap)),
  el('div',{class:'token-metric'},money(t.volume_24h)),
  el('div',{class:'token-actions'},el('button',{class:'mini-btn '+(favorite?'saved':''),title:'Watchlist',onclick:()=>toggleWatch(t.id)},favorite?'★':'☆'),showDetail?el('button',{class:'mini-btn',title:'Detail',onclick:()=>{expanded=expanded===t.id?null:t.id;render();}},'↗'):null)
 );
 if(showDetail && expanded===t.id) row.append(tokenDetail(t));
 return row;
}
function toggleWatch(id){watch=watch.includes(id)?watch.filter(x=>x!==id):[...watch,id];saveWatch();render();toast(watch.includes(id)?'Token ditambahkan ke watchlist':'Token dihapus dari watchlist');}
function tokenDetail(t){
 const f=t.fundamental||{},v=t.vol10m||{};
 return el('div',{class:'token-detail'},
  el('div',{class:'detail-grid'},
   ['Market cap|'+money(t.market_cap),'FDV|'+money(t.fdv),'Volume 24 jam|'+money(t.volume_24h),'Vol / MCap|'+ratio(t.vol_mcap),'Perubahan 7 hari|'+pct(t.change_7d),'TVL|'+money(f.tvl),'Fees 24 jam|'+money(f.fees_24h),'Revenue 24 jam|'+money(f.revenue_24h),'Volume asli 10 menit|'+money(v.volume_usdt),'Median volume 10 menit|'+ratio(v.x)].map(s=>{const [k,val]=s.split('|');return el('div',{},el('small',{},k),el('b',{},val));})
  ),
  ...(t.flags||[]).map(x=>el('span',{class:'flag'},FLAG[x]||x))
 );
}
function tokenTable(list,limit=100){
 const wrap=el('div',{class:'table-wrap'});
 wrap.append(el('div',{class:'table-head'},el('span',{},'ASET'),el('span',{},'HARGA'),el('span',{},'24J'),el('span',{},'MARKET CAP'),el('span',{},'VOLUME 24J'),el('span',{},'AKSI')));
 if(!list.length) wrap.append(empty('Tidak ada token','Coba ubah filter atau tunggu pembaruan data.'));
 list.slice(0,limit).forEach(t=>wrap.append(tokenRow(t,true)));
 return wrap;
}
function renderOverview(){
 const v=$('#view');v.replaceChildren();
 const s=totals(),ts=getTokens(),health=Object.values(data?.health||{}),healthy=health.filter(x=>x.ok).length;
 v.append(el('div',{class:'welcome-row'},el('div',{},el('div',{class:'eyebrow'},'MARKET PULSE / LIVE DATA'),el('h2',{},'Selamat datang di RADAR.'),el('p',{class:'muted'},'Satu ruang untuk memantau pasar, menemukan peluang, dan membaca analisis AI.')),el('div',{class:'updated-box'},el('small',{},'PEMBARUAN TERAKHIR'),el('b',{},dateTime(data?.last_ok)),el('span',{class:'live-chip'},data?.stale?'DATA PERLU DICEK':'● DATA TERHUBUNG'))));
 v.append(el('div',{class:'stats-grid'},
  statCard('ASET TERPANTAU',s.count.toLocaleString('id-ID'),'Token lolos filter screener','◈'),
  statCard('TOTAL MARKET CAP',money(s.cap),'Agregat aset dalam radar','◫'),
  statCard('VOLUME 24 JAM',money(s.vol),'Volume dari aset terpantau','⇅'),
  statCard('MARKET BREADTH',s.count?Math.round(s.positive/s.count*100)+'%':'—',s.positive+' naik · '+s.negative+' turun','⌁',s.positive>=s.negative?'positive':'negative')
 ));
 const movers=card(sectionHead('Top Movers','Pergerakan terbesar berdasarkan data 24 jam',el('button',{class:'text-btn',onclick:()=>navigate('screener')},'Buka screener →')),el('div',{class:'mover-grid'},
  el('div',{class:'mover-column'},el('div',{class:'column-label positive'},'▲ GAINERS'),...topTokens('change_24h',-1,5).map(t=>el('div',{class:'mover-row'},el('b',{},esc(t.symbol)),pctPill(t.change_24h)))),
  el('div',{class:'mover-column'},el('div',{class:'column-label negative'},'▼ LOSERS'),...topTokens('change_24h',1,5).map(t=>el('div',{class:'mover-row'},el('b',{},esc(t.symbol)),pctPill(t.change_24h))))
 ));
 const market=card(sectionHead('Market Watch','Token dengan aktivitas volume tertinggi',el('button',{class:'text-btn',onclick:()=>navigate('analytics')},'Analitik →')),tokenTable(topTokens('volume_24h',-1,6),6));
 const bottom=el('div',{class:'two-col'},card(sectionHead('AI Council','Ringkasan rapat analisis terakhir'),aiGroup?.last?el('div',{class:'ai-summary'},el('div',{class:'row-between'},el('b',{},'Keputusan grup'),el('span',{class:'decision '+String(aiGroup.last.final?.decision||'WAIT').toLowerCase()},aiGroup.last.final?.decision||'WAIT')),el('p',{},aiGroup.last.final?.summary||'Belum ada ringkasan.'),el('small',{class:'muted'},dateTime(aiGroup.last.created_at)),el('button',{class:'text-btn',onclick:()=>navigate('ai')},'Lihat analisis →')):empty('Belum ada analisis','Laporan AI muncul setelah proses terjadwal berhasil.')),
 card(sectionHead('Kesehatan Sumber','Koneksi data yang digunakan RADAR'),el('div',{class:'health-summary'},...Object.entries(data?.health||{}).slice(0,5).map(([k,x])=>el('div',{class:'health-line'},el('span',{},k),el('b',{class:x.ok?'positive':'negative'},x.ok?'● ONLINE':'● ERROR'))),el('div',{class:'muted'},healthy+'/'+health.length+' sumber sehat'))));
 v.append(movers,market,bottom);
}
function renderScreener(){
 const v=$('#view');v.replaceChildren();
 const controls=el('div',{class:'filter-panel'},
  el('input',{id:'filter-q',type:'search',placeholder:'Cari nama atau simbol…',value:$('#q-cache')?.value||''}),
  el('select',{id:'filter-trend'},el('option',{value:'all'},'Semua tren'),el('option',{value:'up'},'Sedang naik'),el('option',{value:'down'},'Sedang turun')),
  el('select',{id:'filter-sort'},el('option',{value:'market_cap'},'Market cap'),el('option',{value:'volume_24h'},'Volume 24 jam'),el('option',{value:'vol_mcap'},'Vol / MCap'),el('option',{value:'change_24h'},'Perubahan 24 jam'),el('option',{value:'change_7d'},'Perubahan 7 hari')),
  el('button',{class:'secondary-btn',onclick:()=>{ $('#filter-q').value='';$('#filter-trend').value='all';$('#filter-sort').value='market_cap';renderScreener();}},'Reset')
 );
 const results=el('div',{id:'screener-results'});
 const update=()=>{
  const q=$('#filter-q').value.trim().toLowerCase(),trend=$('#filter-trend').value,key=$('#filter-sort').value;
  const list=getTokens().filter(t=>(!q||String(t.symbol).toLowerCase().includes(q)||String(t.name).toLowerCase().includes(q))&&(trend==='all'||(trend==='up'?Number(t.change_24h)>0:Number(t.change_24h)<0))).sort((a,b)=>(Number(b[key])||-Infinity)-(Number(a[key])||-Infinity));
  $('#result-count').textContent=list.length+' aset ditemukan';results.replaceChildren(tokenTable(list));
 };
 v.append(sectionHead('Temukan aset','Cari dan saring token berdasarkan aktivitas pasar.'),controls,el('div',{class:'result-meta'},el('b',{id:'result-count'},'Memuat…'),el('span',{class:'muted'},'Data mengikuti refresh server')),results);
 ['filter-q','filter-trend','filter-sort'].forEach(id=>$('#'+id).addEventListener(id==='filter-q'?'input':'change',update));update();
}
function renderWatch(){
 const v=$('#view');v.replaceChildren();
 const list=getTokens().filter(t=>watch.includes(t.id));
 v.append(sectionHead('Watchlist','Daftar aset pilihan tersimpan di perangkat ini.',el('button',{class:'secondary-btn',onclick:()=>navigate('screener')},'＋ Tambah aset')));
 v.append(el('div',{class:'stats-grid compact'},statCard('ASET DISIMPAN',watch.length,'Tersimpan lokal di browser','☆'),statCard('TERSEDIA DI RADAR',list.length,'Aset yang saat ini ada di feed','◈')));
 v.append(card(list.length?tokenTable(list):empty('Watchlist masih kosong','Buka Market Screener lalu tekan ikon ☆ untuk menyimpan token.')));
}
function renderAnalytics(){
 const v=$('#view');v.replaceChildren();const s=totals(),ts=getTokens();
 const capSorted=[...ts].sort((a,b)=>(b.market_cap||0)-(a.market_cap||0)).slice(0,8),volSorted=topTokens('volume_24h',-1,8);
 const bars=(items,key)=>el('div',{class:'bar-list'},...items.map(t=>{const max=Math.max(1,...items.map(x=>Number(x[key])||0));return el('div',{class:'bar-item'},el('div',{class:'bar-caption'},el('b',{},esc(t.symbol)),el('span',{},money(t[key]))),el('div',{class:'bar-track'},el('span',{class:'bar-fill',style:'width:'+Math.max(2,(Number(t[key])||0)/max*100)+'%'})));}));
 v.append(sectionHead('Market Analytics','Pembacaan statistik dari token yang sedang terpantau.'));
 v.append(el('div',{class:'stats-grid'},statCard('NAIK',s.positive,'Aset dengan return positif','↗','positive'),statCard('TURUN',s.negative,'Aset dengan return negatif','↘','negative'),statCard('MARKET CAP',money(s.cap),'Total dalam universe radar','◫'),statCard('VOLUME',money(s.vol),'Agregat volume 24 jam','⇅')));
 v.append(el('div',{class:'two-col'},card(sectionHead('Top Market Cap','Aset dengan kapitalisasi terbesar'),bars(capSorted,'market_cap')),card(sectionHead('Top Volume','Aset dengan volume perdagangan terbesar'),bars(volSorted,'volume_24h'))));
 v.append(card(sectionHead('Distribusi Market Breadth','Jumlah token berdasarkan arah perubahan 24 jam'),el('div',{class:'breadth'},el('div',{class:'breadth-up',style:'width:'+(s.count?s.positive/s.count*100:0)+'%'}),el('div',{class:'breadth-down',style:'width:'+(s.count?s.negative/s.count*100:0)+'%'})),el('div',{class:'legend'},el('span',{class:'positive'},'● Naik '+s.positive),el('span',{class:'negative'},'● Turun '+s.negative),el('span',{},'● Netral '+Math.max(0,s.count-s.positive-s.negative)))));
}
function renderNews(){
 const v=$('#view');v.replaceChildren();const news=Array.isArray(data?.news)?data.news:[];
 v.append(sectionHead('News Intelligence','Berita dari sumber RSS yang dikonfigurasi.'));
 if(!news.length)return v.append(empty('Belum ada berita','Sumber berita belum terhubung atau belum mengirim artikel. Konfigurasi NEWS_FEEDS di server.'));
 news.forEach(n=>v.append(el('article',{class:'news-card'},el('div',{class:'news-meta'},el('span',{},esc(n.source)),el('time',{},dateTime(n.published_at))),el('a',{href:n.link,target:'_blank',rel:'noopener noreferrer'},esc(n.title)),el('p',{},esc(n.description||'Buka sumber untuk membaca detail artikel.')))));
}
function renderUnlock(){
 const v=$('#view');v.replaceChildren();const items=[...(data?.unlocks||[])].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 v.append(sectionHead('Token Unlock Calendar','Jadwal pelepasan token berdasarkan sumber data yang dikonfigurasi.'));
 if(!items.length)return v.append(empty('Data unlock belum tersedia','Tambahkan data/unlocks.json atau UNLOCKS_URL. RADAR tidak mengarang jadwal unlock.'));
 items.forEach(u=>v.append(el('div',{class:'unlock-row'},el('div',{class:'unlock-date'},el('b',{},u.date?new Date(u.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short'}):'—'),el('small',{},u.date?new Date(u.date).getFullYear():'')),el('div',{class:'unlock-asset'},el('b',{},esc(u.symbol||u.id)),el('small',{},esc(u.source))),el('div',{class:'unlock-value'},money(u.amount_usd),el('small',{},u.pct_supply==null?'Persentase tidak tersedia':u.pct_supply+'% supply')))));
}
function renderAlerts(){
 const v=$('#view');v.replaceChildren();const items=data?.alerts||[];
 v.append(sectionHead('Alert Center','Riwayat peringatan dari sistem pemantauan RADAR.'));
 if(!items.length)return v.append(empty('Belum ada alert','Alert akan muncul saat kondisi pemantauan terpenuhi.'));
 items.forEach(a=>v.append(el('article',{class:'alert-row'},el('span',{class:'alert-symbol'},a.type==='health'?'!':'⌁'),el('div',{class:'alert-copy'},el('b',{},esc(a.type).replaceAll('_',' ').toUpperCase()),el('p',{},esc(a.msg)),el('small',{},dateTime(a.at)+' · Telegram: '+(a.delivered?'terkirim':'tidak terkirim'))))));
}
function renderAI(){
 const v=$('#view');v.replaceChildren();const g=aiGroup?.last;
 v.append(sectionHead('AI Council','Empat model memberikan perspektif terpisah. Hasil adalah analisis, bukan instruksi transaksi.'));
 if(!g)return v.append(empty('Belum ada rapat AI','Laporan grup dijadwalkan pukul 09.00 WIB jika server dan API aktif.'));
 v.append(card(el('div',{class:'row-between'},el('div',{},el('div',{class:'eyebrow'},'COUNCIL DECISION'),el('h2',{},'Keputusan kolektif')),el('span',{class:'decision '+String(g.final?.decision||'WAIT').toLowerCase()},g.final?.decision||'WAIT')),el('p',{},g.final?.summary||'Tidak ada ringkasan.'),el('div',{class:'stats-grid compact'},statCard('KEYAKINAN',(g.final?.confidence_score??0)+'/100','Skor dari moderator','◉'),statCard('ANGGOTA VALID',(g.analyses||[]).filter(a=>!a.error).length+'/4','Respons provider','✳')),el('small',{class:'muted'},dateTime(g.created_at)+' · '+esc(g.status))));
 (g.analyses||[]).forEach(a=>v.append(card(el('div',{class:'row-between'},el('b',{},esc(a.provider).toUpperCase()),el('span',{class:a.error?'negative':'positive'},a.error?'ERROR':esc(a.decision||'REVIEW'))),a.error?el('p',{class:'negative'},a.error):el('p',{},esc(a.summary)),...(a.reasons||[]).map(x=>el('p',{class:'muted'},'• '+x)),...(a.risks||[]).map(x=>el('span',{class:'flag'},x)))));
 v.append(card(el('b',{},'Risiko dan batasan'),...(g.final?.risks||[]).map(x=>el('p',{class:'muted'},'• '+x)),el('p',{class:'muted'},'RADAR tidak mengeksekusi transaksi. Keputusan akhir dan risiko tetap berada pada pengguna.')));
}
function renderWorkspace(){
 const v=$('#view');v.replaceChildren();const r=aiWorkspace?.last;
 v.append(sectionHead('AI Workspace','Ruang kolaborasi untuk menemukan kekurangan dan mengusulkan peningkatan RADAR.',el('button',{class:'secondary-btn',onclick:runWorkspaceNow},'✳ Jalankan 4 AI sekarang')));
 if(!r)return v.append(empty('Belum ada hasil review workspace','Empat model akan memberi usulan pada jadwal 10.00 WIB setelah fitur ini aktif di server.'));
 v.append(card(el('div',{class:'row-between'},el('div',{},el('div',{class:'eyebrow'},'INDEPENDENT REVIEW'),el('h2',{},'Rapat perbaikan RADAR')),el('span',{class:r.status==='completed'?'positive':'warning'},r.status==='completed'?'● SELESAI':'◌ BELUM LENGKAP')),el('p',{class:'muted'},dateTime(r.created_at)+' · '+(r.agent_count||0)+'/4 AI aktif'),el('p',{},'Setiap model menilai dari sudut pandang berbeda. Usulan belum menjadi perubahan kode.')));
 (r.agents||[]).forEach(a=>{
  const p=card(el('div',{class:'row-between'},el('b',{},esc(a.provider).toUpperCase()),el('span',{class:a.error?'negative':'positive'},a.error?'GAGAL':(a.proposals||[]).length+' USULAN')),a.error?el('p',{class:'negative'},a.error):el('p',{},esc(a.observation)));
  (a.proposals||[]).forEach((q,i)=>{
   const proposal=el('div',{class:'proposal-card'},
    el('div',{class:'row-between'},el('b',{},(i+1)+'. '+esc(q.title)),el('span',{class:'flag'},esc(q.priority).toUpperCase())),
    el('p',{},esc(q.problem)),
    el('p',{class:'muted'},'Manfaat: '+esc(q.benefit)),
    el('p',{class:'muted'},'Usaha: '+esc(q.effort)+' · Risiko: '+esc(q.risk)),
    ...(q.files||[]).map(f=>el('span',{class:'file-chip'},f)),
    ...(q.acceptance_criteria||[]).map(c=>el('p',{class:'muted'},'✓ '+c))
   );
   p.append(proposal);
  });
  if(a.challenge)p.append(el('p',{class:'muted'},'Tantangan: '+a.challenge));if(a.self_critique)p.append(el('p',{class:'muted'},'Evaluasi diri: '+a.self_critique));v.append(p);
 });
 v.append(card(el('b',{},'Keputusan Direktur Utama'),el('p',{},r.director_status||'Menunggu penilaian.'),el('p',{class:'muted'},'Perubahan kode hanya melalui branch terpisah, tes, Draft PR, dan persetujuan pemilik. Tidak ada auto-merge atau auto-trading.')));
}
async function runWorkspaceNow(){
 const token=window.prompt('Masukkan ADMIN_TOKEN RADAR untuk menjalankan rapat 4 AI. Token hanya dipakai untuk permintaan ini dan tidak disimpan.');
 if(!token)return;
 try{
  const response=await fetch('/api/ai/workspace/run',{method:'POST',headers:{'x-admin-token':token}});
  if(response.status===403)throw new Error('ADMIN_TOKEN tidak cocok.');
  if(!response.ok)throw new Error('Endpoint belum aktif di server ('+response.status+').');
  toast('Rapat 4 AI dimulai. Hasil akan dimuat otomatis.');
  for(let i=0;i<12;i++){
   await new Promise(resolve=>setTimeout(resolve,5000));
   const r=await fetch('/api/ai/workspace',{cache:'no-store'});
   if(r.ok){aiWorkspace=(await r.json()).workspace;if(aiWorkspace?.last){render();if(aiWorkspace.last.status==='completed')toast('Review 4 AI selesai');return;}}
  }
  render();toast('AI masih memproses. Buka kembali Ruang Kerja sebentar lagi.');
 }catch(e){toast(e.message||'Gagal menjalankan review AI');}
}
function renderSystem(){
 const v=$('#view');v.replaceChildren();const health=data?.health||{};
 v.append(sectionHead('System Health','Transparansi status sumber data dan runtime.'));
 v.append(el('div',{class:'stats-grid'},statCard('API STATUS',data?'ONLINE':'OFFLINE','Dashboard dapat membaca snapshot','◉',data?'positive':'negative'),statCard('LAST SUCCESS',dateTime(data?.last_ok),'Refresh terakhir yang berhasil','↻'),statCard('TOKEN FEED',getTokens().length,'Token tersedia','◈'),statCard('ALERT LOG',(data?.alerts||[]).length,'Riwayat tersimpan','⌁')));
 const rows=Object.entries(health);
 v.append(card(sectionHead('Data Source Monitor','Status setiap sumber yang dipakai server.'),...rows.map(([name,s])=>el('div',{class:'source-row'},el('div',{},el('b',{},name.toUpperCase()),el('small',{},dateTime(s.at)),s.error?el('small',{class:'negative'},s.error):null),el('span',{class:s.ok?'source-ok':'source-error'},s.ok?'HEALTHY':'ERROR')))));
 v.append(card(sectionHead('Konfigurasi & batas sistem','Informasi yang dapat dibaca dari API snapshot.'),el('div',{class:'detail-grid'},el('div',{},el('small',{},'Status data'),el('b',{},data?.stale?'Stale / perlu refresh':'Aktif')),el('div',{},el('small',{},'Telegram'),el('b',{},data?.config_needed?.telegram?'Belum dikonfigurasi':'Terkonfigurasi')),el('div',{},el('small',{},'CoinGecko key'),el('b',{},data?.config_needed?.coingecko_key?'Tidak tersedia':'Terkonfigurasi')),el('div',{},el('small',{},'Unlock source'),el('b',{},data?.config_needed?.unlock_source?'Belum tersedia':'Terkonfigurasi'))),el('p',{class:'muted'},'API key dan token tidak pernah ditampilkan di dashboard.')));
}
function render(){
 $('#page-title').textContent=TITLES[tab]||'RADAR AI';$('#crumb').textContent=(tab||'overview').toUpperCase();
 document.querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
 if(tab==='overview')renderOverview();else if(tab==='screener')renderScreener();else if(tab==='watch')renderWatch();else if(tab==='analytics')renderAnalytics();else if(tab==='news')renderNews();else if(tab==='unlock')renderUnlock();else if(tab==='alerts')renderAlerts();else if(tab==='ai')renderAI();else if(tab==='workspace')renderWorkspace();else renderSystem();
}
function setSidebarOpen(open){
 const sidebar=$('#sidebar'),toggle=$('#menu-toggle');
 sidebar.classList.toggle('open',open);
 document.body.classList.toggle('sidebar-open',open);
 toggle.setAttribute('aria-expanded',String(open));
 toggle.setAttribute('aria-label',open?'Tutup menu':'Buka menu');
}
function closeSidebar(){setSidebarOpen(false);}
function navigate(next){tab=next;render();closeSidebar();window.scrollTo({top:0,behavior:'smooth'});}
function updateStatus(){
 if(!data)return;
 const age=data.last_ok?Date.now()-Date.parse(data.last_ok):Infinity,stale=Boolean(data.stale)||age>30*60000;
 $('#status').textContent=stale?'Data perlu diperiksa':'Semua sistem berjalan';
 $('#side-status').textContent=stale?'Data perlu diperiksa':'Feed terhubung';
 $('#banner').hidden=!stale;
 $('#banner').textContent=stale?'Sebagian data mungkin sudah lama atau belum tersedia. Periksa System Health sebelum mengambil keputusan.':'';
}
async function load(){
 try{
  const r=await fetch('/api/snapshot',{cache:'no-store'});if(!r.ok)throw new Error('snapshot '+r.status);data=await r.json();
 }catch(e){$('#status').textContent='Gagal menghubungkan';$('#side-status').textContent='Koneksi bermasalah';}
 try{const r=await fetch('/api/ai/group',{cache:'no-store'});if(r.ok)aiGroup=(await r.json()).group;}catch{}
 try{const r=await fetch('/api/ai/workspace',{cache:'no-store'});if(r.ok)aiWorkspace=(await r.json()).workspace;}catch{}
 updateStatus();render();
}
async function refreshNow(){
 if(refreshBusy)return;refreshBusy=true;$('#refresh').classList.add('spinning');toast('Memuat data terbaru…');
 try{await load();toast('Dashboard diperbarui');}finally{refreshBusy=false;$('#refresh').classList.remove('spinning');}
}
function exportCSV(){
 const rows=getTokens();if(!rows.length)return toast('Tidak ada data untuk diekspor');
 const cols=['symbol','name','price','change_24h','change_7d','market_cap','volume_24h','fdv','vol_mcap'];
 const csv=[cols.join(','),...rows.map(t=>cols.map(k=>'"'+String(t[k]??'').replaceAll('"','""')+'"').join(','))].join('\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:'radar-ai-market-'+new Date().toISOString().slice(0,10)+'.csv'});a.click();URL.revokeObjectURL(url);toast('CSV berhasil disiapkan');
}
document.querySelectorAll('[data-t]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.t)));
$('.brand').addEventListener('click',e=>{e.preventDefault();navigate('overview');});
$('#refresh').addEventListener('click',refreshNow);
$('#theme').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem('radar-theme-v2',next);}catch{}});
$('#menu-toggle').addEventListener('click',()=>setSidebarOpen(!$('#sidebar').classList.contains('open')));
$('#sidebar-backdrop').addEventListener('click',closeSidebar);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#sidebar').classList.contains('open'))closeSidebar();});
window.addEventListener('resize',()=>{if(window.innerWidth>760)closeSidebar();});
try{const saved=localStorage.getItem('radar-theme-v2');if(saved)document.documentElement.dataset.theme=saved;}catch{}
load();setInterval(load,120000);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
