'use strict';
const form=document.getElementById('position-form');
const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:6}):'—';
form.addEventListener('submit',e=>{
 e.preventDefault();
 const margin=Number(document.getElementById('margin').value),lev=Number(document.getElementById('leverage').value),entry=Number(document.getElementById('entry').value),sl=Number(document.getElementById('sl').value),tp=Number(document.getElementById('tp').value),side=document.getElementById('side').value;
 const out=document.getElementById('calc-result');
 if(!(margin>0&&lev>0&&entry>0)){out.innerHTML='<b>Data belum lengkap</b><p>Masukkan margin dan harga masuk yang valid.</p>';return;}
 const notional=margin*lev,qty=notional/entry,dir=side==='LONG'?1:-1;
 const pnlAt=price=>Number.isFinite(price)&&price>0?(price-entry)*qty*dir:null;
 const risk=pnlAt(sl),reward=pnlAt(tp),rr=risk!==null&&risk<0&&reward!==null&&reward>0?reward/Math.abs(risk):null;
 out.replaceChildren();
 const heading=document.createElement('b');heading.textContent='Hasil simulasi '+side+' · '+document.getElementById('pair').value.toUpperCase();out.append(heading);
 const grid=document.createElement('div');grid.className='result-grid';
 const rows=[['Nilai posisi',fmt(notional)+' USDT'],['Kuantitas estimasi',fmt(qty)],['Margin',fmt(margin)+' USDT'],['Leverage',lev+'x'],['Estimasi PnL di SL',risk===null?'Belum diisi':fmt(risk)+' USDT'],['Estimasi PnL di TP',reward===null?'Belum diisi':fmt(reward)+' USDT'],['Risk / Reward',rr===null?'Belum bisa dihitung':'1 : '+fmt(rr)]];
 rows.forEach(([k,v])=>{const cell=document.createElement('div'),small=document.createElement('small'),bold=document.createElement('b');small.textContent=k;bold.textContent=v;cell.append(small,bold);grid.append(cell);});
 out.append(grid);
 const note=document.createElement('p');note.textContent='Perkiraan belum memasukkan fee, funding, slippage, aturan ukuran kontrak, dan harga likuidasi exchange. Ini bukan order dan tidak terhubung ke akun.';out.append(note);
});