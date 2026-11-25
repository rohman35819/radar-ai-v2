'use strict';
// QA Top Movers: identitas aset, dua tombol grafik, URL aman, dan render kartu.
// DOM shim dipakai untuk menguji perilaku nyata app.js tanpa browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const appSource = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const style = fs.readFileSync(require.resolve('../public/style.css'), 'utf8');

function loadTopMovers() {
  const registry = new Map();
  class FakeElement {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.attributes = {};
      this.className = '';
      this.textContent = '';
      this.disabled = false;
      this._listeners = {};
      this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key === 'id') { this.id = String(value); registry.set(this.id, this); }
    }
    getAttribute(key) { return this.attributes[key]; }
    addEventListener(type, handler) { (this._listeners[type] ||= []).push(handler); }
    append(...items) {
      for (const item of items.flat(Infinity)) {
        if (item === null || item === undefined || item === false) continue;
        this.children.push(item);
        if (item instanceof FakeElement && item.id) registry.set(item.id, item);
      }
    }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    contains(node) { return node === this || this.children.some((child) => child instanceof FakeElement && child.contains(node)); }
    focus() { document.activeElement = this; }
    querySelector(selector) {
      if (selector.startsWith('#')) return registry.get(selector.slice(1)) || null;
      return this.find((node) => selector === '.chart-head button' && node.tagName === 'BUTTON');
    }
    querySelectorAll(selector) { return selector === '[data-chart-days]' ? this.find((node) => node.attributes['data-chart-days'] !== undefined) : []; }
    find(predicate) {
      const found = [];
      const walk = (node) => { for (const child of node.children || []) { if (child instanceof FakeElement) { if (predicate(child)) found.push(child); walk(child); } } };
      walk(this);
      return found;
    }
    remove() { registry.delete(this.id); }
  }
  const document = {
    activeElement: null,
    documentElement: new FakeElement('html'),
    body: new FakeElement('body'),
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => Object.assign(new FakeElement('#text'), { textContent: String(text) }),
    createElementNS: (_ns, tag) => new FakeElement(tag),
    getElementById: (id) => registry.get(id) || null,
    querySelector: (selector) => {
      if (selector.startsWith('#')) return registry.get(selector.slice(1)) || null;
      if (selector === '.brand') {
        if (!registry.has('__brand')) { const brand = new FakeElement('a'); brand.className = 'brand'; registry.set('__brand', brand); }
        return registry.get('__brand');
      }
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const context = {
    document, Node: FakeElement, URL, Date, Number, String, Object, Array, Math, JSON, Infinity,
    console: { log() {}, error() {} },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: true, json: async () => ({ tokens: [], health: {} }) }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    AbortSignal: { timeout: () => ({}) },
    navigator: { serviceWorker: { register: async () => {} } },
  };
  context.window = context;
  context.globalThis = context;
  context.window.location = { href: 'https://radar.test/' };
  context.window.scrollY = 0;
  context.window.scrollTo = () => {};
  context.window.innerWidth = 1200;
  context.window.addEventListener = () => {};
  for (const id of ['menu-toggle', 'refresh', 'theme', 'sidebar-backdrop', 'status', 'side-status', 'banner', 'page-title', 'crumb', 'toast']) {
    document.createElement('div').setAttribute('id', id);
  }
  const view = new FakeElement('main'); view.setAttribute('id', 'view'); document.body.append(view);
  vm.runInNewContext(appSource + '\nglobalThis.__t={validCoinId,externalTokenUrl,moverCard,chartSeriesStats,drawTokenChart};', context, { filename: 'public/app.js' });
  return { context, document, FakeElement };
}

const asset = (overrides = {}) => ({
  id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 64000, change_24h: 3.5,
  market_cap: 1.26e12, volume_24h: 4.1e10, ...overrides,
});

