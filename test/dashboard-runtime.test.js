'use strict';
// QA perilaku runtime dengan DOM shim minimal. Ini bukan pengganti browser/device QA,
// tetapi menguji logika nyata di public/app.js (bukan hanya pencarian teks statis).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadDashboard() {
  const registry = new Map();

  class FakeElement {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.attributes = {};
      this._listeners = {};
      this.className = '';
      this.textContent = '';
      this.value = '';
      this.hidden = false;
      this.selectionStart = 0;
      this.selectionEnd = 0;
      this.scrollTop = 0;
      this.classList = {
        add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false,
      };
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key === 'id') { this.id = String(value); registry.set(this.id, this); }
      if (key === 'type') this.type = String(value);
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
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
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
        if (!registry.has('__brand')) {
          const brand = new FakeElement('a');
          brand.className = 'brand';
          registry.set('__brand', brand);
        }
        return registry.get('__brand');
      }
      return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  const context = {
    document,
    Node: FakeElement,
    URL,
    Date,
    Number,
    String,
    Object,
    Array,
    Math,
    JSON,
    Infinity,
    console: { log: () => {}, error: () => {} },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ tokens: [], health: {}, last_ok: new Date().toISOString() }) }),
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    navigator: { serviceWorker: { register: async () => {} } },
  };
  context.window = context;
  context.globalThis = context;
  context.window.location = { href: 'https://radar.test/' };
  context.window.scrollY = 40;
  context.window.scrollTo = (x, y) => { context.window.scrollY = y; };
  context.window.innerWidth = 1200;
  context.window.addEventListener = () => {};

  for (const id of ['menu-toggle', 'refresh', 'theme', 'sidebar-backdrop', 'status', 'side-status', 'banner', 'page-title', 'crumb', 'toast']) {
    document.getElementById(id) || document.createElement('div').setAttribute('id', id);
  }
  const view = new FakeElement('main');
  view.setAttribute('id', 'view');
  document.body.append(view);

  const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  const probe = `
    globalThis.__t = {
      connectionState, ageLabel, dateTime, validCoinId, chartSeriesStats, drawTokenChart, externalCoinUrl, externalLinkNode, safeExternalLink, renderPreservingFocus,
      setRender: (fn) => { render = fn; },
      setState: (s) => {
        if ('data' in s) data = s.data;
        if ('loadFailed' in s) loadFailed = s.loadFailed;
        if ('snapshotReachable' in s) snapshotReachable = s.snapshotReachable;
      },
    };
  `;
  vm.runInNewContext(source + probe, context, { filename: 'public/app.js' });
  return { context, document, registry, view, FakeElement };
}

test('connectionState membedakan status gagal, terputus, basi, dan terhubung secara jujur', () => {
  const { context } = loadDashboard();
  const t = context.__t;

  t.setState({ data: null, loadFailed: true, snapshotReachable: false });
  assert.equal(t.connectionState().label, 'GAGAL MEMUAT');

  t.setState({ data: { last_ok: new Date().toISOString() }, loadFailed: false, snapshotReachable: false });
  assert.equal(t.connectionState().label, 'KONEKSI TERPUTUS');

  t.setState({ data: { last_ok: new Date().toISOString(), stale: true }, snapshotReachable: true });
  assert.equal(t.connectionState().label, 'DATA BASI');

  t.setState({ data: { last_ok: new Date().toISOString() }, snapshotReachable: true });
  assert.equal(t.connectionState().label, 'TERHUBUNG');
});

test('safeExternalLink menolak skema berbahaya dan tautan kosong', () => {
  const { context } = loadDashboard();
  const t = context.__t;
  assert.equal(t.safeExternalLink('https://example.com/news'), 'https://example.com/news');
  assert.equal(t.safeExternalLink('javascript:alert(1)'), null);
  assert.equal(t.safeExternalLink('data:text/html,x'), null);
  assert.equal(t.safeExternalLink(''), null);
  assert.equal(t.safeExternalLink(undefined), null);
});

test('ageLabel tidak mengarang umur ketika timestamp tidak tersedia', () => {
  const { context } = loadDashboard();
  assert.equal(context.__t.ageLabel(null), '—');
  assert.equal(context.__t.ageLabel('bukan-tanggal'), '—');
});

test('dateTime tidak merender Invalid Date untuk nilai yang tidak valid', () => {
  const { context } = loadDashboard();
  const t = context.__t;
  assert.equal(t.dateTime(null), 'Belum tersedia');
  assert.equal(t.dateTime('bukan-tanggal'), 'Waktu tidak tersedia');
  assert.notEqual(t.dateTime('bukan-tanggal'), 'Invalid Date');
  assert.notEqual(t.dateTime(new Date().toISOString()), 'Waktu tidak tersedia');
});

