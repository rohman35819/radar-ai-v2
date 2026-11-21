'use strict';
const form=document.querySelector('#account-form');
const notice=document.querySelector('#notice');
let mode='login';
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{
 mode=button.dataset.tab;
 document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===button));
 document.querySelector('#name-field').hidden=mode!=='register';
 form.querySelector('button[type=submit]').textContent=mode==='register'?'Pratinjau pendaftaran':'Pratinjau login';
}));
document.querySelectorAll('[data-plan]').forEach(button=>button.addEventListener('click',()=>{
 notice.textContent='Paket '+button.dataset.plan+' dipilih sebagai pratinjau. Aktivasi dan pembayaran belum tersedia.';
 document.querySelector('.account').scrollIntoView({behavior:'smooth',block:'center'});
}));
form.addEventListener('submit',event=>{
 event.preventDefault();
 notice.textContent=mode==='register'?'Pendaftaran belum aktif. Data tidak dikirim atau disimpan.':'Login belum aktif. Data tidak dikirim atau disimpan.';
});