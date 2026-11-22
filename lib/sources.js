'use strict';
const fs = require('fs');
const path = require('path');

async function getJson(url, { headers = {}, timeout = 15000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} dari ${new URL(url).host}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function getText(url, timeout = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'radar-ai/2.1' }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} dari ${new URL(url).host}`);
    return await r.text();
  } finally { clearTimeout(t); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Paginasi penuh kategori AI (bug V2: hanya 50 teratas sebelum filter).
async function fetchAiCoins(cfg) {
  const headers = cfg.cgKey ? { 'x-cg-demo-api-key': cfg.cgKey } : {};
  const all = [];
  for (let page = 1; page <= cfg.maxPages; page++) {
    const q = new URLSearchParams({ vs_currency: 'usd', category: 'artificial-intelligence', order: 'market_cap_desc',
      per_page: '250', page: String(page), sparkline: 'false', price_change_percentage: '7d' });
    const rows = await getJson(`https://api.coingecko.com/api/v3/coins/markets?${q}`, { headers });
    if (!Array.isArray(rows) || (rows.length && !rows.every((r) => r && typeof r.id === 'string' && 'market_cap' in r && 'total_volume' in r))) throw new Error('Format respons CoinGecko tidak valid');
    all.push(...rows);
    if (rows.length < 250) break;
    await sleep(cfg.pageDelayMs);
  }
  return all;
}
async function fetchLlama(cfg, isCat) {
  const protos = await getJson('https://api.llama.fi/protocols', { timeout: 30000 });
  const q = 'excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true';
  const [fees, rev] = await Promise.all([
    getJson(`https://api.llama.fi/overview/fees?${q}`, { timeout: 30000 }),
    getJson(`https://api.llama.fi/overview/fees?${q}&dataType=dailyRevenue`, { timeout: 30000 }),
  ]);
  if (!Array.isArray(protos) || !Array.isArray(fees.protocols)) throw new Error('Format respons DeFiLlama tidak valid');
  return { protocols: (Array.isArray(protos) ? protos : []).filter((p) => isCat(p.category) || p.gecko_id),
    fees: fees.protocols || [], revenue: rev.protocols || [] };
}

// ---- RSS/Atom parsing and bounded feed diagnostics ----
function newsError(code, host = 'unknown') {
  const error = new Error(host && host !== 'unknown' ? code + ' (' + host + ')' : code);
  error.code = code;
  return error;
}
function feedHost(value) {
  try { return new URL(value).hostname.slice(0, 120); } catch { return 'invalid-url'; }
}
async function getText(url, timeout = 15000) {
  let parsed;
  try { parsed = new URL(url); } catch { throw newsError('INVALID_FEED_URL'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw newsError('INVALID_FEED_URL', parsed.hostname);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        'user-agent': 'RADAR-AI/2.4 (+https://github.com/rohman35819/radar-ai-v2)',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      },
      signal: ac.signal
    });
    if (!response.ok) throw newsError('HTTP_' + response.status, parsed.hostname);
    const declaredSize = Number(response.headers && response.headers.get('content-length') || 0);
    if (declaredSize > 2 * 1024 * 1024) throw newsError('FEED_TOO_LARGE', parsed.hostname);
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > 2 * 1024 * 1024) throw newsError('FEED_TOO_LARGE', parsed.hostname);
    if (!/<(?:rss|feed|rdf:RDF)\b/i.test(body)) throw newsError('INVALID_FEED_BODY', parsed.hostname);
    return body;
  } catch (error) {
    if (error.code) throw error;
    if (error.name === 'AbortError') throw newsError('FEED_TIMEOUT', parsed.hostname);
    throw newsError('FEED_FETCH_FAILED', parsed.hostname);
  } finally { clearTimeout(timer); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Paginasi penuh kategori AI (bug V2: hanya 50 teratas sebelum filter).
async function fetchAiCoins(cfg) {
  const headers = cfg.cgKey ? { 'x-cg-demo-api-key': cfg.cgKey } : {};
  const all = [];
  for (let page = 1; page <= cfg.maxPages; page++) {
    const q = new URLSearchParams({ vs_currency: 'usd', category: 'artificial-intelligence', order: 'market_cap_desc',
      per_page: '250', page: String(page), sparkline: 'false', price_change_percentage: '7d' });
    const rows = await getJson('https://api.coingecko.com/api/v3/coins/markets?' + q, { headers });
    if (!Array.isArray(rows) || (rows.length && !rows.every((row) => row && typeof row.id === 'string' && 'market_cap' in row && 'total_volume' in row))) throw new Error('Format respons CoinGecko tidak valid');
    all.push(...rows);
    if (rows.length < 250) break;
    await sleep(cfg.pageDelayMs);
  }
  return all;
}
async function fetchLlama(cfg, isCat) {
  const protos = await getJson('https://api.llama.fi/protocols', { timeout: 30000 });
  const query = 'excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true';
  const [fees, revenue] = await Promise.all([
    getJson('https://api.llama.fi/overview/fees?' + query, { timeout: 30000 }),
    getJson('https://api.llama.fi/overview/fees?' + query + '&dataType=dailyRevenue', { timeout: 30000 })
  ]);
  if (!Array.isArray(protos) || !Array.isArray(fees.protocols)) throw new Error('Format respons DeFiLlama tidak valid');
  return { protocols: protos.filter((protocol) => isCat(protocol.category) || protocol.gecko_id),
    fees: fees.protocols || [], revenue: revenue.protocols || [] };
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&#(\d+);/g, (_, digits) => {
      const codePoint = Number(digits);
      return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (match) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" })[match])
    .replace(/&nbsp;/gi, ' ');
}
const clean = (value) => decodeXmlEntities(String(value || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]*>/g, ' '))
  .replace(/\s+/g, ' ').trim();

