'use strict';
const form=document.getElementById('position-form');
const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:6}):'—';
const exchangeCopy={
 Binance:{description:'Spot dan USDⓈ-M Futures. Koneksi akun belum diaktifkan.',note:'API Key Binance tetap disimpan di server. Jangan masukkan API Secret ke halaman ini atau ke browser.'},
 Bybit:{description:'Spot dan Derivatives. Koneksi Bybit akan disiapkan setelah fondasi Binance.',note:'Bybit akan menggunakan jalur koneksi tersendiri. Kredensial hanya boleh disimpan di server, bukan di browser.'}
};
function selectExchange(name){
 const selected=exchangeCopy[name]?name:'Binance';
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
 document.getElementById('api-state').textContent='Menunggu konfigurasi server';
}
document.querySelectorAll('[data-exchange-tab]').forEach(button=>{
 button.addEventListener('click',()=>selectExchange(button.dataset.exchangeTab));
});
document.getElementById('exchange').addEventListener('change',event=>selectExchange(event.target.value));
selectExchange('Binance');
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
