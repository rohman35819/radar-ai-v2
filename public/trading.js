'use strict';
const form=document.getElementById('position-form');
const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:6}):'—';
const exchangeCopy={
 Binance:{description:'Spot dan USDⓈ-M Futures. Baca saldo dan posisi melalui API read-only server-side.',note:'Kredensial Binance dibaca dari environment server. API Secret tidak pernah dikirim ke browser.'},
 Bybit:{description:'Unified Wallet dan Linear Derivatives. Baca saldo dan posisi melalui API read-only server-side.',note:'Bybit menggunakan signature V5 di server. Kredensial tidak pernah dikirim atau disimpan di browser.'}
};
function selectExchange(name){
 accountRequestId++;
 accountConnected=false;
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
let accountRequestId=0;
let accountConnected=false;
let exchangeAccessConfigured=false;
const identityPanel=document.getElementById('account-identity');
const summary=document.getElementById('account-summary');
const assetList=document.getElementById('asset-list');
const positionList=document.getElementById('position-list');
const refreshAccountButton=document.getElementById('refresh-account');
const money=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:8});
function updateConnectionUi(){
 const cfg=exchangeConfigs[activeExchange.toLowerCase()];
 const ready=Boolean(cfg&&cfg.configured);
 document.getElementById('api-state').textContent=ready?'API Key + Secret terdeteksi di server':'API Key / Secret belum lengkap di server';
 document.getElementById('exchange-status').textContent=ready?'SIAP DIUJI':'BELUM DIKONFIGURASI';
 document.getElementById('hub-status').textContent=ready?'READ-ONLY / SIAP DIUJI':'READ-ONLY / PERLU KONFIGURASI';
 connectButton.disabled=false;
 refreshAccountButton.disabled=!accountConnected;
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
 identityPanel.replaceChildren();
 const identityEmpty=document.createElement('div');identityEmpty.innerHTML='<small>IDENTITAS AKUN</small><b>Belum terhubung</b>';
 const identityHint=document.createElement('span');identityHint.textContent='Menunggu verifikasi API';identityPanel.append(identityEmpty,identityHint);
 summary.replaceChildren();assetList.replaceChildren();positionList.replaceChildren();
 const empty=document.createElement('div');empty.className='account-empty';empty.textContent='Klik “Periksa koneksi” untuk mengambil data akun secara aman.';summary.append(empty);
 const a=document.createElement('p');a.className='muted';a.textContent='Belum ada data akun.';assetList.append(a);
 const p=document.createElement('p');p.className='muted';p.textContent='Belum ada posisi.';positionList.append(p);
 document.getElementById('account-checked-at').textContent='Data privat tidak disimpan ke database RADAR AI dan tidak digunakan untuk mengirim order.';
 document.getElementById('account-checked-at').classList.remove('account-warning');
 accountConnected=false;
 refreshAccountButton.disabled=true;
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
 const identity=account.identity||{};
 identityPanel.replaceChildren();
 const identityMain=document.createElement('div');
 const identityCaption=document.createElement('small');identityCaption.textContent='IDENTITAS AKUN · '+String(data.exchange||'EXCHANGE').toUpperCase();
 const identityName=document.createElement('b');identityName.textContent=identity.display_name||('Akun '+String(data.exchange||'exchange'));
 const identityFingerprint=document.createElement('span');identityFingerprint.textContent='Fingerprint API Key: '+(identity.key_fingerprint||'tidak tersedia');
 identityMain.append(identityCaption,identityName,identityFingerprint);
 if(identity.account_id){const accountId=document.createElement('span');accountId.textContent='ID akun exchange: '+identity.account_id;identityMain.append(accountId);}
 const identityVerified=document.createElement('span');identityVerified.className='identity-verified';identityVerified.textContent='API akun berhasil merespons';
 identityPanel.append(identityMain,identityVerified);
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
 const apiPermissions=account.api_permissions||{};
 const permissionCheckAvailable=apiPermissions.available===true;
 const spotTradingEnabled=data.exchange==='binance'&&permissionCheckAvailable&&Boolean(apiPermissions.spot_trading);
 const futuresTradingEnabled=data.exchange==='binance'&&permissionCheckAvailable&&Boolean(apiPermissions.futures_trading);
 const bybitWriteEnabled=data.exchange==='bybit'&&permissionCheckAvailable&&(
  apiPermissions.read_only!==true||Boolean(apiPermissions.spot_trading)||Boolean(apiPermissions.contract_trading)||
  Boolean(apiPermissions.withdrawals)||Boolean(apiPermissions.transfers));
 const tradingPermissionEnabled=spotTradingEnabled||futuresTradingEnabled||bybitWriteEnabled;
 const permissionUnknown=!permissionCheckAvailable;
 const permissionWarning=data.exchange==='bybit'
  ?[apiPermissions.read_only!==true?'API Key tidak read-only':'',apiPermissions.spot_trading?'Spot Trading':'',
    apiPermissions.contract_trading?'Contract Trading':'',apiPermissions.withdrawals?'Withdrawal':'',
    apiPermissions.transfers?'Transfer':''].filter(Boolean).join(', ')
  :spotTradingEnabled&&futuresTradingEnabled?'izin Spot dan Futures Trading':spotTradingEnabled?'izin Spot Trading':'izin Futures Trading';
 const permissionStatus=tradingPermissionEnabled
  ?'PERINGATAN KEAMANAN: '+(data.exchange==='bybit'?'permission Bybit aktif: ':'izin API Key Binance aktif: ')+permissionWarning+'. RADAR tetap hanya membaca data dan tidak mengirim order.'
  :permissionUnknown
   ?'Status izin API Key belum dapat diverifikasi oleh endpoint resmi. Jangan anggap key sudah read-only sebelum diperiksa langsung di exchange.'
   :data.exchange==='binance'
    ?'Izin API Key terverifikasi: Spot & Margin Trading dan Futures Trading nonaktif.'
    :apiPermissions.read_only===true
     ?'Izin API Key Bybit terverifikasi read-only; permission trading, transfer, dan withdrawal tidak terdeteksi.'
     :'Status permission Bybit belum memenuhi kriteria read-only.';
 document.getElementById('account-checked-at').textContent=(permissionStatus?permissionStatus+' ':'')+'Terakhir diperiksa: '+new Date(data.checked_at).toLocaleString()+' · RADAR hanya membaca data; tidak ada order, transfer, atau withdrawal.';
 document.getElementById('account-checked-at').classList.toggle('account-warning',tradingPermissionEnabled||permissionUnknown||!positionsAvailable);
 accountConnected=true;
 refreshAccountButton.disabled=false;
 document.getElementById('exchange-status').textContent=tradingPermissionEnabled?'TERHUBUNG · PERIKSA IZIN API':permissionUnknown?'TERHUBUNG · IZIN BELUM TERVERIFIKASI':positionsAvailable?'TERHUBUNG · READ-ONLY':'TERHUBUNG · DATA PARSIAL';
 document.getElementById('hub-status').textContent=tradingPermissionEnabled?'PERINGATAN / IZIN TRADING AKTIF':permissionUnknown?'READ-ONLY / IZIN BELUM TERVERIFIKASI':positionsAvailable?'READ-ONLY / TERHUBUNG':'READ-ONLY / DATA PARSIAL';
 document.getElementById('api-state').textContent=tradingPermissionEnabled?'Izin trading aktif':permissionUnknown?'Izin API belum terverifikasi':positionsAvailable?'Permintaan akun berhasil':'Sebagian data akun tidak tersedia';
 feedback.textContent=tradingPermissionEnabled?'Koneksi berhasil, tetapi '+permissionWarning+' perlu ditinjau di pengaturan API Key. RADAR tidak mengirim order.':permissionUnknown?'Koneksi berhasil, tetapi permission API Key belum dapat diverifikasi. Periksa izin langsung di '+activeExchange+'.':positionsAvailable?'Data akun berhasil dibaca dari '+activeExchange+'. Permission API Key sudah diperiksa; tidak ada order yang dikirim.':'Saldo terbaca; data posisi belum lengkap.';
}
async function loadExchangeStatus(){
 try{
  const response=await fetch('/api/exchanges/status',{cache:'no-store'});const body=await response.json();
  if(!response.ok||body.status!=='success')throw new Error('Status API tidak tersedia.');
  Object.assign(exchangeConfigs,body.exchanges||{});exchangeAccessConfigured=Boolean(body.access_configured);updateConnectionUi();
 }catch(error){exchangeAccessConfigured=false;feedback.textContent='Tidak dapat memeriksa backend. Perbarui halaman setelah deployment selesai.';document.getElementById('api-state').textContent='Backend exchange belum tersedia';}
}
refreshStatusButton.addEventListener('click',async()=>{refreshStatusButton.disabled=true;refreshStatusButton.textContent='Memeriksa…';try{await loadExchangeStatus();}finally{refreshStatusButton.disabled=false;refreshStatusButton.textContent='Perbarui status server';}});
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
 if(!/^[A-Z0-9]{3,24}$/.test(symbol)){marketFeedback.textContent='Pair tidak valid. Gunakan huruf/angka, contoh BTCUSDT.';return;}
 marketButton.disabled=true;marketFeedback.textContent='Mengambil ticker '+symbol+'…';
 try{
  const query=new URLSearchParams({exchange:requestedExchange.toLowerCase(),symbol});
  const response=await fetch('/api/exchanges/market?'+query.toString(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  const body=await response.json();
  if(!response.ok||body.status!=='success')throw new Error(body.message||'Data market gagal diambil.');
  if(activeExchange===requestedExchange)renderMarket(body);
 }catch(error){
  if(activeExchange===requestedExchange)marketFeedback.textContent=error.message;
 }finally{marketButton.disabled=false;}
});
async function connectExchange(){
 const requestedExchange=activeExchange;
 const requestId=++accountRequestId;
 if(accessInput.value.trim())exchangeAccessToken=accessInput.value.trim();
 if(!exchangeAccessConfigured){feedback.textContent='Akses privat belum diaktifkan di server. Tambahkan EXCHANGE_ACCESS_TOKEN di Hostless.';return;}
 if(!exchangeAccessToken){feedback.textContent='Masukkan kunci akses privat Exchange Hub terlebih dahulu.';accessInput.focus();return;}
 connectButton.disabled=true;refreshAccountButton.disabled=true;
 connectButton.textContent='Mengambil data akun…';
 feedback.textContent='Menghubungi '+requestedExchange+' melalui server RADAR AI…';
 try{
  const response=await fetch('/api/exchanges/'+requestedExchange.toLowerCase()+'/account',{cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'x-exchange-access-token':exchangeAccessToken}});
  const body=await response.json();
  if(!response.ok||body.status!=='success'){
   if(response.status===401)throw new Error('Token akses ditolak. Periksa token privat lalu coba lagi.');
   if(response.status===503)throw new Error('Akses privat belum dikonfigurasi di server.');
   throw new Error((body.message||'Koneksi exchange gagal.')+(body.code?' ['+body.code+']':''));
  }
  if(activeExchange===requestedExchange&&requestId===accountRequestId)renderAccount(body);
 }catch(error){
  if(activeExchange===requestedExchange&&requestId===accountRequestId){
   clearAccount();
   const empty=document.createElement('div');empty.className='account-empty account-error';empty.textContent=error.name==='TimeoutError'?'Server terlalu lama merespons. Coba lagi beberapa saat.':error.message;summary.append(empty);
   document.getElementById('exchange-status').textContent='KONEKSI GAGAL';
   document.getElementById('hub-status').textContent='READ-ONLY / PERLU PEMERIKSAAN';
   document.getElementById('api-state').textContent='Koneksi belum berhasil';
   feedback.textContent=empty.textContent+' Periksa izin read-only, whitelist IP, dan environment server.';
  }
 }finally{
  if(requestId===accountRequestId){
   connectButton.disabled=false;
   connectButton.textContent='Uji koneksi & muat akun';
   refreshAccountButton.disabled=!accountConnected;
  }
 }
}
connectButton.addEventListener('click',connectExchange);
refreshAccountButton.addEventListener('click',connectExchange);
accessInput.addEventListener('input',()=>{exchangeAccessToken=accessInput.value.trim();});
document.getElementById('toggle-access-token').addEventListener('click',event=>{
 const visible=accessInput.type==='password';
 accessInput.type=visible?'text':'password';
 event.currentTarget.textContent=visible?'Sembunyikan token':'Tampilkan token';
 event.currentTarget.setAttribute('aria-pressed',String(visible));
});
document.getElementById('clear-access-token').addEventListener('click',()=>{
 accessInput.value='';exchangeAccessToken='';accountRequestId++;connectButton.disabled=false;connectButton.textContent='Uji koneksi & muat akun';refreshAccountButton.disabled=true;accessInput.type='password';
 document.getElementById('toggle-access-token').textContent='Tampilkan token';
 document.getElementById('toggle-access-token').setAttribute('aria-pressed','false');
 clearAccount();feedback.textContent='Token dan tampilan data akun dihapus dari halaman.';
});

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