function parseFeed(xml, source, baseUrl = '') {
  const items = [];
  const blocks = String(xml).match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const tag = (name) => {
      const match = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>', 'i'));
      return match ? clean(match[1]) : '';
    };
    const linkNodes = [...block.matchAll(/<link\b([^>]*)\/?\s*>/gi)].map((match) => match[1] || '');
    const preferred = linkNodes.find((attrs) => /\brel=['"]alternate['"]/i.test(attrs))
      || linkNodes.find((attrs) => !/\brel=/i.test(attrs));
    const href = preferred && preferred.match(/\bhref=['"]([^'"]+)['"]/i);
    let link = (href && href[1]) || tag('link') || tag('guid');
    if (link) {
      try {
        const resolved = new URL(link, baseUrl || (source ? 'https://' + source + '/' : undefined));
        link = ['http:', 'https:'].includes(resolved.protocol) ? resolved.toString() : '';
      } catch { link = ''; }
    }
    if (!link) continue;
    const published = tag('pubDate') || tag('published') || tag('updated') || tag('dc:date');
    const date = Date.parse(published);
    const summary = tag('description') || tag('summary') || tag('content:encoded') || tag('content');
    const title = tag('title').slice(0, 300);
    if (!title) continue;
    items.push({ title, link, source, published_at: Number.isFinite(date) ? new Date(date).toISOString() : null,
      summary: summary.slice(0, 400) });
  }
  return items;
}

function newsErrorCode(error) {
  if (error && error.code && /^[A-Z0-9_]+$/.test(error.code)) return error.code;
  if (error && error.name === 'AbortError') return 'FEED_TIMEOUT';
  const match = String(error && error.message || '').match(/HTTP[_ ](\d{3})/i);
  return match ? 'HTTP_' + match[1] : 'FEED_FETCH_FAILED';
}
async function fetchNewsDetailed(cfg) {
  const feeds = Array.isArray(cfg.feeds) ? cfg.feeds : [];
  if (!feeds.length) throw newsError('NEWS_FEEDS_EMPTY');
  const results = await Promise.allSettled(feeds.map(async (url) => {
    const host = feedHost(url);
    const xml = await getText(url);
    const items = parseFeed(xml, host, url);
    return { host, items };
  }));
  const sources = results.map((result, index) => result.status === 'fulfilled'
    ? { host: result.value.host, ok: true, count: result.value.items.length }
    : { host: feedHost(feeds[index]), ok: false, error: newsErrorCode(result.reason) });
  const items = results.flatMap((result) => result.status === 'fulfilled' ? result.value.items : []);
  const unique = [...new Map(items.map((item) => [item.link, item])).values()];
  unique.sort((a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0));
  if (!sources.some((source) => source.ok)) {
    const error = newsError('NEWS_FEEDS_UNAVAILABLE');
    error.sources = sources;
    throw error;
  }
  if (!unique.length) {
    const error = newsError('NEWS_FEEDS_NO_ARTICLES');
    error.sources = sources;
    throw error;
  }
  return { items: unique.slice(0, 60), sources };
}
async function fetchNews(cfg) {
  return (await fetchNewsDetailed(cfg)).items;
}

// Token unlock: tidak ada sumber gratis yang saya verifikasi. Hanya file manual / URL milik Anda, divalidasi ketat.
function validUnlocks(arr) {
  if (!Array.isArray(arr)) throw new Error('unlocks harus array');
  return arr.filter((u) => u && typeof u.id === 'string' && Number.isFinite(Date.parse(u.date)))
    .map((u) => ({ id: u.id, symbol: String(u.symbol || '').toUpperCase(), date: new Date(u.date).toISOString(),
      amount_usd: Number.isFinite(u.amount_usd) ? u.amount_usd : null, pct_supply: Number.isFinite(u.pct_supply) ? u.pct_supply : null,
      source: String(u.source || 'manual').slice(0, 80) }));
}
async function fetchUnlocks(cfg) {
  if (cfg.unlocksUrl) return validUnlocks(await getJson(cfg.unlocksUrl));
  const f = path.join(cfg.dataDir, 'unlocks.json');
  return fs.existsSync(f) ? validUnlocks(JSON.parse(fs.readFileSync(f, 'utf8'))) : [];
}

const { fetchExchange } = require('./exchange');
module.exports = { fetchExchange, fetchAiCoins, fetchLlama, fetchNews, fetchNewsDetailed, fetchUnlocks, parseFeed, validUnlocks };
