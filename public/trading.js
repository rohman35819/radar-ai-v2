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
 clearMarket();
}
document.querySelectorAll('[data-exchange-tab]').forEach(button=>{
 button.addEventListener('click',()=>selectExchange(button.dataset.exchangeTab));
});
document.getElementById('exchange').addEventListener('change',event=>selectExchange(event.target.value));

const exchangeConfigs={};
let activeExchange='Binance';
const connectButton=document.getElementById('connect-exchange');
const feedback=document.getElementById('connection-feedback');
const accessInput=document.getElementById('exchange-access-token');
const refreshStatusButton=document.getElementById('refresh-exchange-status');
let exchangeAccessToken='';
let exchangeAccessConfigured=false;
const summary=document.getElementById('account-summary');
const assetList=document.getElementById('asset-list');
const positionList=document.getElementById('position-list');
const money=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:8});
function updateConnectionUi(){
 const cfg=exchangeConfigs[activeExchange.toLowerCase()];
 const ready=Boolean(cfg&&cfg.configured);
 document.getElementById('api-state').textContent=ready?'API Key + Secret terdeteksi di server':'API Key / Secret belum lengkap di server';
 document.getElementById('exchange-status').textContent=ready?'SIAP DIUJI':'BELUM DIKONFIGURASI';
 document.getElementById('hub-status').textContent=ready?'READ-ONLY / SIAP DIUJI':'READ-ONLY / PERLU KONFIGURASI';
 connectButton.disabled=false;
 document.querySelectorAll('[data-exchange-tab]').forEach(button=>{
  const label=button.querySelector('.tab-state');
  if(label)label.textContent=button.dataset.exchangeTab===activeExchange?'DIPILIH':(exchangeConfigs[button.dataset.exchangeTab.toLowerCase()]?.configured?'SIAP DIHUBUNGKAN':'BELUM DIKONFIGURASI');
 });
 if(!exchangeAccessConfigured)feedback.textContent='Akses privat belum dikonfigurasi di server. Tambahkan EXCHANGE_ACCESS_TOKEN atau gunakan ADMIN_TOKEN.';
 else if(!ready)feedback.textContent='Pasangan API Key dan API Secret '+activeExchange+' belum terbaca oleh proses server. Periksa environment Production lalu restart/redeploy.';
 else if(!exchangeAccessToken&&!accessInput.value.trim())feedback.textContent='Kredensial tersedia. Masukkan kunci akses privat untuk menguji koneksi akun.';
 else feedback.textContent='Server siap. Tekan “Uji koneksi & muat akun” untuk memeriksa izin baca.';
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
 const account=data.account||{};let assets=[],positions=[],stats=[],positionsAvailable=true,positionsError='';
 if(data.exchange==='binance'){
  const spot=account.spot||{},futures=account.futures||{};
  assets=(spot.balances||[]).map(x=>[x.asset,money(x.free),money(x.locked),money(x.total)]);
  positions=futures.positions||[];
  positionsAvailable=Boolean(futures.available&&futures.positions_available!==false);
  positionsError=futures.positions_error||futures.error||'FUTURES_READ_UNAVAILABLE';
  stats=[['Aset Spot',String(assets.length)],['Wallet Futures',futures.available?money(futures.wallet_balance)+' USDT':'Tidak tersedia'],['Available Futures',futures.available?money(futures.available_balance)+' USDT':'—'],['Unrealized PnL',futures.available?money(futures.unrealized_pnl)+' USDT':'—'],['Posisi terbuka',positionsAvailable?String(positions.length):'Tidak tersedia']];
  if(!positionsAvailable)stats.push(['Status posisi',positionsError]);
 }else{
  const wallet=account.wallet||{};
  assets=(wallet.coins||[]).map(x=>[x.asset,money(x.wallet_balance),money(x.equity),money(x.available_balance)]);
  positions=account.positions||[];
  positionsAvailable=account.positions_available!==false;
  positionsError=account.positions_error||'BYBIT_POSITIONS_READ_UNAVAILABLE';
  stats=[['Total Equity',money(wallet.total_equity)+' USDT'],['Wallet Balance',money(wallet.wallet_balance)+' USDT'],['Available Balance',money(wallet.available_balance)+' USDT'],['Aset aktif',String(assets.length)],['Posisi terbuka',positionsAvailable?String(positions.length):'Tidak tersedia']];
  if(!positionsAvailable)stats.push(['Status posisi',positionsError]);
 }
 stats.forEach(([label,value])=>summary.append(stat(label,value)));
 if(assets.length)assetList.append(table(data.exchange==='binance'?['Aset','Free','Locked','Total']:['Aset','Wallet','Equity','Available'],assets));
 else{const p=document.createElement('p');p.className='muted';p.textContent='Tidak ada saldo aset non-zero yang dikembalikan.';assetList.append(p);}
 if(positions.length)positionList.append(table(['Pair','Arah','Size','Entry','Mark','Unrealized PnL'],positions.map(x=>[x.symbol,x.side,money(x.size),money(x.entry_price),money(x.mark_price),money(x.unrealized_pnl)])));
 else{const p=document.createElement('p');p.className='muted';p.textContent=positionsAvailable?'Tidak ada posisi terbuka.':'Data posisi gagal dibaca ('+positionsError+'). Saldo berhasil diambil, tetapi hasil posisi belum dapat dipastikan.';positionList.append(p);}
 const spotTradingEnabled=data.exchange==='binance'&&Boolean(account.spot?.can_trade);
 document.getElementById('account-checked-at').textContent=(spotTradingEnabled?'PERINGATAN: API Key Binance memiliki izin Spot Trading aktif. Nonaktifkan izin trading pada pengaturan API exchange. ':'')+'Terakhir diperiksa: '+new Date(data.checked_at).toLocaleString()+' · Data hanya dibaca dan tidak disimpan.';
 document.getElementById('account-checked-at').classList.toggle('account-warning',spotTradingEnabled||!positionsAvailable);
 document.getElementById('exchange-status').textContent=spotTradingEnabled?'TERHUBUNG · PERIKSA IZIN API':positionsAvailable?'TERHUBUNG · READ-ONLY':'TERHUBUNG · DATA PARSIAL';
 document.getElementById('hub-status').textContent=spotTradingEnabled?'PERINGATAN / IZIN TRADING AKTIF':positionsAvailable?'READ-ONLY / TERHUBUNG':'READ-ONLY / DATA PARSIAL';
 document.getElementById('api-state').textContent=spotTradingEnabled?'Izin Spot Trading aktif':positionsAvailable?'Permintaan akun berhasil':'Sebagian data akun tidak tersedia';
 feedback.textContent=spotTradingEnabled?'Saldo terbaca, tetapi API Key memiliki izin Spot Trading. Nonaktifkan izin tersebut untuk keamanan.':positionsAvailable?'Data akun berhasil dibaca dari '+activeExchange+'. Tidak ada order yang dikirim.':'Saldo terbaca; data posisi belum lengkap.';
}
async function loadExchangeStatus(){
 try{
  const response=await fetch('/api/exchanges/status',{cache:'no-store'});const body=await response.json();
  if(!response.ok||body.status!=='success')throw new Error('Status API tidak tersedia.');
  Object.assign(exchangeConfigs,body.exchanges||{});exchangeAccessConfigured=Boolean(body.access_configured);updateConnectionUi();
 }catch(error){exchangeAccessConfigured=false;feedback.textContent='Tidak dapat memeriksa backend. Perbarui halaman setelah deployment selesai.';document.getElementById('api-state').textContent='Backend exchange belum tersedia';}
}
refreshStatusButton.addEventListener('click',async()=>{refreshStatusButton.disabled=true;refreshStatusButton.textContent='Memeriksa…';await loadExchangeStatus();refreshStatusButton.disabled=false;refreshStatusButton.textContent='Perbarui status server';});
const marketButton=document.getElementById('load-market');
const marketOutput=document.getElementById('market-data');
const marketFeedback=document.getElementById('market-feedback');
function clearMarket(){
 marketOutput.replaceChildren();const p=document.createElement('p');p.className='muted';p.textContent='Belum ada harga market.';marketOutput.append(p);
 marketFeedback.textContent='Harga publik, tanpa API key.';
}
function renderMarket(data){
 marketOutput.replaceChildren();
 const rows=[];
 for(const [label,item] of [['Spot',data.spot],['Futures / Linear',data.futures]]){
  if(item)rows.push([label,money(item.last_price),Number(item.change_pct).toFixed(2)+'%',money(item.high_24h),money(item.low_24h),money(item.quote_volume_24h)]);
 }
 if(rows.length)marketOutput.append(table(['Pasar','Last price','24h','High 24h','Low 24h','Quote volume'],rows));
 else{const p=document.createElement('p');p.className='muted';p.textContent='Pair tidak tersedia pada pasar ini.';marketOutput.append(p);}
 const quote=data.futures||data.spot;
 const entry=document.getElementById('entry');
 if(quote&&quote.last_price>0&&!entry.value)entry.value=String(quote.last_price);
 marketFeedback.textContent='Harga '+data.symbol+' diperbarui · '+new Date(data.checked_at).toLocaleTimeString()+' · data publik.';
}
marketButton.addEventListener('click',async()=>{
 const requestedExchange=activeExchange;
 const symbol=document.getElementById('pair').value.trim().toUpperCase();
 marketButton.disabled=true;marketFeedback.textContent='Mengambil ticker '+symbol+'…';
 try{
  const query=new URLSearchParams({exchange:requestedExchange.toLowerCase(),symbol});
  const response=await fetch('/api/exchanges/market?'+query.toString(),{cache:'no-store'});
  const body=await response.json();
  if(!response.ok||body.status!=='success')throw new Error(body.message||'Data market gagal diambil.');
  if(activeExchange===requestedExchange)renderMarket(body);
 }catch(error){
  if(activeExchange===requestedExchange)marketFeedback.textContent=error.message;
 }finally{marketButton.disabled=false;}
});
connectButton.addEventListener('click',async()=>{
 const requestedExchange=activeExchange;
 if(accessInput.value.trim())exchangeAccessToken=accessInput.value.trim();
 if(!exchangeAccessConfigured){feedback.textContent='Akses privat belum diaktifkan di server. Tambahkan EXCHANGE_ACCESS_TOKEN atau ADMIN_TOKEN di Hostless.';return;}
 if(!exchangeAccessToken){feedback.textContent='Masukkan kunci akses privat Exchange Hub terlebih dahulu.';accessInput.focus();return;}
 connectButton.disabled=true;connectButton.textContent='Mengambil data akun…';feedback.textContent='Menghubungi '+requestedExchange+' melalui server RADAR AI…';
 try{
  const response=await fetch('/api/exchanges/'+requestedExchange.toLowerCase()+'/account',{cache:'no-store',headers:{'x-exchange-access-token':exchangeAccessToken}});const body=await response.json();
  if(!response.ok||body.status!=='success')throw new Error((body.message||'Koneksi exchange gagal.')+(body.code?' ['+body.code+']':''));
  if(activeExchange===requestedExchange)renderAccount(body);
 }catch(error){
  if(activeExchange===requestedExchange){
   summary.replaceChildren();const empty=document.createElement('div');empty.className='account-empty';empty.textContent=error.message;summary.append(empty);
   document.getElementById('exchange-status').textContent='KONEKSI GAGAL';
   document.getElementById('hub-status').textContent='READ-ONLY / PERLU PEMERIKSAAN';
   document.getElementById('api-state').textContent='Koneksi belum berhasil';
   feedback.textContent=error.message+' Periksa izin read-only, whitelist IP, dan environment server.';
  }
 }finally{connectButton.textContent='Periksa koneksi & ambil data akun';updateConnectionUiAfterResult();}
});
function updateConnectionUiAfterResult(){connectButton.disabled=false;}

