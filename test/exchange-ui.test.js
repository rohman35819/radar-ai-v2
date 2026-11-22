'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../public/trading.html'), 'utf8');
const css = fs.readFileSync(require.resolve('../public/trading.css'), 'utf8');
const js = fs.readFileSync(require.resolve('../public/trading.js'), 'utf8');

test('Exchange Hub menyediakan kontrol token akses yang bisa ditampilkan dan dihapus', () => {
  assert.match(html, /id="toggle-access-token"/);
  assert.match(html, /id="clear-access-token"/);
  assert.match(js, /accessInput\.type=visible\?'text':'password'/);
  assert.match(js, /exchangeAccessToken='';accountRequestId\+\+;/);
  assert.match(js, /accessInput\.type='password'/);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
});

test('Exchange Hub memiliki tombol refresh akun yang memakai koneksi privat yang sama', () => {
  assert.match(html, /id="refresh-account"/);
  assert.match(js, /refreshAccountButton\.addEventListener\('click',connectExchange\)/);
  assert.match(js, /headers:\{'x-exchange-access-token':exchangeAccessToken\}/);
});

test('Exchange Hub menghapus saldo dan posisi lama ketika refresh akun gagal', () => {
  assert.match(js, /clearAccount\(\);\s*const empty=document\.createElement\('div'\);empty\.className='account-empty account-error'/);
  assert.match(js, /classList\.remove\('account-warning'\)/);
});

test('Exchange Hub membatasi waktu request akun dan ticker serta menjaga request antar-exchange', () => {
  assert.match(js, /AbortSignal\.timeout\(20000\)/);
  assert.match(js, /AbortSignal\.timeout\(15000\)/);
  assert.match(js, /requestId===accountRequestId/);
  assert.match(js, /accountRequestId\+\+/);
});

test('Exchange Hub memvalidasi pair sebelum mengambil ticker', () => {
  assert.match(js, /if\(!\/\^\[A-Z0-9\]\{3,24\}\$\/\.test\(symbol\)\)/);
});

test('Exchange Hub memiliki layout responsif dan fokus keyboard yang terlihat', () => {
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /button:focus-visible,input:focus-visible/);
  assert.match(html, /aria-pressed="false"/);
});
test('Exchange Hub tetap read-only saat API Key Binance memiliki izin trading aktif', () => {
  assert.match(js, /PERINGATAN KEAMANAN: API Key Binance masih memiliki/);
  assert.match(js, /RADAR tetap berjalan dalam mode baca-saja dan tidak mengirim order/);
  assert.match(js, /gunakan key baru read-only saat memungkinkan/);
  assert.match(js, /method:'GET'/);
  assert.doesNotMatch(js, /\/api\/v[13]\/order|\/fapi\/v1\/order|\/fapi\/v2\/order/);
});
