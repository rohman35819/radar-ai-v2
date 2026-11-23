'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('Early Gem Scanner tersedia di navigasi dan menampilkan batas data on-chain', () => {
  const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
  const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  const css = fs.readFileSync(require.resolve('../public/style.css'), 'utf8');
  assert.match(html, /data-t="early-gems"/);
  assert.match(app, /function renderEarlyGems\(\)/);
  assert.match(app, /else if\(tab==='early-gems'\)renderEarlyGems\(\)/);
  assert.match(app, /pool baru bukan bukti token baru dibuat/i);
  assert.match(app, /bukan audit kontrak/i);
  assert.match(app, /x\.token_address/);
  assert.match(app, /x\.token_url/);
  assert.match(app, /goplus\/decode/);
  assert.match(app, /Decode calldata \/ signature/);
  assert.match(app, /risky_signature/);
  assert.match(app, /Token ↗/);
  assert.match(css, /\.gem-grid/);
  assert.doesNotMatch(app, /innerHTML\s*=/);
});