test('URL eksternal mengutamakan DEX Screener bila kontrak dan chain valid', () => {
  const { context } = loadTopMovers();
  const t = context.__t;
  const evm = t.externalTokenUrl(asset({ contract_address: '0x' + 'a'.repeat(40), chain: 'eth' }));
  assert.equal(evm.href, 'https://dexscreener.com/ethereum/' + '0x' + 'a'.repeat(40));
  assert.equal(evm.source, 'DEX Screener');
  const sol = t.externalTokenUrl(asset({ contract_address: 'So11111111111111111111111111111111111111112', chain: 'solana' }));
  assert.match(sol.href, /^https:\/\/dexscreener\.com\/solana\//);
  assert.equal(sol.chain, 'solana');
});

test('Aset tanpa kontrak memakai halaman CoinGecko berdasarkan ID tervalidasi', () => {
  const { context } = loadTopMovers();
  const t = context.__t;
  const result = t.externalTokenUrl(asset());
  assert.equal(result.href, 'https://www.coingecko.com/en/coins/bitcoin');
  assert.equal(result.source, 'CoinGecko');
  const invalidChain = t.externalTokenUrl(asset({ contract_address: '0x' + 'a'.repeat(40), chain: 'javascript' }));
  assert.equal(invalidChain.href, 'https://www.coingecko.com/en/coins/bitcoin', 'chain tidak dikenal tidak dipakai');
  assert.equal(t.externalTokenUrl(asset({ id: '../evil' })), null, 'tanpa ID valid tidak ada URL');
});

test('Simbol duplikat tidak mencampur identitas aset', () => {
  const { context } = loadTopMovers();
  const t = context.__t;
  const a = t.externalTokenUrl(asset({ id: 'bitcoin', symbol: 'DUP' }));
  const b = t.externalTokenUrl(asset({ id: 'ethereum', symbol: 'DUP' }));
  assert.notEqual(a.href, b.href);
  assert.match(a.href, /bitcoin$/);
  assert.match(b.href, /ethereum$/);
  const multi = t.externalTokenUrl(asset({
    id: 'multi', symbol: 'M', chains: [{ chain: 'unknown', contract_address: '0x' + 'a'.repeat(40) }, { chain: 'base', contract_address: '0x' + 'b'.repeat(40) }],
  }));
  assert.equal(multi.href, 'https://dexscreener.com/base/' + '0x' + 'b'.repeat(40));
});

test('Kartu Top Movers menampilkan data asli dan kedua tombol dengan identitas benar', () => {
  const { context, FakeElement } = loadTopMovers();
  const t = context.__t;
  const assets = [
    asset(), asset({ id: 'ethereum', symbol: 'ETH', name: 'Ethereum' }),
    asset({ id: 'solana', symbol: 'SOL', name: 'Solana' }),
    asset({ id: 'pepe', symbol: 'PEPE', name: 'Pepe', contract_address: '0x' + 'c'.repeat(40), chain: 'eth' }),
    asset({ id: 'phantom-token', symbol: 'BTC', name: 'Token Lain', price: null, change_24h: null, market_cap: null, volume_24h: null }),
  ];
  const hasClass = (node, cls) => String(node.className || '').split(/\s+/).includes(cls)
    || (node.children || []).some((child) => child instanceof FakeElement && hasClass(child, cls));
  const findClass = (node, cls) => {
    if (String(node.className || '').split(/\s+/).includes(cls)) return node;
    for (const child of node.children || []) {
      if (child instanceof FakeElement) { const found = findClass(child, cls); if (found) return found; }
    }
    return null;
  };
  const textOf = (node) => {
    if (String(node.textContent || '')) return String(node.textContent);
    return (node.children || []).map((child) => (child instanceof FakeElement ? textOf(child) : String(child.textContent || ''))).join(' ');
  };
  for (const item of assets) {
    const card = t.moverCard(item);
    const chart = findClass(card, 'chart-btn');
    const web = findClass(card, 'web-btn');
    assert.ok(chart, 'tombol Grafik RADAR hadir');
    assert.ok(web, 'tombol Grafik Eksternal hadir');
    assert.equal(chart.attributes['data-coin-id'], item.id, 'grafik memakai coin_id, bukan simbol');
    assert.equal(web.attributes['data-coin-id'], item.id, 'web memakai coin_id, bukan simbol');
    assert.equal(web.attributes.target, '_blank');
    assert.equal(web.attributes.rel, 'noopener noreferrer');
    const text = textOf(card);
    assert.match(text, new RegExp(item.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(text, /HARGA/);
    assert.match(text, /MCAP/);
    assert.match(text, /VOL/);
  }
  const missing = t.moverCard(asset({ id: '', symbol: 'NONE' }));
  assert.equal(findClass(missing, 'chart-btn').disabled, true, 'grafik dinonaktifkan tanpa ID');
  assert.equal(findClass(missing, 'web-btn'), null, 'tidak ada URL dibuat tanpa identitas');
  assert.match(textOf(missing), /Identitas eksternal tidak tersedia/);
});

test('Grafik internal memakai ID aset dan menolak data harga yang tidak cukup', () => {
  const { context, FakeElement } = loadTopMovers();
  const t = context.__t;
  assert.equal(t.validCoinId(asset()), 'bitcoin');
  assert.equal(t.validCoinId(asset({ id: 'BTC' })), null);
  const stats = t.chartSeriesStats([[1000, 10], [2000, 20], [3000, 15]]);
  assert.equal(stats.min, 10);
  assert.equal(stats.max, 20);
  assert.equal(stats.last, 15);
  const target = new FakeElement('div');
  assert.equal(t.drawTokenChart(target, [[1, 2]], {}), null);
  assert.ok(target.children.length > 0, 'empty state dirender');
});

test('Top Movers mempertahankan UI responsif dan tidak mengarang data', () => {
  assert.match(appSource, /\.map\(moverCard\)/);
  assert.doesNotMatch(appSource, /Math\.random/);
  assert.match(appSource, /\/api\/market-intelligence\/chart\?coin=/);
  assert.match(appSource, /noopener noreferrer/);
  assert.match(style, /\.mover-card/);
  assert.match(style, /\.mover-actions/);
  assert.match(style, /@media\(max-width:760px\)\{\.mover-numbers\{grid-template-columns:repeat\(2/);
  assert.match(style, /\.chart-modal/);
});

module.exports = { loadTopMovers };