test('Tombol web token dibangun dari identifier yang tervalidasi', () => {
  const { context } = loadDashboard();
  const t = context.__t;
  assert.equal(t.externalCoinUrl({ id: 'bitcoin' }), 'https://www.coingecko.com/en/coins/bitcoin');
  assert.equal(t.externalCoinUrl({ gecko_id: 'ethereum' }), 'https://www.coingecko.com/en/coins/ethereum');
  for (const bad of ['../admin', 'javascript:alert(1)', 'https://evil.com', 'AB_CD', '', null, undefined]) {
    assert.equal(t.externalCoinUrl({ id: bad }), null, 'identifier ditolak: ' + bad);
  }
  const link = t.externalLinkNode({ id: 'bitcoin', symbol: 'BTC' });
  assert.equal(link.tagName, 'A');
  assert.equal(link.attributes.href, 'https://www.coingecko.com/en/coins/bitcoin');
  assert.equal(link.attributes.target, '_blank');
  assert.equal(link.attributes.rel, 'noopener noreferrer');
  assert.equal(t.externalLinkNode({}), null, 'token tanpa identifier tidak membuat tautan');
});

test('Identifier grafik divalidasi sesuai batas endpoint server', () => {
  const { context } = loadDashboard();
  const t = context.__t;
  assert.equal(t.validCoinId({ id: 'bitcoin' }), 'bitcoin');
  assert.equal(t.validCoinId({ gecko_id: 'ethereum' }), 'ethereum');
  for (const bad of ['../admin', 'BTC', 'a_b', '', null, undefined, 'x'.repeat(81)]) {
    assert.equal(t.validCoinId({ id: bad }), null, 'identifier ditolak: ' + bad);
  }
});

test('chartSeriesStats menghitung statistik dan koordinat dari data historis', () => {
  const { context } = loadDashboard();
  const t = context.__t;
  const series = [[1000, 10], [2000, 20], [3000, 15], [4000, 30]];
  const stats = t.chartSeriesStats(series, 720, 260, 24);
  assert.equal(stats.min, 10);
  assert.equal(stats.max, 30);
  assert.equal(stats.last, 30);
  assert.equal(stats.count, 4);
  assert.equal(stats.points.split(' ').length, 4);
  assert.match(stats.points, /^24\.0,/);
  assert.equal(t.chartSeriesStats([[1, 2]]), null, 'satu titik bukan grafik');
  assert.equal(t.chartSeriesStats([['x', 'y'], [2, 3]]), null, 'data rusak diabaikan');
});

test('drawTokenChart merender SVG dan statistik, serta empty state untuk data kurang', () => {
  const { context, FakeElement } = loadDashboard();
  const t = context.__t;
  const target = new FakeElement('div');
  const stats = t.drawTokenChart(target, [[1000, 10], [2000, 20], [3000, 15]], { updated_at: new Date('2026-11-25T00:00:00.000Z').toISOString() });
  assert.equal(stats.min, 10);
  assert.equal(stats.max, 20);
  assert.equal(stats.last, 15);
  const svg = target.children.find((child) => child instanceof FakeElement && child.tagName === 'SVG');
  assert.ok(svg, 'SVG dibuat');
  const polyline = svg.children.find((child) => child.tagName === 'POLYLINE');
  assert.match(polyline.attributes.points, /,/);
  const hasText = (node, needle) => {
    if (String(node.textContent || '').includes(needle)) return true;
    return (node.children || []).some((child) => child instanceof FakeElement && hasText(child, needle));
  };
  assert.ok(target.children.some((child) => hasText(child, 'Terendah')), 'statistik ditampilkan');

  const emptyTarget = new FakeElement('div');
  assert.equal(t.drawTokenChart(emptyTarget, [[1, 2]], {}), null);
  assert.ok(emptyTarget.children.some((child) => hasText(child, 'Data historis belum tersedia')), 'empty state ditampilkan');
});

test('renderPreservingFocus mengembalikan fokus, kursor, dan scroll setelah DOM diganti', () => {
  const { context, document, view, FakeElement } = loadDashboard();
  const t = context.__t;

  const oldInput = new FakeElement('input');
  oldInput.setAttribute('id', 'filter-q');
  oldInput.value = 'btc';
  oldInput.selectionStart = 2;
  oldInput.selectionEnd = 2;
  view.append(oldInput);
  document.activeElement = oldInput;
  view.scrollTop = 25;
  context.window.scrollY = 40;

  let rendered = false;
  t.setRender(() => {
    rendered = true;
    view.replaceChildren();
    const fresh = new FakeElement('input');
    fresh.setAttribute('id', 'filter-q');
    view.append(fresh);
    view.scrollTop = 0;
    context.window.scrollTo(0, 0);
  });

  t.renderPreservingFocus();

  assert.equal(rendered, true, 'render dipanggil');
  assert.equal(document.activeElement.id, 'filter-q', 'fokus kembali ke elemen dengan id yang sama');
  assert.notEqual(document.activeElement, oldInput, 'fokus mengarah ke elemen baru, bukan node lama');
  assert.equal(document.activeElement.selectionStart, 2, 'kursor dipertahankan');
  assert.equal(document.activeElement.selectionEnd, 2, 'seleksi dipertahankan');
  assert.equal(view.scrollTop, 25, 'scroll view dipertahankan');
  assert.equal(context.window.scrollY, 40, 'scroll halaman dipertahankan');
});
