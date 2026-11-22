'use strict';
const $ = (s) => document.querySelector(s);
const fmt = (v) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('id-ID',{maximumFractionDigits:4});
const money = (v) => v == null || !Number.isFinite(Number(v)) ? '—' : '$'+Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
const short = (v,n=7) => v ? String(v).slice(0,n)+'…'+String(v).slice(-n) : '—';
const esc = (v) => String(v ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unwrap = (x) => x?.data?.data ?? x?.data ?? null;
const arr = (x) => Array.isArray(unwrap(x)) ? unwrap(x) : Array.isArray(x?.data) ? x.data : [];
const link = (path) => 'https://solscan.io/'+path;
function renderRows(target, items, fields, emptyText) {
 const root=$(target); root.replaceChildren();
 if(!items.length){root.textContent=emptyText;return;}
 items.slice(0,20).forEach(item=>{
  const row=document.createElement('div');row.className='solscan-row';
  fields(item).forEach(value=>{const cell=document.createElement('span');cell.textContent=String(value??'—');row.append(cell);});
  root.append(row);
 });
}
function stat(label,value,sub){const box=document.createElement('article');box.className='stat-card';const top=document.createElement('div');top.className='stat-top';const name=document.createElement('span');name.className='stat-label';name.textContent=label;top.append(name);const val=document.createElement('div');val.className='stat-value';val.textContent=value;const foot=document.createElement('div');foot.className='stat-bottom';foot.textContent=sub;box.append(top,val,foot);return box;}
function showError(code){return ({SOLSCAN_API_KEY_NOT_CONFIGURED:'Tambahkan SOLSCAN_API_KEY di Hostless Environment Variables.',SOLSCAN_AUTH_FAILED:'API key ditolak (401). Periksa versi key dan status aktivasi Solscan.',SOLSCAN_PLAN_ACCESS_DENIED:'Paket Solscan tidak memberi akses ke endpoint ini.',SOLSCAN_RATE_LIMITED:'Batas permintaan Solscan tercapai. Tunggu sebelum mencoba lagi.',SOLSCAN_TIMEOUT:'Solscan tidak merespons tepat waktu.',SOLSCAN_NETWORK_ERROR:'Server RADAR tidak dapat menjangkau Solscan.'})[code]||'Endpoint gagal: '+String(code||'SOLSCAN_UNAVAILABLE');}
function setStatus(payload){
 const el=$('#api-status'),side=$('#side-status');
 const good=payload?.ok,partial=payload?.partial;
 el.textContent=good?(partial?'SOLSCAN PARTIAL':'SOLSCAN ONLINE'):'SOLSCAN OFFLINE';
 el.className='market-status '+(good?'positive':'negative');
 side.textContent=good?'Data terhubung':showError(payload?.code);
}
async function load(){
 $('#refresh').disabled=true;$('#notice').textContent='Mengambil data terbaru dari Solscan…';
 try{
  const response=await fetch('/api/solscan/overview',{cache:'no-store'}),payload=await response.json();
  if(!response.ok && !payload.configured) throw Object.assign(new Error(payload.code),{code:payload.code});
  setStatus(payload);$('#updated-at').textContent='Observed: '+new Date(payload.observed_at).toLocaleString('id-ID');
  const endpoints=payload.endpoints||{},chain=unwrap(endpoints.chain_info),tx=arr(endpoints.latest_transactions),blocks=arr(endpoints.latest_blocks),tokens=arr(endpoints.trending_tokens);\n  const latest=(key)=>{const series=unwrap(endpoints[key])?.series;return Array.isArray(series)&&series.length?series[series.length-1]:null;};\n  const txDay=latest('transaction_analytics'),stakeDay=latest('stake_analytics'),feeDay=latest('fee_analytics'),defiDay=latest('defi_analytics');
  const grid=$('#network-stats');grid.replaceChildren(
   stat('BLOCK TERAKHIR',fmt(chain?.blockHeight ?? blocks[0]?.slot ?? blocks[0]?.block_id),'Solscan indexed'),
   stat('EPOCH',fmt(chain?.currentEpoch),'Solana Mainnet'),
   stat('TOTAL TRANSAKSI',fmt(chain?.transactionCount),'Kumulatif jika tersedia'),
   stat('TRENDING TOKENS',fmt(tokens.length),'Peringkat 24 jam'),\n   stat('TRANSAKSI HARIAN',fmt(txDay?.total),'Seri harian Solscan'),\n   stat('ACTIVE STAKE',fmt(stakeDay?.total_stake_sol)+' SOL','Total stake harian'),\n   stat('DEX VOLUME',money(defiDay?.volume_usd),'Volume harian on-chain'),\n   stat('NETWORK FEES',fmt(feeDay?.total_fee_sol ?? feeDay?.total_fee)+' SOL','Biaya harian jika tersedia')
  );
  renderRows('#trending',tokens,(t)=>[t.symbol||short(t.address,5),money(t.price),money(t.volume_24h),fmt(t.num_trade_24h)+' trades',fmt(t.market_cap)],'Data trending token tidak tersedia untuk paket/API ini.');
  renderRows('#transactions',tx,(t)=>[short(t.tx_hash||t.signature||t.txHash),t.status||t.block_time||t.time||'Transaksi',t.fee!=null?'Fee '+fmt(t.fee):''], 'Transaksi terbaru belum tersedia.');
  renderRows('#blocks',blocks,(b)=>['Slot '+fmt(b.slot||b.block_id||b.blockHeight),b.block_time||b.time||'',b.transaction_count!=null?fmt(b.transaction_count)+' tx':''], 'Data block belum tersedia.');
  const failures=Object.entries(endpoints).filter(([,v])=>!v.ok).map(([k,v])=>k+': '+v.code);
  $('#notice').textContent=failures.length?'Sebagian endpoint tidak tersedia: '+failures.join(' · '):'Seluruh endpoint ringkasan yang diminta berhasil. Data diperbarui '+new Date(payload.observed_at).toLocaleString('id-ID')+'.';
 }catch(error){$('#notice').textContent=showError(error.code||'SOLSCAN_UNAVAILABLE');$('#network-stats').replaceChildren(stat('STATUS','Tidak tersedia',showError(error.code)));setStatus({ok:false,code:error.code});}
 finally{$('#refresh').disabled=false;}
}
function displayWallet(payload){
 const root=$('#wallet-result');root.replaceChildren();
 const entries=payload.endpoints||{};
 const heading=document.createElement('div');heading.className='wallet-summary';
 const title=document.createElement('b');title.textContent='Wallet '+short(payload.address,8);
 const state=document.createElement('span');state.textContent=payload.endpoint_count+'/'+payload.endpoint_total+' endpoint berhasil';heading.append(title,state);root.append(heading);
 const sections=[['account','Account Detail'],['portfolio','Portfolio'],['token_accounts','Token Accounts'],['transactions','Transactions'],['transfers','Transfers'],['defi_activities','DeFi Activities'],['stake','Staking']];
 sections.forEach(([key,label])=>{
  const item=entries[key],section=document.createElement('section');section.className='wallet-section';
  const h=document.createElement('h3');h.textContent=label+(item?.ok?'':' · '+(item?.code||'unavailable'));section.append(h);
  if(!item?.ok){const p=document.createElement('p');p.className='muted';p.textContent=showError(item?.code);section.append(p);}
  else {
   const data=unwrap(item),pre=document.createElement('pre');pre.textContent=JSON.stringify(data,null,2).slice(0,12000);section.append(pre);
  }
  root.append(section);
 });
}
$('#wallet-form').addEventListener('submit',async event=>{
 event.preventDefault();const address=$('#wallet-address').value.trim();$('#wallet-result').textContent='Memeriksa wallet di Solscan…';
 try{
  const response=await fetch('/api/solscan/wallet?address='+encodeURIComponent(address),{cache:'no-store'}),payload=await response.json();
  if(!response.ok)throw Object.assign(new Error(payload.code),{code:payload.code});
  displayWallet(payload);
 }catch(error){$('#wallet-result').textContent=showError(error.code||'SOLSCAN_REQUEST_FAILED');}
});
$('#refresh').addEventListener('click',load);load();setInterval(load,300000);
