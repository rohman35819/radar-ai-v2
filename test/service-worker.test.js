'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadWorker(options = {}) {
  const handlers = {};
  const calls = { cacheOpen: [], cacheDeletes: [], cachePuts: [], staticFiles: [], fetch: [] };
  const cacheApi = {
    open: async (name) => {
      calls.cacheOpen.push(name);
      return {
        addAll: async (files) => { calls.staticFiles = files; },
        put: async (request, response) => { calls.cachePuts.push({ request, response }); },
      };
    },
    keys: async () => ['radar-shell-v15', 'radar-shell-v14', 'radar-shell-v13', 'radar-shell-v12', 'radar-shell-v7', 'radar-api-v7', 'old-cache', 'other-app-cache'],
    delete: async (name) => { calls.cacheDeletes.push(name); return true; },
    match: async () => options.cachedResponse || null,
  };
  const context = {
    URL,
    location: { origin: 'https://radar.test' },
    caches: cacheApi,
    fetch: async (request, fetchOptions) => {
      calls.fetch.push({ request, options: fetchOptions });
      if (options.fetchError) throw options.fetchError;
      return { ok: true, status: 200, clone() { return this; } };
    },
    self: {
      clients: { claim: async () => {} },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: () => {},
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/sw.js'), 'utf8'), context);
  return { handlers, calls };
}

test('PWA tidak pernah menyimpan respons API ke Cache Storage', async () => {
  const { handlers, calls } = loadWorker();
  let responsePromise;
  handlers.fetch({
    request: { method: 'GET', url: 'https://radar.test/api/exchanges/binance/account' },
    respondWith: (promise) => { responsePromise = promise; },
  });
  await responsePromise;
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].options.cache, 'no-store');
  assert.deepEqual(calls.cacheOpen, []);
});

test('PWA shell menyediakan aset dashboard terbaru dan membersihkan cache lama', async () => {
  const { handlers, calls } = loadWorker();
  let installPromise;
  handlers.install({ waitUntil: (promise) => { installPromise = promise; } });
  await installPromise;
  assert.ok(calls.cacheOpen.includes('radar-shell-v15'));
  assert.ok(calls.staticFiles.includes('/'));
  assert.ok(calls.staticFiles.includes('/index.html?v=v2.3.1'));
  assert.ok(calls.staticFiles.includes('/market.html'));
  assert.ok(calls.staticFiles.includes('/market.js'));
  assert.ok(calls.staticFiles.includes('/market.css'));
  assert.ok(calls.staticFiles.includes('/app.js?v=v2.3.1'));
  assert.ok(calls.staticFiles.includes('/top5.js?v=v2.3.1'));
  assert.ok(calls.staticFiles.includes('/trading.html'));
  assert.ok(calls.staticFiles.includes('/trading.js'));
  assert.ok(calls.staticFiles.includes('/command.html'));
  assert.ok(calls.staticFiles.includes('/command.css'));
  assert.ok(calls.staticFiles.includes('/command.js'));
  assert.ok(calls.staticFiles.includes('/membership.html'));
  let activatePromise;
  handlers.activate({ waitUntil: (promise) => { activatePromise = promise; } });
  await activatePromise;
  assert.ok(calls.cacheDeletes.includes('radar-shell-v14'));
  assert.ok(calls.cacheDeletes.includes('radar-api-v7'));
  assert.equal(calls.cacheDeletes.includes('radar-shell-v15'), false);
  assert.equal(calls.cacheDeletes.includes('other-app-cache'), false);
});

test('PWA mengambil app.js dari jaringan lebih dulu dan memperbarui cache shell', async () => {
  const { handlers, calls } = loadWorker();
  let responsePromise;
  const request = { method: 'GET', url: 'https://radar.test/app.js' };
  handlers.fetch({ request, respondWith: (promise) => { responsePromise = promise; } });
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.cachePuts.length, 1);
  assert.equal(calls.cachePuts[0].request, request);
});

test('PWA menggunakan cache hanya sebagai fallback saat jaringan gagal', async () => {
  const cachedResponse = { status: 200, cached: true };
  const { handlers, calls } = loadWorker({ fetchError: new Error('offline'), cachedResponse });
  let responsePromise;
  handlers.fetch({
    request: { method: 'GET', url: 'https://radar.test/index.html' },
    respondWith: (promise) => { responsePromise = promise; },
  });
  const response = await responsePromise;
  assert.equal(response, cachedResponse);
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.cachePuts.length, 0);
});

test('Command Center menggunakan aset eksternal agar tidak diblokir strict CSP', () => {
  const html = fs.readFileSync(require.resolve('../public/command.html'), 'utf8');
  assert.match(html, /href="\/command\.css"/);
  assert.match(html, /src="\/command\.js"/);
  assert.doesNotMatch(html, /<style[\s>]/i);
  assert.doesNotMatch(html, /<script>/i);
});

test('Dashboard analytics tidak bergantung pada inline style yang diblokir CSP', () => {
  const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  assert.match(app, /class:'bar-fill'/);
  assert.match(app, /class:'breadth-progress'/);
  assert.doesNotMatch(app, /style\s*:/);
});
