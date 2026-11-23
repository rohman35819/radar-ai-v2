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

function summarizeSnapshot(snapshot) {
  const data = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const health = data.health && typeof data.health === 'object' ? data.health : {};
  const config = data.config_needed && typeof data.config_needed === 'object' ? data.config_needed : {};
  const meta = data.early_gems_meta && typeof data.early_gems_meta === 'object' ? data.early_gems_meta : {};
  const sources = Array.isArray(health.news_sources) ? health.news_sources : [];
  const news = Array.isArray(data.news) ? data.news : [];
  const newsHealth = health.news || null;
  const onchain = health.onchain || null;
  const trending = health.onchain_trending || null;
  const usage = config.goplus_usage && typeof config.goplus_usage === 'object' ? config.goplus_usage : {};
  const count = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  return {
    status: data.status || null,
    stale: typeof data.stale === 'boolean' ? data.stale : null,
    last_refresh: data.last_refresh || null,
    last_ok: data.last_ok || null,
    news_count: news.length,
    news_health: newsHealth ? { ok: newsHealth.ok === true, error: newsHealth.error || null } : null,
    news_sources: sources.map((source) => ({
      host: source.host,
      ok: source.ok === true,
      count: count(source.count),
      error: source.error || null
    })),
    early_gems: {
      enabled: typeof config.early_gems_enabled === 'boolean' ? config.early_gems_enabled : null,
      coingecko_key_configured: config.onchain_key === false ? true : config.onchain_key === true ? false : null,
      refresh_min: count(config.onchain_refresh_min),
      pool_count: Array.isArray(data.early_gems) ? data.early_gems.length : 0,
      fetched_at: meta.fetched_at || null,
      source: meta.source || null,
      health: onchain ? { ok: onchain.ok === true, error: onchain.error || null } : null,
      trending_health: trending ? { ok: trending.ok === true, error: trending.error || null } : null,
      trending_error: meta.trending_error || null
    },
    goplus: {
      credentials_configured: typeof config.goplus_enabled === 'boolean' ? config.goplus_enabled : null,
      day_count: count(usage.day_count),
      month_count: count(usage.month_count),
      daily_limit: count(usage.daily_limit),
      monthly_limit: count(usage.monthly_limit)
    }
  };
}

function summarizeDerivatives(result, http) {
  const data = result && result.data && typeof result.data === 'object' ? result.data : {};
  const sources = data.sources && typeof data.sources === 'object' ? data.sources : {};
  return {
    http: http || null,
    status: data.status || null,
    symbol: data.symbol || 'BTCUSDT',
    partial: data.partial === true,
    metrics: {
      funding: !!data.data?.funding,
      open_interest: !!data.data?.open_interest,
      open_interest_history: Array.isArray(data.data?.open_interest_history),
      taker_flow: Array.isArray(data.data?.taker_flow)
    },
    sources: Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, {
      ok: value?.ok === true,
      error: value?.error || null
    }])),
    error: data.code || result?.error || null
  };
}

function summarizeDex(result, http) {
  const data = result && result.data && typeof result.data === 'object' ? result.data : {};
  return {
    http: http || null,
    status: data.status || null,
    pair_count: Number.isFinite(Number(data.pair_count)) ? Number(data.pair_count) : null,
    same_pool_found: data.same_pool_found === true,
    error: data.code || result?.error || null
  };
}

async function main() {
  let host = 'invalid-url';
  try { host = new URL(baseUrl).host; } catch { /* Report invalid base without echoing environment value. */ }
  const [ready, snapshot] = await Promise.all([request('/api/ready'), request('/api/snapshot')]);
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
      ...summarizeSnapshot(snapshot.data)
    }
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  const newsHealth = snapshot.data && snapshot.data.health && snapshot.data.health.news;
  const newsHealthy = !!(newsHealth && newsHealth.ok === true && Array.isArray(snapshot.data.news) && snapshot.data.news.length > 0
    && Array.isArray(snapshot.data.health.news_sources) && snapshot.data.health.news_sources.some((source) => source.ok === true));
  if (ready.http !== 200 || snapshot.http !== 200 || !newsHealthy) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { summarizeSnapshot, summarizeDerivatives, summarizeDex };
