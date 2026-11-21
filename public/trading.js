'use strict';
const form=document.getElementById('position-form');
const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:6}):'—';
const exchangeCopy={
 Binance:{description:'Spot dan USDⓈ-M Futures. Baca saldo dan posisi melalui API read-only server-side.',note:'Kredensial Binance dibaca dari environment server. API Secret tidak pernah dikirim ke browser.'},
 Bybit:{description:'Unified Wallet dan Linear Derivatives. Baca saldo dan posisi melalui API read-only server-side.',note:'Bybit menggunakan signature V5 di server. Kredensial tidak pernah dikirim atau disimpan di browser.'}
};
function selectExchange(name){
 const selected=exchangeCopy[name]?name:'Binance';
 activeExchange=selected;
 document.querySelectorAll('[data-exchange-tab]').forEach(button=>{
  const active=button.dataset.exchangeTab===selected;
  button.classList.toggle('active',active);
  button.setAttribute('aria-pressed',String(active));
  const state=button.querySelector('.tab-state');
  if(state)state.textContent=active?'DIPILIH':(button.dataset.exchangeTab==='Bybit'?'SIAP DISIAPKAN':'SEGERA');
 });
 document.getElementById('exchange').value=selected;
 document.getElementById('exchange-title').textContent=selected;
 document.getElementById('exchange-description').textContent=exchangeCopy[selected].description;
 document.getElementById('exchange-note').textContent=exchangeCopy[selected].note;
 updateConnectionUi();
 clearAccount();
}
document.querySelectorAll('[data-exchange-tab]').forEach(button=>{
 button.addEventListener('click',()=>selectExchange(button.dataset.exchangeTab));
});
document.getElementById('exchange').addEventListener('change',event=>selectExchange(event.target.value));

