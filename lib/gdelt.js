'use strict';

const ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const CACHE_TTL_MS = 15 * 60 * 1000;
const MIN_INTERVAL_MS = 5000;
const TIMEOUT_MS = 12000;
const MAX_RECORDS = 50;
const QUERY = '("bitcoin" OR "ethereum" OR "crypto" OR "cryptocurrency" OR "stablecoin" OR "spot ETF" OR "exchange hack" OR "crypto regulation")';

function codedError(code, status = 502) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function parseSeenDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return null;
  const iso = match.slice(1).join('').replace(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
    '$1-$2-$3T$4:$5:$6Z'
  );
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeArticle(article) {
  if (!article || typeof article !== 'object') return null;
  const title = String(article.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  let url;
  try {
    const parsed = new URL(String(article.url || ''));
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    url = parsed.toString();
  } catch { return null; }
  if (!title) return null;
  let domain = String(article.domain || '');
  if (!domain || domain.length > 160) domain = new URL(url).hostname;
  return {
    title,
    url,
    domain,
    published_at: parseSeenDate(article.seendate),
    language: String(article.language || '').slice(0, 24) || null,
    source_country: String(article.sourcecountry || '').slice(0, 8) || null
  };
}

function normalizeResponse(payload, now = Date.now()) {
  if (!payload || !Array.isArray(payload.articles)) throw codedError('GDELT_INVALID_RESPONSE');
  const unique = new Map();
  for (const article of payload.articles) {
    const item = normalizeArticle(article);
    if (item && !unique.has(item.url)) unique.set(item.url, item);
  }
  const articles = [...unique.values()].sort((a, b) =>
    (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0)
  ).slice(0, MAX_RECORDS);
  return {
    status: 'success',
    provider: 'GDELT DOC 2.0',
    attribution: 'News discovery metadata provided by GDELT Project; original article content remains with its publisher.',
    observed_at: new Date(now).toISOString(),
    article_count: articles.length,
    articles
  };
}

function createGdeltService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let cached = null;
  let inFlight = null;
  let lastRequestAt = 0;

  async function request() {
    const url = new URL(ENDPOINT);
    url.searchParams.set('query', QUERY);
    url.searchParams.set('mode', 'ArtList');
    url.searchParams.set('format', 'json');
    url.searchParams.set('maxrecords', String(MAX_RECORDS));
    url.searchParams.set('timespan', '24h');
    url.searchParams.set('sort', 'DateDesc');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json', 'user-agent': 'RADAR-AI-V2/1.0 (news discovery)' },
        signal: controller.signal,
        redirect: 'error'
      });
      if (!response.ok) throw codedError(response.status === 429 ? 'GDELT_RATE_LIMITED' : 'GDELT_HTTP_' + response.status, response.status === 429 ? 429 : 502);
      const raw = await response.text();
      let payload;
      try { payload = JSON.parse(raw); } catch { throw codedError('GDELT_INVALID_RESPONSE'); }
      return normalizeResponse(payload, now());
    } catch (error) {
      if (error.code) throw error;
      throw codedError(error.name === 'AbortError' ? 'GDELT_TIMEOUT' : 'GDELT_NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }

  async function snapshot({ force = false } = {}) {
    if (!force && cached && cached.expiresAt > now()) {
      return { ...cached.payload, cached: true, stale: false };
    }
    if (inFlight) return inFlight;
    const elapsed = now() - lastRequestAt;
    if (lastRequestAt && elapsed < MIN_INTERVAL_MS) {
      if (cached) return { ...cached.payload, cached: true, stale: true, error: 'GDELT_COOLDOWN' };
      throw codedError('GDELT_COOLDOWN', 429);
    }
    lastRequestAt = now();
    const promise = request().then((payload) => {
      cached = { payload, expiresAt: now() + CACHE_TTL_MS };
      return { ...payload, cached: false, stale: false };
    }).catch((error) => {
      if (cached) return { ...cached.payload, cached: true, stale: true, error: error.code || 'GDELT_UPSTREAM_ERROR' };
      throw error;
    }).finally(() => { inFlight = null; });
    inFlight = promise;
    return promise;
  }

  return { snapshot, clearCache: () => { cached = null; lastRequestAt = 0; } };
}

module.exports = {
  createGdeltService, normalizeResponse, normalizeArticle, parseSeenDate,
  ENDPOINT, QUERY, CACHE_TTL_MS, MIN_INTERVAL_MS, MAX_RECORDS, TIMEOUT_MS
};
