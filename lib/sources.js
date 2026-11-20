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

// ---- RSS/Atom minimal; semua teks dibersihkan (bukan HTML) ----
const ent = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
const clean = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
  .replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ent[m]).replace(/\s+/g, ' ').trim();
function parseFeed(xml, source) {
  const items = [];
  const blocks = String(xml).match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) || [];
  for (const b of blocks) {
    const tag = (n) => { const m = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i')); return m ? clean(m[1]) : ''; };
    let link = tag('link');
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ''; }
    if (!/^https?:\/\//i.test(link)) continue;
    const d = Date.parse(tag('pubDate') || tag('published') || tag('updated'));
    items.push({ title: tag('title').slice(0, 300), link, source, published_at: Number.isFinite(d) ? new Date(d).toISOString() : null,
      summary: (tag('description') || tag('summary')).slice(0, 400) });
  }
  return items.filter((i) => i.title);
}
async function fetchNews(cfg) {
  const res = await Promise.allSettled(cfg.feeds.map(async (u) => parseFeed(await getText(u), new URL(u).hostname)));
  const items = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const errors = res.filter((r) => r.status === 'rejected').map((r) => String(r.reason.message || r.reason));
  if (!items.length && errors.length) throw new Error(errors.join('; '));
  items.sort((a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0));
  return items.slice(0, 60);
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
module.exports = { fetchExchange, fetchAiCoins, fetchLlama, fetchNews, fetchUnlocks, parseFeed, validUnlocks };
