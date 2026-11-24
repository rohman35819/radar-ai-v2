'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync(require.resolve('../public/solscan.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../public/solscan.html'), 'utf8');

test('Solscan tidak menampilkan Invalid Date saat waktu observasi tidak tersedia', () => {
  assert.match(js, /const formatObserved/);
  assert.match(js, /Number\.isFinite\(date\.getTime\(\)\)/);
  assert.doesNotMatch(js, /new Date\(payload\.observed_at\)\.toLocaleString/, 'raw timestamp is never rendered unchecked');
  assert.match(js, /Waktu observasi tidak tersedia dari server/);
  assert.match(js, /\$\('#updated-at'\)\.textContent=observedLabel\(payload\.observed_at\)/);
});

test('Notifikasi Solscan menyebut status waktu observasi secara jujur', () => {
  const start = js.indexOf('const failures=Object.entries(endpoints)');
  assert.ok(start >= 0, 'notice builder exists');
  const source = js.slice(start, start + 700);
  assert.match(source, /formatObserved\(payload\.observed_at\)/);
  assert.match(source, /observedText\?' Data diobservasi '/);
  assert.match(source, /' Waktu observasi tidak tersedia dari server\.'/);
});

test('Kontrol Solscan dapat diakses pembaca layar', () => {
  assert.match(html, /id="refresh"[^>]*aria-label="Perbarui data Solscan"/);
  assert.match(html, /id="notice"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(js, /menu\.setAttribute\('aria-label',open\?'Tutup menu':'Buka menu'\)/);
});
