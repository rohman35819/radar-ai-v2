'use strict';
// Regression runtime: memastikan menu action/intel benar-benar merender, bukan kosong/System Health.
// Fixture deterministik; bukan data pasar nyata.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const appSource = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const top5Source = fs.readFileSync(require.resolve('../public/top5.js'), 'utf8');
const NOW = Date.parse('2026-11-26T00:00:00.000Z');

function loadDashboard() {
  const registry = new Map();
  class FakeElement {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.attributes = {};
      this.className = '';
      this.textContent = '';
      this.value = '';
      this.hidden = false;
      this.disabled = false;
      this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key === 'id') { this.id = String(value); registry.set(this.id, this); }
    }
    getAttribute(key) { return this.attributes[key]; }
    addEventListener() {}
    append(...items) {
      for (const item of items.flat(Infinity)) {
        if (item === null || item === undefined || item === false) continue;
        this.children.push(item);
      }
    }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    contains(node) { return node === this || this.children.some((child) => child instanceof FakeElement && child.contains(node)); }
    focus() {}
    querySelector(selector) {
      if (selector.startsWith('#')) return registry.get(selector.slice(1)) || null;
      return null;
    }
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
      if (selector === '.brand') return registry.get('__brand') || null;
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const brand = new FakeElement('a'); brand.className = 'brand'; registry.set('__brand', brand);
  for (const id of ['menu-toggle', 'refresh', 'theme', 'sidebar-backdrop', 'status', 'side-status', 'banner', 'page-title', 'crumb', 'toast', 'view']) {
    const node = new FakeElement('div'); node.setAttribute('id', id); registry.set(id, node);
  }
  const context = {
    document, Node: FakeElement, URL, Date, Number, String, Object, Array, Math, JSON, Infinity,
    console: { log() {}, error() {} },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: true, json: async () => ({ status: 'success', days: 7, data: { prices: [] }, updated_at: new Date(NOW).toISOString() }) }),
    AbortSignal: { timeout: () => ({}) },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    navigator: { serviceWorker: { register: async () => {} } },
  };
  context.window = context; context.globalThis = context;
  context.window.location = { href: 'https://radar.test/' };
  context.window.scrollY = 0; context.window.scrollTo = () => {}; context.window.addEventListener = () => {};
  vm.runInNewContext(top5Source, context);
  vm.runInNewContext(appSource + '\nglobalThis.__set=(t)=>{tab=t};globalThis.__data=(d)=>{data=d};globalThis.__render=()=>render();globalThis.__open=openTradeAnalysis;', context);
  return { context, registry, FakeElement };
}

const textOf = (node, FakeElement) => {
  let result = String(node.textContent || '');
  for (const child of node.children || []) if (child instanceof FakeElement) result += ' ' + textOf(child, FakeElement);
  return result;
};

const tokens = Array.from({ length: 5 }, (_, index) => ({
  id: 'token-' + index, symbol: 'T' + index, name: 'Token ' + index, price: 10 + index,
  market_cap: 1e7 + index, volume_24h: 1e6 + index, change_24h: index,
  fdv: 2e7, source_updated_at: new Date(NOW - 60000).toISOString(), flags: [],
}));

test('action menampilkan kartu Top 5 tanpa exception', () => {
  const { context, registry, FakeElement } = loadDashboard();
  context.__data({ tokens, health: {}, last_ok: new Date(NOW).toISOString() });
  context.__set('action');
  assert.doesNotThrow(() => context.__render());
  const view = registry.get('view');
  const text = textOf(view, FakeElement);
  assert.match(text, /Top 5 Action Center/);
  assert.match(text, /VIEW TRADE ANALYSIS/);
  assert.equal((text.match(/VIEW TRADE ANALYSIS/g) || []).length, 5, 'lima kartu dirender');
  assert.doesNotMatch(text, /System Health/);
});

test('intel menampilkan matriks kemampuan, bukan System Health', () => {
  const { context, registry, FakeElement } = loadDashboard();
  context.__data({ tokens, health: {}, last_ok: new Date(NOW).toISOString() });
  context.__set('intel');
  assert.doesNotThrow(() => context.__render());
  const text = textOf(registry.get('view'), FakeElement);
  assert.match(text, /Radar Intelligence/);
  assert.match(text, /Smart Money Tracking/);
  assert.match(text, /BELUM TERSEDIA/);
  assert.doesNotMatch(text, /System Health/);
});

test('tombol analisis membuka modal tanpa ReferenceError', async () => {
  const { context, registry, FakeElement } = loadDashboard();
  context.__data({ tokens, health: {}, last_ok: new Date(NOW).toISOString() });
  assert.doesNotThrow(() => context.__open(tokens[0]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const modal = registry.get('trade-analysis-modal');
  assert.ok(modal, 'modal analisis dibuat');
  const text = textOf(modal, FakeElement);
  assert.match(text, /TRADING ANALYSIS/);
  assert.match(text, /SIGNAL QUALITY/);
});
