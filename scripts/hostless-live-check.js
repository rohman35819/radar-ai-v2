'use strict';
const baseUrl = process.env.RADAR_LIVE_URL || 'https://radar-ai-v2.hostless.app';

async function request(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const url = new URL(path, baseUrl);
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      signal: controller.signal
    });
    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* Keep only status metadata; never print raw response bodies. */ }
    return { http: response.status, data };
  } catch (error) {
    return { error: error && error.cause && error.cause.code || error && error.code || error && error.name || 'REQUEST_FAILED' };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  let host = 'invalid-url';
  try { host = new URL(baseUrl).host; } catch { /* Report invalid base without echoing environment value. */ }
  const [ready, snapshot] = await Promise.all([request('/api/ready'), request('/api/snapshot')]);
  const sources = Array.isArray(snapshot.data && snapshot.data.health && snapshot.data.health.news_sources)
    ? snapshot.data.health.news_sources
    : [];
  const news = Array.isArray(snapshot.data && snapshot.data.news) ? snapshot.data.news : [];
  const newsHealth = snapshot.data && snapshot.data.health && snapshot.data.health.news;
  const report = {
    host,
    ready: {
      http: ready.http || null,
      error: ready.error || null,
      status: ready.data && ready.data.status || null,
      storage: ready.data && ready.data.storage || null
    },
    snapshot: {
      http: snapshot.http || null,
      error: snapshot.error || null,
      status: snapshot.data && snapshot.data.status || null,
      stale: snapshot.data && snapshot.data.stale,
      last_refresh: snapshot.data && snapshot.data.last_refresh || null,
      last_ok: snapshot.data && snapshot.data.last_ok || null,
      news_count: news.length,
      news_health: newsHealth ? { ok: newsHealth.ok, error: newsHealth.error || null } : null,
      news_sources: sources.map((source) => ({
        host: source.host,
        ok: source.ok,
        count: source.count,
        error: source.error || null
      }))
    }
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  const newsHealthy = !!(newsHealth && newsHealth.ok === true && news.length > 0 && sources.some((source) => source.ok));
  if (ready.http !== 200 || snapshot.http !== 200 || !newsHealthy) process.exitCode = 1;
}
main();
