'use strict';
(() => {
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
 const fmt=v=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('id-ID',{maximumFractionDigits:2});
 const validNum=v=>(typeof v==='number'||(typeof v==='string'&&v.trim()!==''))&&Number.isFinite(Number(v));
 const money=v=>v==null||!Number.isFinite(Number(v))?'—':'$'+(Math.abs(Number(v))>=1e9?(Number(v)/1e9).toFixed(2)+'B':Math.abs(Number(v))>=1e6?(Number(v)/1e6).toFixed(2)+'M':Number(v).toLocaleString('en-US',{maximumFractionDigits:2}));
 const date=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'}):'Belum tersedia';
 const age=v=>{if(!v||!Number.isFinite(Date.parse(v)))return 'waktu observasi tidak tersedia';const ms=Date.now()-Date.parse(v);if(ms<0)return 'timestamp di masa depan — periksa jam sumber';const mins=Math.floor(ms/60000);return mins<1?'baru saja':mins<60?mins+' menit lalu':mins<1440?Math.floor(mins/60)+' jam '+(mins%60)+' menit lalu':Math.floor(mins/1440)+' hari lalu';};
 const sourceLine=(name,item)=>{if(!item)return name+': metadata tidak tersedia';const stamp=item.updated_at||item.at||item.observed_at;const state=item.stale?'STALE':item.ok===false?'ERROR':item.ok===true?'OK':'STATUS TIDAK DIKETAHUI';return name+': '+state+' · '+age(stamp)+' · '+date(stamp)+(item.error?' · '+item.error:'');};
 function card(title,status,value,sub,note,metrics=[]){const c=node('section','radar-intel-card');const h=node('div','radar-intel-title');h.append(node('h3','',title),node('span','radar-intel-status '+(status==='AKTIF'?'ok':status==='SEBAGIAN'?'partial':'off'),status));c.append(h,node('div','radar-intel-value',value),node('div','radar-intel-sub',sub));if(metrics.length){const g=node('div','radar-intel-metrics');metrics.forEach(([k,v])=>{const m=node('div','radar-intel-metric');m.append(node('small','',k),node('b','',v));g.append(m);});c.append(g);}c.append(node('p','radar-intel-note',note));return c;}
 function bars(items){const w=node('div','radar-intel-bars');if(!items.length){w.append(node('div','radar-intel-empty','Belum ada sampel valid untuk visualisasi.'));return w;}const max=Math.max(1,...items.map(x=>Math.max(0,Number(x.value)||0)));items.forEach(x=>{const r=node('div','radar-intel-bar');r.append(node('b','',x.label));const track=node('div','radar-intel-track'),fill=node('div','radar-intel-fill');fill.style.setProperty('--bar-width',Math.max(0,Math.min(100,(Number(x.value)||0)/max*100))+'%');track.append(fill);r.append(track,node('span','',x.display));w.append(r);});return w;}

 function coinScanner(snapshot,market){
  const section=node('section','radar-scan'),head=node('div','radar-scan-head'),title=node('div');
  title.append(node('div','eyebrow','LIVE SCAN / MOMENTUM + VOLUME'),node('h2','','Live Coin Scanner'),node('p','radar-intel-sub','Peringkat sinyal berbasis perubahan harga, turnover, dan lonjakan volume Binance 10 menit jika tersedia.'));
  const feed=market?.sources?.markets||{},fresh=feed.stale?'CACHE LAMA':feed.ok?'FEED TERHUBUNG':'FEED TIDAK TERSEDIA';
  head.append(title,node('span','radar-intel-status '+(feed.ok&&!feed.stale?'ok':'partial'),fresh));section.append(head);
  const coins=Array.isArray(market?.data?.markets)?market.data.markets:[],tracked=new Map((Array.isArray(snapshot?.tokens)?snapshot.tokens:[]).map(t=>[t.id,t]));
  const scored=coins.map(coin=>{
   const trackedToken=tracked.get(coin.id),vol=trackedToken?.vol10m||null;
   const h1=validNum(coin.price_change_percentage_1h_in_currency)?Number(coin.price_change_percentage_1h_in_currency):null;
   const h24=validNum(coin.price_change_percentage_24h)?Number(coin.price_change_percentage_24h):null;
   const d7=validNum(coin.price_change_percentage_7d_in_currency)?Number(coin.price_change_percentage_7d_in_currency):null;
   const cap=validNum(coin.market_cap)?Number(coin.market_cap):null,volume=validNum(coin.total_volume)?Number(coin.total_volume):null;
   const turnover=cap>0&&volume!==null?volume/cap*100:null;
   const spike=Boolean(vol?.spike),multiple=validNum(vol?.x)?Number(vol.x):null;
   const score=Math.min(100,(h1!==null&&h1>0?20:0)+(h24!==null&&h24>0?15:0)+(d7!==null&&d7>0?10:0)+(spike?35:0)+(multiple!==null&&multiple>=1.5?15:0)+(turnover!==null&&turnover>=10?10:0));
   const reasons=[];if(h1!==null&&h1>0)reasons.push('Momentum 1J');if(h24!==null&&h24>0)reasons.push('Harga 24J positif');if(spike)reasons.push('Volume Binance 10m spike');else if(multiple!==null&&multiple>=1.5)reasons.push('Volume 10m di atas median');if(turnover!==null&&turnover>=10)reasons.push('Turnover tinggi');
   return {coin,h1,h24,d7,turnover,vol,spike,multiple,score,reasons};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8);
  const note=node('div','radar-scan-warning','KONFIRMASI WHALE: BELUM TERSEDIA. Feed saat ini belum memberi label wallet whale dan arus masuk per token yang dapat diverifikasi; status whale tidak dihitung dalam skor. Skor adalah kecocokan indikator, bukan probabilitas harga naik.');
  section.append(note);
  if(!scored.length){section.append(node('div','radar-intel-empty','Belum ada kandidat dengan indikator positif yang memenuhi filter. Data kosong atau feed gagal tidak dianggap sebagai sinyal.'));return section;}
  const list=node('div','radar-scan-grid');
  scored.forEach(item=>{
   const coin=item.coin,card=node('article','radar-scan-card'),top=node('div','radar-scan-top'),identity=node('div','radar-scan-identity');
   identity.append(node('span','radar-scan-symbol',String(coin.symbol||'?').slice(0,5).toUpperCase()),node('div','',String(coin.name||coin.id)),node('small','',String(coin.symbol||'').toUpperCase()+' · '+(coin.market_cap_rank?'Rank #'+coin.market_cap_rank:'rank —')));
   top.append(identity,node('span','radar-scan-score',String(item.score)+'/100'));card.append(top);
   const prices=Array.isArray(coin.sparkline_in_7d?.price)?coin.sparkline_in_7d.price.filter(validNum).slice(-36):[];
   const chart=node('div','radar-scan-chart');
   if(prices.length>1){const lo=Math.min(...prices),hi=Math.max(...prices),span=hi-lo||1;prices.forEach(p=>{const bar=node('i','radar-scan-sparkbar');bar.style.setProperty('--h',(12+(Number(p)-lo)/span*88)+'%');chart.append(bar);});}
   else chart.append(node('small','', 'Grafik 7 hari tidak tersedia'));
   card.append(chart);
   const metrics=node('div','radar-scan-metrics');
   [['1J',item.h1===null?'—':(item.h1>0?'+':'')+item.h1.toFixed(2)+'%'],['24J',item.h24===null?'—':(item.h24>0?'+':'')+item.h24.toFixed(2)+'%'],['Turnover',item.turnover===null?'—':item.turnover.toFixed(2)+'%'],['Volume 10m',item.multiple===null?'—':item.multiple.toFixed(2)+'x median']].forEach(([k,v])=>{const m=node('div','');m.append(node('small','',k),node('b','',v));metrics.append(m);});
   card.append(metrics);
   card.append(node('div','radar-scan-reasons',item.reasons.join(' · ')||'Sinyal belum cukup'),node('div','radar-scan-whale','Whale: BELUM TERVERIFIKASI'));
   if(item.vol?.bucket_start)card.append(node('small','radar-scan-time','Binance '+date(item.vol.bucket_start)+' · '+money(item.vol.volume_usdt)+' volume 10m'));
   list.append(card);
  });
  section.append(list,node('small','radar-intel-sub','Sumber harga/volume pasar: CoinGecko. Sinyal candle 10 menit: Binance hanya untuk token yang berhasil dipetakan. Grafik menunjukkan sparkline historis 7 hari, bukan tick streaming. Data pasar diperbarui sesuai TTL feed.'));
  return section;
 }

 function panel(snapshot,solscan,market){
  const root=node('section','radar-intel'),head=node('div','radar-intel-head'),intro=node('div');intro.append(node('div','eyebrow','EXECUTIVE / MULTI-SOURCE SIGNALS'),node('h2','','Trading Intelligence — 5 Prioritas'),node('p','radar-intel-sub','Visualisasi mengikuti pembaruan snapshot sumber. Nilai kosong tidak diisi perkiraan.'));head.append(intro,node('span','radar-intel-status '+(snapshot&&!snapshot.stale?'ok':'partial'),snapshot&&!snapshot.stale?'SNAPSHOT TERKINI':'DATA PERLU DICEK'));root.append(head,coinScanner(snapshot,market));
  const grid=node('div','radar-intel-grid'),tokens=Array.isArray(snapshot?.tokens)?snapshot.tokens:[],health=snapshot?.health||{},ok=k=>Boolean(health[k]?.ok),eps=solscan?.endpoints||{},raw=eps.latest_transactions?.ok?(eps.latest_transactions.data?.data||eps.latest_transactions.data):null,txCount=Array.isArray(raw)?raw.length:null;
  grid.append(card('01 · Smart Money & Whale Tracking','BELUM LENGKAP','Belum terverifikasi','Belum ada wallet whale berlabel / watchlist terkonfirmasi.','Solscan overview tidak mengidentifikasi investor atau membuktikan akumulasi whale. Jangan menebak identitas wallet dari transaksi acak.',[['Transaksi terbaru terindeks',txCount==null?'—':fmt(txCount)],['Solscan',solscan?.ok?'Terhubung':'Tidak tersedia']]));
  const active=tokens.filter(t=>validNum(t.vol_mcap)).sort((a,b)=>Number(b.vol_mcap)-Number(a.vol_mcap)).slice(0,5);
  const flow=card('02 · Token Flow & Liquidity Intelligence',ok('coingecko')?'SEBAGIAN':'DATA TERBATAS',active[0]?.symbol||'—','Rasio volume 24 jam / market cap (proxy aktivitas pasar).','Bukan netflow wallet atau DEX liquidity. Pool depth, holder concentration, dan transfer belum tersedia di snapshot.',[['Token dipantau',fmt(tokens.length)],['Sumber screener',ok('coingecko')?'CoinGecko OK':'Periksa CoinGecko']]);
  flow.append(bars(active.map(t=>({label:t.symbol,value:Number(t.vol_mcap),display:Number(t.vol_mcap).toFixed(2)+'x'}))));grid.append(flow);
  const validChanges=tokens.filter(t=>validNum(t.change_24h)),up=validChanges.filter(t=>Number(t.change_24h)>0).length,down=validChanges.filter(t=>Number(t.change_24h)<0).length,neutral=validChanges.filter(t=>Number(t.change_24h)===0).length,unknownChanges=tokens.length-validChanges.length,g=market?.data?.global?.data?.data||market?.data?.global?.data||{},btc=g.market_cap_percentage?.btc;
  const regime=card('03 · Market Regime & Momentum',ok('coingecko')?'AKTIF':'DATA TERBATAS',validChanges.length?Math.round(up/validChanges.length*100)+'%':'—','Market breadth positif pada universe screener RADAR.','Breadth tidak mewakili seluruh pasar. BTC dominance hanya muncul jika feed global mengirim nilai.',[['Naik',fmt(up)],['Turun',fmt(down)],['Netral',fmt(neutral)],['Perubahan belum tersedia',fmt(unknownChanges)],['BTC dominance',btc==null?'—':Number(btc).toFixed(2)+'%']]);
  regime.append(bars([{label:'Naik',value:up,display:fmt(up)},{label:'Turun',value:down,display:fmt(down)},{label:'Netral',value:neutral,display:fmt(neutral)}]));grid.append(regime);
  const fundamental=tokens.filter(t=>t.fundamental&&typeof t.fundamental==='object'),news=snapshot?.news||[],unlocks=snapshot?.unlocks||[],top=[...fundamental].filter(t=>validNum(t.fundamental?.tvl)).sort((a,b)=>Number(b.fundamental.tvl)-Number(a.fundamental.tvl))[0];
  grid.append(card('04 · Fundamental & Catalyst Intelligence',fundamental.length||news.length||unlocks.length?'SEBAGIAN':'DATA TERBATAS',top?.symbol||'Belum ada fundamental','Menggabungkan DeFiLlama, berita, dan jadwal unlock yang tersedia.','Unlock kosong bukan bukti tidak ada unlock. Berita merupakan katalis untuk ditinjau, bukan sinyal harga otomatis.',[['Protokol fundamental',fmt(fundamental.length)],['Artikel berita',fmt(news.length)],['Jadwal unlock',fmt(unlocks.length)],['TVL terbesar',top?money(top.fundamental.tvl):'—']]));
  const spikes=tokens.filter(t=>t.vol10m?.spike);grid.append(card('05 · Exchange Intelligence',ok('exchange')?'AKTIF':'DATA TERBATAS',spikes.length?fmt(spikes.length)+' volume spike':'Belum ada spike tervalidasi','Sinyal volume candle exchange pada screener.','Order book, spread, funding rate, open interest, dan liquidation data belum tersedia. Key API bukan bukti koneksi akun.',[['Token dengan spike',fmt(spikes.length)],['Exchange source',ok('exchange')?'Feed OK':'Belum sehat / belum tersedia']]));
  root.append(grid,node('div','radar-intel-disclaimer','Belum ada probabilitas menang yang tervalidasi. Smart Money, DEX liquidity, holder concentration, dan derivatif masih memiliki gap. Semua sinyal adalah bahan analisis, bukan kepastian atau instruksi transaksi.'));
  const foot=node('div','radar-intel-foot'),quality=node('div','radar-intel-provenance');quality.append(node('b','','PROVENANCE & FRESHNESS — WAKTU SUMBER, BUKAN JAM ANIMASI'));
  quality.append(node('span','',sourceLine('Snapshot RADAR',{at:snapshot?.last_ok,stale:Boolean(snapshot?.stale),ok:Boolean(snapshot?.last_ok)&&!snapshot?.stale})));
  quality.append(node('span','',sourceLine('Solscan',solscan?{observed_at:solscan.observed_at,ok:solscan.ok,stale:false,error:solscan.code}:null)));
  const marketSources=market?.sources||{};Object.entries(marketSources).forEach(([name,item])=>quality.append(node('span','',sourceLine('CoinGecko '+name,item))));
  Object.entries(health).forEach(([name,item])=>quality.append(node('span','',sourceLine('RADAR ingest '+name,item))));
  foot.append(node('span','', 'Snapshot: '+date(snapshot?.last_ok)+' · Solscan: '+date(solscan?.observed_at)),node('span','', 'Market feed: '+date(market?.updated_at)+' · Polling dashboard ±120 detik'));root.append(quality,foot);return root;
 }
 window.RadarIntelligence={panel};
})();
