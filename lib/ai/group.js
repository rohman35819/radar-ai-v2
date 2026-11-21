'use strict';

const { analyzeMarket: gemini } = require('./gemini');
const { analyzeMarket: groq, reviewGroup } = require('./groq');
const { analyzeMarket: openrouter } = require('./openrouter');
const { analyzeMarket: openai } = require('./openai');

function compactMarket(snapshot) {
  const tokens = Array.isArray(snapshot?.tokens) ? snapshot.tokens.slice(0, 12) : [];
  return {
    generated_at: new Date().toISOString(),
    data_stale: Boolean(snapshot?.stale),
    tokens: tokens.map((t) => ({
      symbol: t.symbol, price: t.price, change_24h: t.change_24h,
      market_cap: t.market_cap, volume_24h: t.volume_24h,
      vol_mcap: t.vol_mcap, change_7d: t.change_7d,
      vol10m: t.vol10m ? { volume_usdt: t.vol10m.volume_usdt, median_usdt: t.vol10m.median_usdt, x: t.vol10m.x, spike: t.vol10m.spike } : null,
      fundamental: t.fundamental ? { tvl: t.fundamental.tvl, fees_24h: t.fundamental.fees_24h, revenue_24h: t.fundamental.revenue_24h } : null,
      flags: Array.isArray(t.flags) ? t.flags.slice(0, 4) : []
    }))
  };
}

async function runGroup(snapshot, options = {}) {
  const market = compactMarket(snapshot);
  const providers = [
    ['gemini', () => gemini(market, options)],
    ['groq', () => groq(market, options)],
    ['openrouter', () => openrouter(market, options)],
    ['openai', () => openai(market, options)]
  ];
  const settled = await Promise.allSettled(providers.map(([, run]) => run()));
  const analyses = settled.map((r, i) => r.status === 'fulfilled'
    ? r.value : { provider: providers[i][0], error: String(r.reason?.message || r.reason).slice(0, 180) });
  const valid = analyses.filter((a) => !a.error && ['LONG', 'SHORT', 'WAIT'].includes(a.decision));
  let final;
  if (valid.length < 2 || market.data_stale || !market.tokens.length) {
    final = {
      provider: 'radar-orchestrator', decision: 'WAIT', confidence_score: 0, timeframe: 'unknown',
      reasons: ['Kurang dari dua analisis AI yang valid, data basi, atau data pasar kosong.'],
      risks: ['Keputusan otomatis ditahan; periksa status sumber dan API.'],
      missing_data: market.tokens.length ? [] : ['snapshot pasar'],
      summary: 'Belum cukup dasar untuk keputusan grup.'
    };
  } else {
    try {
      final = await reviewGroup(market, valid, options);
      final.provider = 'groq-moderator';
      final.reasons = Array.isArray(final.reasons) ? final.reasons : [];
      final.risks = Array.isArray(final.risks) ? final.risks : [];
      final.missing_data = Array.isArray(final.missing_data) ? final.missing_data : [];
    } catch (e) {
      final = {
        provider: 'radar-orchestrator', decision: 'WAIT', confidence_score: 0, timeframe: 'unknown',
        reasons: ['Moderator gagal menyelesaikan diskusi: ' + String(e.message || e).slice(0, 120)],
        risks: ['Tidak ada keputusan arah tanpa moderator.'], missing_data: [],
        summary: 'Diskusi belum menghasilkan keputusan akhir.'
      };
    }
  }
  return {
    id: 'radar-' + Date.now(),
    created_at: new Date().toISOString(),
    status: valid.length >= 2 && !market.data_stale ? 'completed' : 'insufficient_data',
    market_summary: { token_count: market.tokens.length, stale: market.data_stale },
    analyses, final
  };
}

module.exports = { runGroup, compactMarket };
