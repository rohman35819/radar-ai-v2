'use strict';
// Benchmark reproduktif untuk /api/snapshot: payload penuh vs permintaan bersyarat (ETag/304).
// Dataset SYNTHETIC — bukan data pasar nyata. Tidak mengakses produksi atau API eksternal.
const { createApp } = require('../server');
const ingest = require('../lib/ingest');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const COUNT = Number(process.argv[2] || 205);
const REQUESTS = Number(process.argv[3] || 30);

function syntheticState(count) {
  const now = new Date().toISOString();
  return {
    ...ingest.emptyState(),
    lastOk: now,
    lastRefresh: now,
    tokens: Array.from({ length: count }, (_, i) => ({
      id: 'bench-token-' + i, symbol: 'B' + i, name: 'Synthetic Token ' + i,
      price: 1 + i / 100, market_cap: 1e7 + i * 1e5, volume_24h: 1e6 + i * 1e4,
      change_24h: (i % 20) - 10, fdv: 2e7 + i * 1e5, flags: [], source_updated_at: now,
    })),
  };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)].toFixed(3));
}

async function measure(base, headers) {
  const latencies = [];
  let bytes = 0;
  for (let i = 0; i < REQUESTS; i++) {
    const start = performance.now();
    const response = await fetch(base + '/api/snapshot', { headers });
    const body = await response.arrayBuffer();
    latencies.push(performance.now() - start);
    bytes += body.byteLength;
  }
  return { requests: REQUESTS, total_bytes: bytes, bytes_per_request: Math.round(bytes / REQUESTS),
    p50_ms: percentile(latencies, 0.5), p95_ms: percentile(latencies, 0.95), p99_ms: percentile(latencies, 0.99) };
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-bench-'));
  const cfg = { ...ingest.loadConfig(), dataDir: dir, adminToken: '', refreshMs: 6e5, feeds: [], cgKey: '' };
  const src = {
    fetchAiCoins: async () => [], fetchLlama: async () => ({ protocols: [], fees: [], revenue: [] }),
    fetchNews: async () => [], fetchUnlocks: async () => [],
  };
  const app = createApp({ cfg, src, state: syntheticState(COUNT) });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    const first = await fetch(base + '/api/snapshot');
    const etag = first.headers.get('etag');
    if (!etag) throw new Error('ETAG_MISSING');
    const full = await measure(base, {});
    const conditional = await measure(base, { 'if-none-match': etag });
    const saved = full.total_bytes - conditional.total_bytes;
    const ratio = full.bytes_per_request / Math.max(1, conditional.bytes_per_request);
    console.log(JSON.stringify({
      dataset: 'synthetic', tokens: COUNT, requests_per_case: REQUESTS, etag,
      full, conditional, bytes_saved_total: saved, bytes_ratio: Number(ratio.toFixed(1)),
    }, null, 2));
  } finally {
    app.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => { console.error('BENCHMARK_FAILED', error.message); process.exitCode = 1; });
