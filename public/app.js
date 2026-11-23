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
const TITLES = {'early-gems':'Early Gem Scanner',solscan:'Solana Intelligence',overview:'Ringkasan Pasar',screener:'Market Screener',watch:'Watchlist',analytics:'Analitik Pasar',news:'News Feed',unlock:'Token Unlock',alerts:'Alert Center',ai:'AI Council',workspace:'AI Workspace',system:'System Health'};
let data=null, aiGroup=null, aiWorkspace=null, solscanOverview=null, tab='overview', watch=[], expanded=null, refreshBusy=false, toastTimer, snapshotReachable=false;
let screenerFilters={q:'',trend:'all',sort:'market_cap'},screenerVisible=[],earlyGemFilters={q:'',minLiquidity:0};
try {
 const stored=JSON.parse(localStorage.getItem('radar-watch')||'[]');
 if(Array.isArray(stored))watch=[...new Set(stored.filter(x=>typeof x==='string'&&x.length>0&&x.length<=128))];
} catch {}
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
 v.append(el('div',{class:'welcome-row'},el('div',{},el('div',{class:'eyebrow'},'MARKET PULSE / LIVE DATA'),el('h2',{},'Selamat datang di RADAR.'),el('p',{class:'muted'},'Satu ruang untuk memantau pasar, menemukan peluang, dan membaca analisis AI.')),el('div',{class:'updated-box'},el('small',{},'PEMBARUAN TERAKHIR'),el('b',{},dateTime(data?.last_ok)),el('span',{class:'live-chip'},(data?.stale||!snapshotReachable)?'DATA PERLU DICEK':'● DATA TERHUBUNG'))));
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
 const solscanStatus=solscanOverview?.ok?(solscanOverview.partial?'PARTIAL':'ONLINE'):(solscanOverview?.code||'BELUM TERHUBUNG');
 const solscanPanel=card(sectionHead('Solana On-Chain Intelligence','Data indeks Solscan untuk aktivitas jaringan, token trending, transaksi dan block.',el('button',{class:'text-btn',onclick:()=>{window.location.href='/solscan.html';}},'Buka Solscan →')),
  el('div',{class:'detail-grid'},
   el('div',{},el('small',{},'STATUS SOLSCAN'),el('b',{class:solscanOverview?.ok?'positive':'muted'},solscanStatus)),
   el('div',{},el('small',{},'ENDPOINT TERSEDIA'),el('b',{},(solscanOverview?.endpoint_count??0)+' / '+(solscanOverview?.endpoint_total??9))),
   el('div',{},el('small',{},'JARINGAN'),el('b',{},'Solana Mainnet')),
   el('div',{},el('small',{},'OBSERVASI'),el('b',{},dateTime(solscanOverview?.observed_at)))
  ));
 v.append(movers,market,bottom,solscanPanel);
}
function renderScreener(){
 const v=$('#view');v.replaceChildren();
 const controls=el('div',{class:'filter-panel'},
  el('input',{id:'filter-q',type:'search',placeholder:'Cari nama atau simbol…',value:screenerFilters.q}),
  el('select',{id:'filter-trend'},el('option',{value:'all'},'Semua tren'),el('option',{value:'up'},'Sedang naik'),el('option',{value:'down'},'Sedang turun')),
  el('select',{id:'filter-sort'},el('option',{value:'market_cap'},'Market cap'),el('option',{value:'volume_24h'},'Volume 24 jam'),el('option',{value:'vol_mcap'},'Vol / MCap'),el('option',{value:'change_24h'},'Perubahan 24 jam'),el('option',{value:'change_7d'},'Perubahan 7 hari')),
  el('button',{class:'secondary-btn',onclick:()=>{screenerFilters={q:'',trend:'all',sort:'market_cap'};renderScreener();}},'Reset')
 );
 const results=el('div',{id:'screener-results'});
 const update=()=>{
  screenerFilters={q:$('#filter-q').value,trend:$('#filter-trend').value,sort:$('#filter-sort').value};
  const q=screenerFilters.q.trim().toLowerCase(),trend=screenerFilters.trend,key=screenerFilters.sort;
  const list=getTokens().filter(t=>(!q||String(t.symbol).toLowerCase().includes(q)||String(t.name).toLowerCase().includes(q))&&(trend==='all'||(trend==='up'?Number(t.change_24h)>0:Number(t.change_24h)<0)));
  list.sort((a,b)=>{
   const av=Number(a[key]),bv=Number(b[key]),aOk=Number.isFinite(av),bOk=Number.isFinite(bv);
   if(aOk!==bOk)return aOk?-1:1;
   return aOk?bv-av:0;
  });
  screenerVisible=list;
  $('#result-count').textContent=list.length+' aset ditemukan';
  results.replaceChildren(tokenTable(list));
 };
 v.append(sectionHead('Temukan aset','Cari dan saring token berdasarkan aktivitas pasar.',el('button',{class:'secondary-btn',onclick:exportCSV},'↓ Ekspor hasil CSV')),controls,el('div',{class:'result-meta'},el('b',{id:'result-count'},'Memuat…'),el('span',{class:'muted'},'Filter tetap tersimpan saat data diperbarui')),results);
 $('#filter-trend').value=screenerFilters.trend;
 $('#filter-sort').value=screenerFilters.sort;
 ['filter-q','filter-trend','filter-sort'].forEach(id=>$('#'+id).addEventListener(id==='filter-q'?'input':'change',update));
 update();
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
 const bars=(items,key)=>el('div',{class:'bar-list'},...items.map(t=>{const max=Math.max(1,...items.map(x=>Number(x[key])||0));return el('div',{class:'bar-item'},el('div',{class:'bar-caption'},el('b',{},esc(t.symbol)),el('span',{},money(t[key]))),el('div',{class:'bar-track'},el('progress',{class:'bar-fill',max:String(max),value:String(Math.max(0,Number(t[key])||0)),'aria-label':esc(t.symbol)+' '+key})));}));
 v.append(sectionHead('Market Analytics','Pembacaan statistik dari token yang sedang terpantau.'));
 v.append(el('div',{class:'stats-grid'},statCard('NAIK',s.positive,'Aset dengan return positif','↗','positive'),statCard('TURUN',s.negative,'Aset dengan return negatif','↘','negative'),statCard('MARKET CAP',money(s.cap),'Total dalam universe radar','◫'),statCard('VOLUME',money(s.vol),'Agregat volume 24 jam','⇅')));
 v.append(el('div',{class:'two-col'},card(sectionHead('Top Market Cap','Aset dengan kapitalisasi terbesar'),bars(capSorted,'market_cap')),card(sectionHead('Top Volume','Aset dengan volume perdagangan terbesar'),bars(volSorted,'volume_24h'))));
 v.append(card(sectionHead('Distribusi Market Breadth','Jumlah token berdasarkan arah perubahan 24 jam'),el('progress',{class:'breadth-progress',max:String(s.count||1),value:String(s.positive),'aria-label':'Market breadth: '+s.positive+' naik dari '+s.count+' aset'}),el('div',{class:'legend'},el('span',{class:'positive'},'● Naik '+s.positive),el('span',{class:'negative'},'● Turun '+s.negative),el('span',{},'● Netral '+Math.max(0,s.count-s.positive-s.negative)))));
}
function renderNews(){
 const v=$('#view');v.replaceChildren();const news=Array.isArray(data?.news)?data.news:[];
 const health=data?.health?.news;
 const sources=Array.isArray(data?.health?.news_sources)?data.health.news_sources:[];
 v.append(sectionHead('News Intelligence','Berita dari sumber RSS yang dikonfigurasi.'));
 const status=el('div',{class:'panel news-health'},
  el('div',{class:'health-line'},el('span',{},'Koneksi RSS'),el('b',{class:health?.ok?'positive':health?'negative':'muted'},health?.ok?'● ONLINE':health?'● ERROR':'● BELUM DICEK')));
 sources.forEach((source) => {
  const label = source.ok ? '● ONLINE · ' + source.count + ' artikel' : '● ' + (source.error || 'ERROR');
  status.append(el('div',{class:'health-line'},el('span',{},esc(source.host)),el('b',{class:source.ok?'positive':'negative'},label)));
 });
 if(health?.error)status.append(el('p',{class:'muted news-health-error'},'Kode diagnostik: '+esc(health.error)));
 v.append(status);
 if(!news.length)return v.append(empty(health&&!health.ok?'Sumber RSS bermasalah':'Belum ada berita',health?.error?'Status: '+health.error+' — periksa NEWS_FEEDS dan akses jaringan server.':'Feed terhubung tetapi belum mengirim artikel, atau refresh berikutnya belum berjalan.'));
 news.forEach(n=>v.append(el('article',{class:'news-card'},el('div',{class:'news-meta'},el('span',{},esc(n.source)),el('time',{},dateTime(n.published_at))),el('a',{href:n.link,target:'_blank',rel:'noopener noreferrer'},esc(n.title)),el('p',{},esc(n.summary||n.description||'Buka sumber untuk membaca detail artikel.')))));
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
function renderEarlyGems(){
 const v=$('#view');v.replaceChildren();
 const all=Array.isArray(data?.early_gems)?data.early_gems:[];
 const health=data?.health?.onchain||null,meta=data?.early_gems_meta||null;
 const enabled=data?.config_needed?.early_gems_enabled!==false;
 const feedAgeMs=meta?.fetched_at?Date.now()-Date.parse(meta.fetched_at):Infinity;
 const staleAfterMs=Math.max(30,Number(data?.config_needed?.onchain_refresh_min)||60)*1.5*60*1000;
 const feedStale=!enabled||!Number.isFinite(feedAgeMs)||feedAgeMs>staleAfterMs;
 const chains=new Set(all.map(x=>x.network_id).filter(Boolean));
 const totalVolume=all.reduce((sum,x)=>sum+(Number(x.volume_24h_usd)||0),0);
 const liquid=all.filter(x=>Number(x.liquidity_usd)>=5000).length;
 const fresh=all.filter(x=>x.age_hours!==null&&Number.isFinite(Number(x.age_hours))&&Number(x.age_hours)<=24).length;
 v.append(sectionHead('Early Gem Scanner','Pool DEX baru dari jaringan yang diindeks GeckoTerminal; bukan daftar semua token yang pernah dibuat.',
  el('span',{class:'muted'},meta?.fetched_at?'Update '+dateTime(meta.fetched_at):'Belum ada sinkronisasi')));
 v.append(el('div',{class:'stats-grid'},
  statCard('POOL TERDETEKSI',all.length,'Maksimal '+(meta?.pool_count||all.length)+' pool dalam feed','✧'),
  statCard('JARINGAN',chains.size,'Network berbeda pada hasil','◈'),
  statCard('VOLUME 24 JAM',money(totalVolume),'Agregat pool yang tampil','⇅'),
  statCard('TRENDING POOL',all.filter(x=>x.is_trending).length,'Likuiditas ≥ $5K: '+liquid+' · umur ≤ 24j: '+fresh,'⌁')));
 const status=el('div',{class:'gem-status '+(health?.ok&&!feedStale?'good':health?'bad':'muted')},
  el('b',{},!enabled?'● FEED DISABLED':health?.ok&&!feedStale?'● ON-CHAIN FEED ONLINE':health?.ok?'● FEED STALE':health?'● ON-CHAIN FEED ERROR':'● MENUNGGU SINKRONISASI'),
  el('span',{},!enabled?'EARLY_GEMS_ENABLED=0; feed on-chain dinonaktifkan.':health?.error?'Kode: '+health.error:meta?.trending_error?'Pool baru aktif; trending feed gagal ('+meta.trending_error+').':feedStale&&meta?'Data on-chain lebih dari 30 menit; cek jadwal refresh server.':(meta?'Sumber: '+(meta.source||'CoinGecko Onchain / GeckoTerminal')+' · Jendela pool baru hingga 48 jam':'Pastikan CoinGecko Demo API key tersedia dan refresh server berhasil.')));
 v.append(status);
 const controls=el('div',{class:'filter-panel gem-filters'},
  el('input',{id:'gem-q',type:'search',placeholder:'Cari token, simbol, chain, atau DEX…',value:earlyGemFilters.q}),
  el('select',{id:'gem-liquidity'},
   el('option',{value:'0'},'Semua likuiditas'),
   el('option',{value:'5000'},'Likuiditas ≥ $5K'),
   el('option',{value:'25000'},'Likuiditas ≥ $25K'),
   el('option',{value:'100000'},'Likuiditas ≥ $100K')),
  el('button',{class:'secondary-btn',onclick:()=>{earlyGemFilters={q:'',minLiquidity:0};renderEarlyGems();}},'Reset filter'));
 const results=el('div',{class:'gem-grid',id:'gem-results'});
 const updateResults=()=>{
  earlyGemFilters={q:$('#gem-q').value,minLiquidity:Number($('#gem-liquidity').value)||0};
  const q=earlyGemFilters.q.trim().toLowerCase();
  const rows=all.filter(x=>(!q||[x.symbol,x.token_name,x.network,x.dex,x.pool_name,x.token_address].some(value=>String(value||'').toLowerCase().includes(q)))
   &&(earlyGemFilters.minLiquidity===0||(Number(x.liquidity_usd)||0)>=earlyGemFilters.minLiquidity));
  results.replaceChildren();
  if(!rows.length){results.append(empty(all.length?'Tidak ada pool yang cocok':'Belum ada data pool','Ubah filter atau periksa status sumber on-chain di atas.'));return;}
  rows.forEach(x=>{
   const flags=(x.risk_flags||[]).map(flag=>({liquidity_unknown:'Likuiditas N/A',liquidity_low:'Likuiditas rendah',volume_unknown:'Volume N/A',volume_low:'Volume rendah',market_cap_unverified:'Market cap belum diverifikasi',trade_count_unknown:'Jumlah transaksi N/A'}[flag]||flag));
   const age=x.age_hours!==null&&Number.isFinite(Number(x.age_hours))?(Number(x.age_hours)<1?Math.max(1,Math.round(Number(x.age_hours)*60))+' menit lalu':Number(x.age_hours)<48?Number(x.age_hours).toFixed(1)+' jam lalu':(Number(x.age_hours)/24).toFixed(1)+' hari lalu'):'Umur pool N/A';
   const link=typeof x.pool_url==='string'&&x.pool_url.startsWith('https://www.geckoterminal.com/')?x.pool_url:null;
   const tokenLink=typeof x.token_url==='string'&&x.token_url.startsWith('https://www.geckoterminal.com/')?x.token_url:null;
   const tokenAddress=String(x.token_address||'');
   const item=el('article',{class:'gem-card'},
    el('div',{class:'gem-card-top'},
     el('div',{class:'gem-identity'},el('span',{class:'coin-avatar'},esc(x.symbol).slice(0,3)),el('div',{},el('b',{},esc(x.symbol)),el('small',{},esc(x.token_name)))),
     el('span',{class:'gem-label'},esc(x.is_trending&&x.discovery_label!=='TRENDING'?'NEW + TRENDING':x.discovery_label||'RECENT POOL'))),
    el('div',{class:'gem-chain'},esc(x.network)+' · '+esc(x.dex)+' · '+age),
    el('div',{class:'gem-metrics'},
     el('div',{},el('small',{},'LIKUIDITAS'),el('b',{},money(x.liquidity_usd))),
     el('div',{},el('small',{},'VOLUME 24J'),el('b',{},money(x.volume_24h_usd))),
     el('div',{},el('small',{},'HARGA'),el('b',{},x.price_usd==null?'—':Number(x.price_usd).toPrecision(6)+' USD')),
     el('div',{},el('small',{},'FDV / MCAP'),el('b',{},money(x.market_cap_usd)+' / '+money(x.fdv_usd))),
     el('div',{},el('small',{},'PERUBAHAN 24J'),el('b',{},pct(x.price_change_24h_pct))),
     el('div',{},el('small',{},'BUY / SELL 24J'),el('b',{},(x.buys_24h??'—')+' / '+(x.sells_24h??'—')))),
    flags.length?el('div',{class:'gem-flags'},...flags.map(flag=>el('span',{class:'flag'},flag))):el('div',{class:'gem-flags'},el('span',{class:'gem-clean'},'Tidak ada flag kualitas data')),
    el('div',{class:'gem-footer'},el('small',{title:tokenAddress},'CA: '+(tokenAddress?tokenAddress.slice(0,8)+'…'+tokenAddress.slice(-6):'N/A')),el('div',{class:'gem-links'},tokenLink?el('a',{href:tokenLink,target:'_blank',rel:'noopener noreferrer'},'Token ↗'):null,link?el('a',{href:link,target:'_blank',rel:'noopener noreferrer'},'Pool ↗'):null)));

   const validation=el('div',{class:'gem-validation-actions'});
   const dexButton=el('button',{class:'mini-btn',type:'button',disabled:tokenAddress?null:true},'Validasi DEX');
   const dexResult=el('div',{class:'gem-validation-result'},'DEX Screener belum diperiksa.');
   dexButton.addEventListener('click',async()=>{
    dexButton.disabled=true;dexResult.textContent='Memeriksa pair DEX Screener…';
    try{
     const query=new URLSearchParams({network:String(x.network_id||''),token:tokenAddress,pool:String(x.pool_address||'')});
     const response=await fetch('/api/market-intelligence/dexscreener?'+query.toString(),{cache:'no-store'});
     const result=await response.json();if(!response.ok||result.status!=='success')throw new Error(result.code||result.message||'DEX validation failed');
     const rows=(result.pairs||[]).slice(0,3).map(pair=>el('div',{class:'gem-validation-line'},
      el('b',{},String(pair.dex_id||'DEX')+' · '+String(pair.base_token?.symbol||'?')+'/'+String(pair.quote_token?.symbol||'?')),
      el('span',{},'Likuiditas pair '+money(pair.liquidity_usd)+' · Volume pair 24J '+money(pair.volume_24h_usd)+' · '+pct(pair.price_change_24h_pct)),
      pair.same_pool?el('small',{class:'gem-clean'},'Alamat pool cocok dengan GeckoTerminal'):el('small',{class:'muted'},'Pair token cocok; bukan pool yang sama')));
     dexResult.replaceChildren(el('b',{},'DEX Screener · '+result.pair_count+' pair ditemukan'),...(rows.length?rows:[el('small',{class:'muted'},'Tidak ada pair cocok. Ini bukan bukti token scam.')]));
    }catch(error){dexResult.textContent='DEX Screener: '+String(error.message||'tidak tersedia').slice(0,120);}
    finally{dexButton.disabled=false;}
   });
   validation.append(dexButton);
   const goPlusEnabled=Boolean(data?.config_needed?.goplus_enabled);
   const goPlusNetworks=Array.isArray(data?.config_needed?.goplus_supported_networks)?data.config_needed.goplus_supported_networks:[];
   const goPlusNetwork=String(x.network_id||'').toLowerCase();
   const goPlusChain=goPlusNetworks.find(chain=>String(chain.id).toLowerCase()===goPlusNetwork||(chain.aliases||[]).some(alias=>String(alias).toLowerCase()===goPlusNetwork));
   const goPlusSupported=Boolean(goPlusChain);
   const goPlusButton=el('button',{class:'mini-btn',type:'button',disabled:goPlusEnabled&&tokenAddress&&goPlusSupported?null:true,title:!goPlusSupported?'Jaringan ini belum ada pada daftar dukungan Token Security GoPlus':goPlusEnabled?'Periksa risiko kontrak GoPlus':'Atur GOPLUS_ACCESS_TOKEN atau GOPLUS_APP_KEY + GOPLUS_APP_SECRET di Hostless'},!goPlusSupported?'GoPlus tidak mendukung chain':goPlusEnabled?'Audit GoPlus':'GoPlus belum diatur');
   const quota=data?.config_needed?.goplus_usage||{};
   const quotaText='Kuota internal GoPlus: '+(quota.day_count||0)+'/'+(quota.daily_limit||1000)+' hari ini · '+(quota.month_count||0)+'/'+(quota.monthly_limit||5000)+' bulan ini.';
   const goPlusResult=el('div',{class:'gem-validation-result'},(goPlusEnabled?'Audit GoPlus belum dijalankan.':'GoPlus gratis tersedia; konfigurasi kredensial Console server-side diperlukan.')+' '+(goPlusSupported?'Jaringan didukung: '+goPlusChain.name+'.':'Jaringan ini belum didukung GoPlus Token Security.')+' '+quotaText);
   goPlusButton.addEventListener('click',async()=>{
    goPlusButton.disabled=true;goPlusResult.textContent='Memeriksa keamanan token GoPlus…';
    try{
     const credentialResponse=await fetch('/api/market-intelligence/goplus/status',{cache:'no-store'});
     const credentialStatus=await credentialResponse.json();
     if(!credentialResponse.ok||!credentialStatus.verified)throw new Error(credentialStatus.error_code||'GOPLUS_CREDENTIALS_NOT_VERIFIED');
     const query=new URLSearchParams({network:String(x.network_id||''),token:tokenAddress});
     const response=await fetch('/api/market-intelligence/goplus?'+query.toString(),{cache:'no-store'});
     const result=await response.json();if(!response.ok||!['success','partial'].includes(result.status))throw new Error(result.code||result.message||'GoPlus validation failed');
     const flags=(result.risk_flags||[]).map(flag=>el('span',{class:'flag'},flag.label+' ['+flag.severity+']'));
     const security=result.data||{},known=(key)=>security[key]===undefined?'Tidak diketahui':String(security[key]);
     const tax=(key)=>{const n=Number(security[key]);return security[key]===undefined||!Number.isFinite(n)?'—':(n*100).toFixed(2)+'%';};
     const details=el('div',{class:'gem-validation-line'},
      el('span',{},'Open source: '+known('is_open_source')+' · Honeypot: '+known('is_honeypot')),
      el('span',{},'Buy tax: '+tax('buy_tax')+' · Sell tax: '+tax('sell_tax')),
      el('span',{},'Mintable: '+known('is_mintable')+' · Holders: '+known('holder_count')));
     goPlusResult.replaceChildren(el('b',{},'GoPlus · '+(result.status==='partial'?'DATA PARSIAL':'DATA TERSEDIA')),details,
      ...(flags.length?flags:[el('small',{class:'muted'},'Tidak ada flag positif yang dilaporkan. Field yang kosong tetap tidak diketahui; ini bukan jaminan aman.')]),
      el('small',{class:'muted'},'Update '+dateTime(result.observed_at)));
    }catch(error){goPlusResult.textContent='GoPlus: '+String(error.message||'tidak tersedia').slice(0,140);}
    finally{goPlusButton.disabled=false;}
   });
   validation.append(goPlusButton);
   item.append(validation,dexResult,goPlusResult);
   results.append(item);
  });
  $('#gem-count').textContent=rows.length+' pool ditampilkan';
 };
 v.append(controls,el('div',{class:'result-meta'},el('b',{id:'gem-count'},'Memuat…'),el('span',{class:'muted'},'Feed lintas-chain · maksimum 10 halaman API')),results,
  card(el('b',{},'Catatan risiko & cakupan'),
   el('p',{class:'muted'},'Pool baru bukan bukti token baru dibuat. Feed ini menampilkan pool DEX yang telah terindeks (jendela data sekitar 48 jam), bukan seluruh kontrak token di semua blockchain. Token tanpa pool likuid, chain yang belum didukung, atau pool yang belum terindeks tidak akan muncul.'),
   el('p',{class:'muted'},'Flag hanya menunjukkan data yang kosong/rendah; ini bukan audit kontrak, pemeriksaan honeypot, verifikasi pemilik, analisis holder, atau rekomendasi beli. Market cap yang tidak diverifikasi tetap ditampilkan sebagai N/A.')));
 $('#gem-liquidity').value=String(earlyGemFilters.minLiquidity);
 ['gem-q','gem-liquidity'].forEach(id=>$('#'+id).addEventListener(id==='gem-q'?'input':'change',updateResults));
 updateResults();
}
function renderSystem(){
 const v=$('#view');v.replaceChildren();const health=data?.health||{};
 v.append(sectionHead('System Health','Transparansi status sumber data dan runtime.'));
 v.append(el('div',{class:'stats-grid'},statCard('API STATUS',data&&snapshotReachable?'ONLINE':'OFFLINE',snapshotReachable?'Snapshot berhasil dijangkau':'Server tidak dapat dijangkau; data lama mungkin tampil','◉',snapshotReachable?'positive':'negative'),statCard('LAST SUCCESS',dateTime(data?.last_ok),'Refresh terakhir yang berhasil','↻'),statCard('TOKEN FEED',getTokens().length,'Token tersedia','◈'),statCard('ALERT LOG',(data?.alerts||[]).length,'Riwayat tersimpan','⌁')));
 const rows=Object.entries(health);
 v.append(card(sectionHead('Data Source Monitor','Status setiap sumber yang dipakai server.'),...rows.map(([name,s])=>el('div',{class:'source-row'},el('div',{},el('b',{},name.toUpperCase()),el('small',{},dateTime(s.at)),s.error?el('small',{class:'negative'},s.error):null),el('span',{class:s.ok?'source-ok':'source-error'},s.ok?'HEALTHY':'ERROR')))));
 v.append(card(sectionHead('Konfigurasi & batas sistem','Informasi yang dapat dibaca dari API snapshot.'),el('div',{class:'detail-grid'},el('div',{},el('small',{},'Status data'),el('b',{},(data?.stale||!snapshotReachable)?'Stale / koneksi perlu dicek':'Aktif')),el('div',{},el('small',{},'Telegram'),el('b',{},data?.config_needed?.telegram?'Belum dikonfigurasi':'Terkonfigurasi')),el('div',{},el('small',{},'CoinGecko key'),el('b',{},data?.config_needed?.coingecko_key?'Tidak tersedia':'Terkonfigurasi')),el('div',{},el('small',{},'Unlock source'),el('b',{},data?.config_needed?.unlock_source?'Belum tersedia':'Terkonfigurasi'))),el('p',{class:'muted'},'API key dan token tidak pernah ditampilkan di dashboard.')));
}
function render(){
 $('#page-title').textContent=TITLES[tab]||'RADAR AI';$('#crumb').textContent=(tab||'overview').toUpperCase();
 document.querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
 if(tab==='overview')renderOverview();else if(tab==='screener')renderScreener();else if(tab==='early-gems')renderEarlyGems();else if(tab==='watch')renderWatch();else if(tab==='analytics')renderAnalytics();else if(tab==='news')renderNews();else if(tab==='unlock')renderUnlock();else if(tab==='alerts')renderAlerts();else if(tab==='ai')renderAI();else if(tab==='workspace')renderWorkspace();else renderSystem();
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
 let snapshotOk=false;
 try{
  const r=await fetch('/api/snapshot',{cache:'no-store'});if(!r.ok)throw new Error('snapshot '+r.status);data=await r.json();snapshotOk=true;snapshotReachable=true;
 }catch(e){
  snapshotReachable=false;
  $('#status').textContent='Gagal menghubungkan';
  $('#side-status').textContent='Koneksi bermasalah';
  $('#banner').hidden=false;
  $('#banner').textContent='Tidak dapat mengambil snapshot terbaru. Data yang terlihat mungkin merupakan data sebelumnya; coba muat ulang kembali.';
 }
 try{const r=await fetch('/api/ai/group',{cache:'no-store'});if(r.ok)aiGroup=(await r.json()).group;}catch{}
 try{const r=await fetch('/api/solscan/overview',{cache:'no-store'});solscanOverview=await r.json();}catch{solscanOverview={ok:false,code:'SOLSCAN_UNAVAILABLE'};}
 try{const r=await fetch('/api/ai/workspace',{cache:'no-store'});if(r.ok)aiWorkspace=(await r.json()).workspace;}catch{}
 if(snapshotOk)updateStatus();
 render();
 return snapshotOk;
}
async function refreshNow(){
 if(refreshBusy)return;refreshBusy=true;$('#refresh').classList.add('spinning');toast('Memuat data terbaru…');
 try{const ok=await load();toast(ok?'Dashboard berhasil diperbarui':'Gagal memperbarui dashboard. Data sebelumnya dipertahankan.');}
 finally{refreshBusy=false;$('#refresh').classList.remove('spinning');}
}
function exportCSV(){
 const rows=tab==='screener'?screenerVisible:getTokens();
 if(!rows.length)return toast('Tidak ada data untuk diekspor');
 const cols=['symbol','name','price','change_24h','change_7d','market_cap','volume_24h','fdv','vol_mcap'];
 const cell=value=>{
  let raw=String(value??'');
  if(!raw)return '""';
  if(!Number.isFinite(Number(raw))&&/^[\s]*[=+@\-]/.test(raw))raw="'"+raw;
  return '"'+raw.replaceAll('"','""')+'"';
 };
 const csv=[cols.join(','),...rows.map(t=>cols.map(k=>cell(t[k])).join(','))].join('\n');
 const blob=new Blob([String.fromCharCode(0xFEFF),csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:'radar-ai-market-'+new Date().toISOString().slice(0,10)+'.csv'});
 a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV '+rows.length+' aset berhasil disiapkan');
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