const exchangeConfigs={};
let activeExchange='Binance';
const connectButton=document.getElementById('connect-exchange');
const feedback=document.getElementById('connection-feedback');
const summary=document.getElementById('account-summary');
const assetList=document.getElementById('asset-list');
const positionList=document.getElementById('position-list');
const money=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:8});
function updateConnectionUi(){
 const cfg=exchangeConfigs[activeExchange.toLowerCase()];
 const ready=Boolean(cfg&&cfg.configured);
 document.getElementById('api-state').textContent=ready?'API Key & Secret terdeteksi · belum diuji':'API Key / API Secret belum lengkap';
 document.getElementById('exchange-status').textContent=ready?'KREDENSIAL TERSEDIA':'BELUM DIKONFIGURASI';
 document.getElementById('hub-status').textContent=ready?'READ-ONLY / SIAP DIUJI':'READ-ONLY / PERLU KONFIGURASI';
 connectButton.disabled=!ready;
 document.querySelectorAll('[data-exchange-tab]').forEach(button=>{
  const label=button.querySelector('.tab-state');
  if(label)label.textContent=button.dataset.exchangeTab===activeExchange?'DIPILIH':(exchangeConfigs[button.dataset.exchangeTab.toLowerCase()]?.configured?'SIAP DIHUBUNGKAN':'BELUM DIKONFIGURASI');
 });
 feedback.textContent=ready?'Konfigurasi tersedia. Ambil data akun untuk menguji izin read-only.':'Tambahkan API Key dan API Secret pada environment Hostless.';
}
function clearAccount(){
 summary.replaceChildren();assetList.replaceChildren();positionList.replaceChildren();
 const empty=document.createElement('div');empty.className='account-empty';empty.textContent='Klik “Periksa koneksi” untuk mengambil data akun secara aman.';summary.append(empty);
 const a=document.createElement('p');a.className='muted';a.textContent='Belum ada data akun.';assetList.append(a);
 const p=document.createElement('p');p.className='muted';p.textContent='Belum ada posisi.';positionList.append(p);
 document.getElementById('account-checked-at').textContent='Data privat tidak disimpan ke database RADAR AI dan tidak digunakan untuk mengirim order.';
}
function stat(label,value){
 const cell=document.createElement('div');cell.className='account-stat';
 const small=document.createElement('small');small.textContent=label;
 const bold=document.createElement('b');bold.textContent=value;
 cell.append(small,bold);return cell;
}
function table(headers,rows){
 const el=document.createElement('table');el.className='account-table';
 const thead=document.createElement('thead'),headRow=document.createElement('tr');
 headers.forEach(label=>{const th=document.createElement('th');th.textContent=label;headRow.append(th);});thead.append(headRow);el.append(thead);
 const tbody=document.createElement('tbody');
 rows.forEach(row=>{const tr=document.createElement('tr');row.forEach(value=>{const td=document.createElement('td');td.textContent=String(value);tr.append(td);});tbody.append(tr);});
 el.append(tbody);return el;
}
function renderAccount(data){
 summary.replaceChildren();assetList.replaceChildren();positionList.replaceChildren();
 const account=data.account||{};let assets=[],positions=[],stats=[];
 if(data.exchange==='binance'){
  const spot=account.spot||{},futures=account.futures||{};
  assets=(spot.balances||[]).map(x=>[x.asset,money(x.free),money(x.locked),money(x.total)]);
  positions=futures.positions||[];
  stats=[['Aset Spot',String(assets.length)],['Wallet Futures',futures.available?money(futures.wallet_balance)+' USDT':'Tidak tersedia'],['Available Futures',futures.available?money(futures.available_balance)+' USDT':'—'],['Unrealized PnL',futures.available?money(futures.unrealized_pnl)+' USDT':'—'],['Posisi terbuka',String(positions.length)]];
 }else{
  const wallet=account.wallet||{};
  assets=(wallet.coins||[]).map(x=>[x.asset,money(x.wallet_balance),money(x.equity),money(x.available_balance)]);
  positions=account.positions||[];
  stats=[['Total Equity',money(wallet.total_equity)+' USDT'],['Wallet Balance',money(wallet.wallet_balance)+' USDT'],['Available Balance',money(wallet.available_balance)+' USDT'],['Aset aktif',String(assets.length)],['Posisi terbuka',String(positions.length)]];
 }
 stats.forEach(([label,value])=>summary.append(stat(label,value)));
 if(assets.length)assetList.append(table(data.exchange==='binance'?['Aset','Free','Locked','Total']:['Aset','Wallet','Equity','Available'],assets));
 else{const p=document.createElement('p');p.className='muted';p.textContent='Tidak ada saldo aset non-zero yang dikembalikan.';assetList.append(p);}
 if(positions.length)positionList.append(table(['Pair','Arah','Size','Entry','Mark','Unrealized PnL'],positions.map(x=>[x.symbol,x.side,money(x.size),money(x.entry_price),money(x.mark_price),money(x.unrealized_pnl)])));
 else{const p=document.createElement('p');p.className='muted';p.textContent='Tidak ada posisi terbuka.';positionList.append(p);}
 document.getElementById('account-checked-at').textContent='Terakhir diperiksa: '+new Date(data.checked_at).toLocaleString()+' · Data hanya dibaca dan tidak disimpan.';
 document.getElementById('exchange-status').textContent='TERHUBUNG · READ-ONLY';
 document.getElementById('hub-status').textContent='READ-ONLY / TERHUBUNG';
 document.getElementById('api-state').textContent='Permintaan akun berhasil';
 feedback.textContent='Data akun berhasil dibaca dari '+activeExchange+'. Tidak ada order yang dikirim.';
}
async function loadExchangeStatus(){
 try{
  const response=await fetch('/api/exchanges/status',{cache:'no-store'});const body=await response.json();
  if(!response.ok||body.status!=='success')throw new Error('Status API tidak tersedia.');
  Object.assign(exchangeConfigs,body.exchanges||{});updateConnectionUi();
 }catch(error){feedback.textContent='Tidak dapat memeriksa konfigurasi backend. Pastikan versi aplikasi sudah ter-deploy.';document.getElementById('api-state').textContent='Backend exchange belum tersedia';}
}
connectButton.addEventListener('click',async()=>{
 const requestedExchange=activeExchange;
 connectButton.disabled=true;connectButton.textContent='Mengambil data akun…';feedback.textContent='Menghubungi '+activeExchange+' melalui server RADAR AI…';
 try{
  const response=await fetch('/api/exchanges/'+activeExchange.toLowerCase()+'/account',{cache:'no-store'});const body=await response.json();
  if(!response.ok||body.status!=='success')throw new Error(body.message||'Koneksi exchange gagal.');
  if(activeExchange===requestedExchange)renderAccount(body);
 }catch(error){
  summary.replaceChildren();const empty=document.createElement('div');empty.className='account-empty';empty.textContent=error.message;summary.append(empty);
  document.getElementById('exchange-status').textContent='KONEKSI GAGAL';
  document.getElementById('hub-status').textContent='READ-ONLY / PERLU PEMERIKSAAN';
  document.getElementById('api-state').textContent='Koneksi belum berhasil';
  feedback.textContent=error.message+' Periksa izin read-only, whitelist IP, dan nama environment.';
 }finally{connectButton.textContent='Periksa koneksi & ambil data akun';updateConnectionUiAfterResult();}
});
function updateConnectionUiAfterResult(){
 const cfg=exchangeConfigs[activeExchange.toLowerCase()];
 connectButton.disabled=!(cfg&&cfg.configured);
}

