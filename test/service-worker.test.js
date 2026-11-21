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
    keys: async () => ['radar-shell-v6', 'radar-api-v6', 'old-cache'],
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
  assert.ok(calls.staticFiles.includes('/membership.html'));
  let activatePromise;
  handlers.activate({ waitUntil: (promise) => { activatePromise = promise; } });
  await activatePromise;
  assert.ok(calls.cacheDeletes.includes('radar-api-v6'));
  assert.equal(calls.cacheDeletes.includes('radar-shell-v6'), false);
});
