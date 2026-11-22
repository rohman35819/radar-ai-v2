'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadWorker() {
  const handlers = {};
  const calls = { cacheOpen: [], cacheDeletes: [], staticFiles: [], fetch: [] };
  const cacheApi = {
    open: async (name) => {
      calls.cacheOpen.push(name);
      return { addAll: async (files) => { calls.staticFiles = files; } };
    },
    keys: async () => ['radar-shell-v11', 'radar-shell-v7', 'radar-api-v7', 'old-cache', 'other-app-cache'],
    delete: async (name) => { calls.cacheDeletes.push(name); return true; },
    match: async () => null,
  };
  const context = {
    URL,
    location: { origin: 'https://radar.test' },
    caches: cacheApi,
    fetch: async (request, options) => {
      calls.fetch.push({ request, options });
      return { ok: true, status: 200 };
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

test('PWA shell menyediakan halaman Exchange Hub dan membersihkan cache API lama', async () => {
  const { handlers, calls } = loadWorker();
  let installPromise;
  handlers.install({ waitUntil: (promise) => { installPromise = promise; } });
  await installPromise;
  assert.ok(calls.staticFiles.includes('/trading.html'));
  assert.ok(calls.staticFiles.includes('/trading.js'));
  assert.ok(calls.staticFiles.includes('/command.html'));
  assert.ok(calls.staticFiles.includes('/command.css'));
  assert.ok(calls.staticFiles.includes('/command.js'));
  assert.ok(calls.staticFiles.includes('/membership.html'));
  let activatePromise;
  handlers.activate({ waitUntil: (promise) => { activatePromise = promise; } });
  await activatePromise;
  assert.ok(calls.cacheDeletes.includes('radar-api-v7'));
  assert.equal(calls.cacheDeletes.includes('radar-shell-v11'), false);
  assert.equal(calls.cacheDeletes.includes('other-app-cache'), false);
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
