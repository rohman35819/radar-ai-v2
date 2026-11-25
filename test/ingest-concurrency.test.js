'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ingest = require('../lib/ingest');

test('runBounded enforces concurrency and preserves result order', async () => {
  let active = 0;
  let maximum = 0;
  const tasks = Array.from({ length: 9 }, (_, index) => async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, (8 - index) * 2));
    active--;
    return index * 2;
  });
  const results = await ingest.runBounded(tasks, 3);
  assert.equal(maximum, 3);
  assert.deepEqual(results, [0, 2, 4, 6, 8, 10, 12, 14, 16]);
});

test('refresh overlaps independent providers but keeps configured concurrency bounded', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-ingest-parallel-'));
  const previous = {
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cfg = {
    ...ingest.loadConfig(), dataDir: dir, feeds: ['https://feed.example.test/rss'],
    tgToken: '', tgChat: '', exchEnabled: false, earlyGemsEnabled: false, ingestConcurrency: 3,
  };
  let active = 0;
  let maximum = 0;
  let started = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const waitForGate = async value => {
    active++;
    started++;
    maximum = Math.max(maximum, active);
    if (started === 3) release();
    await gate;
    active--;
    return value;
  };
  const fallback = setTimeout(() => release(), 300);
  const src = {
    fetchAiCoins: async () => [],
    fetchLlama: async () => waitForGate({ protocols: [], fees: [], revenue: [] }),
    fetchNews: async () => waitForGate([]),
    fetchUnlocks: async () => waitForGate([]),
  };
  try {
    const state = await ingest.refresh(ingest.emptyState(), cfg, src);
    clearTimeout(fallback);
    assert.equal(started, 3);
    assert.equal(maximum, 3);
    assert.equal(state.health.defillama.ok, true);
    assert.equal(state.health.news.ok, true);
    assert.equal(state.health.unlocks.ok, true);
  } finally {
    clearTimeout(fallback);
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.secret === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = previous.secret;
    if (previous.serviceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.serviceRole;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig clamps ingestion concurrency to a safe bounded range', () => {
  const previous = process.env.INGEST_CONCURRENCY;
  try {
    process.env.INGEST_CONCURRENCY = '99';
    assert.equal(ingest.loadConfig().ingestConcurrency, 3);
    process.env.INGEST_CONCURRENCY = '0';
    assert.equal(ingest.loadConfig().ingestConcurrency, 1);
  } finally {
    if (previous === undefined) delete process.env.INGEST_CONCURRENCY; else process.env.INGEST_CONCURRENCY = previous;
  }
});