selectExchange('Binance');
activeExchange='Binance';
loadExchangeStatus();
form.addEventListener('submit',e=>{
 e.preventDefault();
 const margin=Number(document.getElementById('margin').value),lev=Number(document.getElementById('leverage').value),entry=Number(document.getElementById('entry').value),sl=Number(document.getElementById('sl').value),tp=Number(document.getElementById('tp').value),side=document.getElementById('side').value;
 const out=document.getElementById('calc-result');
 if(!(margin>0&&lev>0&&entry>0)){out.replaceChildren();const b=document.createElement('b');b.textContent='Data belum lengkap';const p=document.createElement('p');p.textContent='Masukkan margin dan harga masuk yang valid.';out.append(b,p);return;}
 const notional=margin*lev,qty=notional/entry,dir=side==='LONG'?1:-1;
 const pnlAt=price=>Number.isFinite(price)&&price>0?(price-entry)*qty*dir:null;
 const risk=pnlAt(sl),reward=pnlAt(tp),rr=risk!==null&&risk<0&&reward!==null&&reward>0?reward/Math.abs(risk):null;
 out.replaceChildren();
 const heading=document.createElement('b');heading.textContent='Hasil simulasi '+side+' · '+document.getElementById('pair').value.toUpperCase()+' · '+document.getElementById('exchange').value;out.append(heading);
 const grid=document.createElement('div');grid.className='result-grid';
 const rows=[['Nilai posisi',fmt(notional)+' USDT'],['Kuantitas estimasi',fmt(qty)],['Margin',fmt(margin)+' USDT'],['Leverage',lev+'x'],['Estimasi PnL di SL',risk===null?'Belum diisi':fmt(risk)+' USDT'],['Estimasi PnL di TP',reward===null?'Belum diisi':fmt(reward)+' USDT'],['Risk / Reward',rr===null?'Belum bisa dihitung':'1 : '+fmt(rr)]];
 rows.forEach(([k,v])=>{const cell=document.createElement('div'),small=document.createElement('small'),bold=document.createElement('b');small.textContent=k;bold.textContent=v;cell.append(small,bold);grid.append(cell);});
 out.append(grid);
 const note=document.createElement('p');note.textContent='Perkiraan belum memasukkan fee, funding, slippage, aturan ukuran kontrak, dan harga likuidasi exchange. Ini bukan order dan tidak terhubung ke akun.';out.append(note);
});
