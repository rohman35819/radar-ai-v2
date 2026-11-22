'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(require.resolve('../public/trading.html'), 'utf8');
const css = fs.readFileSync(require.resolve('../public/trading.css'), 'utf8');
const js = fs.readFileSync(require.resolve('../public/trading.js'), 'utf8');
const exchangeService = fs.readFileSync(require.resolve('../lib/exchanges.js'), 'utf8');

test('Exchange Hub menyediakan kontrol token akses yang bisa ditampilkan dan dihapus', () => {
  assert.match(html, /id="toggle-access-token"/);
  assert.match(html, /id="clear-access-token"/);
  assert.match(js, /accessInput\.type=visible\?'text':'password'/);
  assert.match(js, /exchangeAccessToken='';accountRequestId\+\+;/);
  assert.match(js, /accessInput\.type='password'/);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
});

test('Exchange Hub menampilkan identitas akun terverifikasi dan fingerprint tanpa menyimpan token browser', () => {
  assert.match(html, /id="account-identity"/);
  assert.match(js, /identity\.display_name/);
  assert.match(js, /identity\.key_fingerprint/);
  assert.match(js, /API akun berhasil merespons/);
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
test('Exchange Hub memakai status izin API Key khusus Binance, bukan canTrade akun', () => {
  assert.match(exchangeService, /\/sapi\/v1\/account\/apiRestrictions/);
  assert.match(exchangeService, /enableSpotAndMarginTrading/);
  assert.match(exchangeService, /enableFutures/);
  assert.match(js, /account\.api_permissions/);
  assert.ok(js.includes('binanceWithdrawalsEnabled'));
  assert.ok(js.includes('binanceTransferEnabled'));
  assert.match(js, /permissionUnknown/);
  assert.doesNotMatch(js, /Boolean\(account\.spot\?\.can_trade\)/);
  assert.doesNotMatch(js, /Boolean\(account\.futures\?\.can_trade\)/);
  assert.match(exchangeService, /method: 'GET'/);
  assert.doesNotMatch(exchangeService, /method: '(POST|PUT|PATCH|DELETE)'/);
  assert.doesNotMatch(js, /\/api\/v[13]\/order|\/fapi\/v1\/order|\/fapi\/v2\/order/);
});


test('Exchange Hub verifies Bybit API key read-only state, account UID and wallet/trade permissions', () => {
  assert.ok(exchangeService.includes('/v5/user/query-api'));
  assert.ok(exchangeService.includes('read_only: rawApiKeyInfo.readOnly === 1'));
  assert.ok(exchangeService.includes('userID'));
  assert.ok(exchangeService.includes("withdrawals: walletPermissions.includes('Withdraw')"));
  assert.ok(js.includes('apiPermissions.read_only'));
  assert.ok(js.includes('apiPermissions.withdrawals'));
  assert.ok(js.includes('identity.account_id'));
  assert.ok(js.includes('apiPermissions.categories'));
  assert.ok(js.includes('Rincian permission Bybit'));
  assert.ok(exchangeService.includes('BYBIT_API_PERMISSION_READ_UNAVAILABLE'));
});
