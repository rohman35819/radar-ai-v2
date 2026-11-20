'use strict';
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// FDV: null jika tidak diketahui (bug V2: price*null = 0).
function fdv(c) {
  const f = num(c.fully_diluted_valuation);
  if (f !== null) return f;
  const p = num(c.current_price), m = num(c.max_supply);
  return p !== null && m !== null && m > 0 ? p * m : null;
}

function screen(coins, o = {}) {
  const { minMcap = 1e6, maxMcap = 1e8, minVolume = 5e4, now = Date.now(), staleMs = 3600000 } = o;
  const out = [];
  for (const c of Array.isArray(coins) ? coins : []) {
    if (!c || typeof c.id !== 'string') continue;
    const mc = num(c.market_cap);
    if (mc === null || mc < minMcap || mc >= maxMcap) continue;
    const vol = num(c.total_volume) || 0;
    if (vol < minVolume) continue;
    const f = fdv(c);
    const lu = Date.parse(c.last_updated);
    const flags = [];
    if (f === null) flags.push('fdv_unknown');
    else if (f / mc > 5) flags.push('fdv_gt_5x_mcap');
    if (vol / mc > 1) flags.push('volume_gt_mcap');
    if (!Number.isFinite(lu) || now - lu > staleMs) flags.push('stale');
    out.push({
      id: c.id, symbol: String(c.symbol || '').toUpperCase(), name: String(c.name || c.id),
      price: num(c.current_price), market_cap: mc, volume_24h: vol, fdv: f,
      vol_mcap: vol / mc, fdv_mcap: f === null ? null : f / mc,
      change_24h: num(c.price_change_percentage_24h),
      change_7d: num(c.price_change_percentage_7d_in_currency),
      circulating_supply: num(c.circulating_supply), max_supply: num(c.max_supply),
      source_updated_at: Number.isFinite(lu) ? new Date(lu).toISOString() : null, flags,
    });
  }
  return out.sort((a, b) => b.market_cap - a.market_cap);
}

// Kategori DeFiLlama: cocok persis, bukan substring ("Chain" tidak lagi cocok "ai").
function categoryMatcher(list) {
  const set = new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean));
  return (cat) => typeof cat === 'string' && set.has(cat.trim().toLowerCase());
}

// Gabungkan token CoinGecko dengan DeFiLlama via gecko_id; tidak ada data = null (bukan 0).
function joinFundamentals(tokens, protocols, fees, revenue) {
  const byGecko = new Map();
  for (const p of protocols || []) if (p && p.gecko_id) byGecko.set(p.gecko_id, p);
  const key = (x) => String(x.slug || x.name || '').toLowerCase();
  const feeMap = new Map((fees || []).map((x) => [key(x), x]));
  const revMap = new Map((revenue || []).map((x) => [key(x), x]));
  const out = {};
  for (const t of tokens) {
    const p = byGecko.get(t.id);
    if (!p) continue;
    const k = String(p.slug || p.name || '').toLowerCase();
    const fe = feeMap.get(k), re = revMap.get(k);
    const tvl = num(p.tvl), f30 = fe ? num(fe.total30d) : null;
    out[t.id] = {
      protocol: p.name, slug: p.slug, category: p.category || null,
      tvl, tvl_change_1d: num(p.change_1d), tvl_change_7d: num(p.change_7d),
      fees_24h: fe ? num(fe.total24h) : null, fees_30d: f30,
      revenue_24h: re ? num(re.total24h) : null, revenue_30d: re ? num(re.total30d) : null,
      mcap_tvl: tvl && tvl > 0 ? t.market_cap / tvl : null,
      mcap_fees_annualized: f30 && f30 > 0 ? t.market_cap / (f30 * 12.17) : null,
    };
  }
  return out;
}

module.exports = { screen, fdv, categoryMatcher, joinFundamentals };