selectExchange('Binance');
activeExchange='Binance';
loadExchangeStatus();
form.addEventListener('submit',e=>{
 e.preventDefault();
 const margin=Number(document.getElementById('margin').value),lev=Number(document.getElementById('leverage').value),entry=Number(document.getElementById('entry').value),slRaw=document.getElementById('sl').value.trim(),tpRaw=document.getElementById('tp').value.trim(),sl=Number(slRaw),tp=Number(tpRaw),side=document.getElementById('side').value,pair=document.getElementById('pair').value.trim().toUpperCase();
 const out=document.getElementById('calc-result');
 const fail=message=>{out.replaceChildren();const b=document.createElement('b');b.textContent='Periksa input simulasi';const p=document.createElement('p');p.textContent=message;out.append(b,p);};
 if(!(margin>0&&lev>0&&entry>0)){fail('Masukkan margin, leverage, dan harga masuk yang valid.');return;}
 if(!/^[A-Z0-9]{3,24}$/.test(pair)){fail('Pair harus berisi 3–24 karakter huruf/angka, contoh BTCUSDT.');return;}
 if((slRaw&&!(sl>0))||(tpRaw&&!(tp>0))){fail('Stop Loss dan Take Profit harus berupa harga positif.');return;}
 if(slRaw&&((side==='LONG'&&sl>=entry)||(side==='SHORT'&&sl<=entry))){fail(side==='LONG'?'Stop Loss posisi Long harus di bawah harga masuk.':'Stop Loss posisi Short harus di atas harga masuk.');return;}
 if(tpRaw&&((side==='LONG'&&tp<=entry)||(side==='SHORT'&&tp>=entry))){fail(side==='LONG'?'Take Profit posisi Long harus di atas harga masuk.':'Take Profit posisi Short harus di bawah harga masuk.');return;}
 const notional=margin*lev,qty=notional/entry,dir=side==='LONG'?1:-1;
 const pnlAt=price=>Number.isFinite(price)&&price>0?(price-entry)*qty*dir:null;
 const risk=pnlAt(sl),reward=pnlAt(tp),rr=risk!==null&&risk<0&&reward!==null&&reward>0?reward/Math.abs(risk):null;
 out.replaceChildren();
 const heading=document.createElement('b');heading.textContent='Hasil simulasi '+side+' · '+pair+' · '+document.getElementById('exchange').value;out.append(heading);
 const grid=document.createElement('div');grid.className='result-grid';
 const rows=[['Nilai posisi',fmt(notional)+' USDT'],['Kuantitas estimasi',fmt(qty)],['Margin',fmt(margin)+' USDT'],['Leverage',lev+'x'],['Estimasi PnL di SL',risk===null?'Belum diisi':fmt(risk)+' USDT'],['Estimasi PnL di TP',reward===null?'Belum diisi':fmt(reward)+' USDT'],['Risk / Reward',rr===null?'Belum bisa dihitung':'1 : '+fmt(rr)]];
 rows.forEach(([k,v])=>{const cell=document.createElement('div'),small=document.createElement('small'),bold=document.createElement('b');small.textContent=k;bold.textContent=v;cell.append(small,bold);grid.append(cell);});
 out.append(grid);
 const note=document.createElement('p');note.textContent='Perkiraan belum memasukkan fee, funding, slippage, aturan ukuran kontrak, dan harga likuidasi exchange. Ini bukan order dan tidak terhubung ke akun.';out.append(note);
});
