'use strict';

const BASE = 'https://fapi.binance.com';
const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CANDIDATES = 8;
const SYMBOL_RE = /^[A-Z0-9]{2,15}USDT$/;

function fail(code, status = 502) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}
function finite(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }
function median(values) {
  const sorted = values.filter(finite).map(Number).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const alpha = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i++) value = values[i] * alpha + value * (1 - alpha);
  return value;
}
function indicators(candles) {
  const closes = candles.map((c) => Number(c.close));
  const trs = [];
  const gains = [], losses = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i], previous = candles[i - 1];
    trs.push(Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close)));
    const change = current.close - previous.close;
    gains.push(Math.max(0, change));
    losses.push(Math.max(0, -change));
  }
  const atr = trs.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, trs.length);
  const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, gains.length);
  const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, losses.length);
  const rsi = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - (100 / (1 + avgGain / avgLoss));
  const volumes = candles.map((c) => c.volume);
  const baseline = median(volumes.slice(-25, -5));
  const recent = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volumeRatio = baseline > 0 ? recent / baseline : null;
  const momentum24hPct = (closes[closes.length - 1] / closes[closes.length - 25] - 1) * 100;
  const momentum7dPct = (closes[closes.length - 1] / closes[closes.length - 169] - 1) * 100;
  const ema20 = ema(closes.slice(-60), 20);
  const ema20Prior = ema(closes.slice(-65, -5), 20);
  const ema50 = ema(closes.slice(-60), 50);
  return { lastClose: closes[closes.length - 1], atr, atrPct: atr / closes[closes.length - 1] * 100, rsi, ema20, ema20Prior, ema50, volumeRatio, momentum24hPct, momentum7dPct };
}
function analyzeCandidate(coin, symbol, markPrice, rawCandles, now = Date.now()) {
  if (!Array.isArray(rawCandles)) return null;
  const candles = rawCandles.filter((row) => Array.isArray(row) && row.length >= 7).map((row) => ({
    closeTime: Number(row[6]), high: Number(row[2]), low: Number(row[3]),
    close: Number(row[4]), volume: Number(row[5])
  })).filter((c) => [c.closeTime, c.high, c.low, c.close, c.volume].every(Number.isFinite) && c.closeTime <= now && c.close > 0 && c.high >= c.low);
  if (candles.length < 169 || !finite(markPrice) || Number(markPrice) <= 0) return null;
  const m = indicators(candles);
  if (![m.lastClose, m.atr, m.atrPct, m.rsi, m.ema20, m.ema20Prior, m.ema50, m.volumeRatio, m.momentum24hPct, m.momentum7dPct].every(finite) || m.atr <= 0) return null;
  const mark = Number(markPrice);
  if (Math.abs(mark - m.lastClose) / m.atr > 1.5 || m.atrPct < 0.15 || m.atrPct > 6) return null;
  const trend = m.lastClose > m.ema20 && m.ema20 > m.ema50;
  const rising = m.ema20 > m.ema20Prior;
  const score = Math.min(100,
    (trend ? 35 : 0) + (rising ? 10 : 0) +
    (m.rsi >= 50 && m.rsi <= 68 ? 15 : m.rsi >= 45 && m.rsi < 50 ? 5 : 0) +
    (m.volumeRatio >= 1.5 ? 20 : m.volumeRatio >= 1.1 ? 10 : 0) +
    (m.momentum24hPct > 0 ? 10 : 0) +
    (m.momentum7dPct > 0 ? 10 : 0)
  );
  if (!trend || !rising || m.rsi < 48 || m.rsi > 70 || m.volumeRatio < 1.1 || m.momentum24hPct <= 0 || m.momentum7dPct <= 0 || score < 65) return null;
  const risk = m.atr * 1.5;
  const entry = mark;
  const stopLoss = entry - risk;
  if (stopLoss <= 0) return null;
  return {
    symbol, coin_id: String(coin.id || '').slice(0, 80), name: String(coin.name || symbol).slice(0, 80),
    direction: 'LONG', status: 'SETUP', timeframe: '1H',
    entry, stop_loss: stopLoss, tp1: entry + risk, tp2: entry + risk * 2, tp3: entry + risk * 3,
    risk_percent: risk / entry * 100, score, score_type: 'indicator_confluence',
    indicators: { rsi_14: m.rsi, atr_14: m.atr, atr_percent: m.atrPct, ema_20: m.ema20, ema_50: m.ema50, volume_ratio_5_vs_20: m.volumeRatio, momentum_24h_pct: m.momentum24hPct, momentum_7d_pct: m.momentum7dPct },
    reference_price: mark, last_closed_candle: new Date(candles[candles.length - 1].closeTime).toISOString(),
    observed_at: new Date(now).toISOString(), expires_at: new Date(now + CACHE_TTL_MS).toISOString(),
    mapping: 'unique CoinGecko ticker ↔ Binance USDT perpetual base asset',
    notes: ['Entry adalah harga mark referensi, bukan order atau jaminan fill.', 'Pair dipetakan dari ticker unik, bukan verifikasi contract address.', 'Setup LONG berbasis candle 1 jam yang sudah ditutup; konfirmasi ulang sebelum mengambil keputusan.']
  };
}
function createTradeSetupService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let cached = null, inFlight = null, exchangeInfoCache = null;
  async function request(path, params = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const url = BASE + path + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '');
      const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw fail(response.status === 429 ? 'BINANCE_FUTURES_RATE_LIMITED' : 'BINANCE_FUTURES_HTTP_ERROR', response.status === 429 ? 429 : 502);
      return await response.json();
    } catch (error) {
      if (error.code) throw error;
      throw fail(error.name === 'AbortError' ? 'BINANCE_FUTURES_TIMEOUT' : 'BINANCE_FUTURES_NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  async function exchangeInfo() {
    if (exchangeInfoCache && exchangeInfoCache.expiresAt > now()) return exchangeInfoCache.data;
    const payload = await request('/fapi/v1/exchangeInfo');
    if (!Array.isArray(payload?.symbols)) throw fail('BINANCE_FUTURES_INVALID_RESPONSE');
    const eligible = payload.symbols.filter((item) => item.status === 'TRADING' && item.contractType === 'PERPETUAL' && item.quoteAsset === 'USDT' && /^[A-Z0-9]{1,15}$/.test(item.baseAsset));
    exchangeInfoCache = { data: eligible, expiresAt: now() + 60 * 60 * 1000 };
    return eligible;
  }
  async function scan(markets) {
    if (cached && cached.expiresAt > now()) return { ...cached.payload, cached: true };
    if (inFlight) return inFlight;
    const work = (async () => {
      if (!Array.isArray(markets)) throw fail('TRADE_SETUP_MARKET_DATA_UNAVAILABLE', 503);
      const eligible = await exchangeInfo();
      const byBase = new Map();
      eligible.forEach((item) => byBase.set(item.baseAsset, (byBase.get(item.baseAsset) || 0) + 1));
      const seen = new Set();
      const candidates = markets.filter((coin) => {
        const symbol = String(coin?.symbol || '').toUpperCase();
        if (!symbol || seen.has(symbol) || byBase.get(symbol) !== 1 || !SYMBOL_RE.test(symbol + 'USDT')) return false;
        seen.add(symbol);
        return true;
      }).sort((a, b) => (Number(a.market_cap_rank) || 99999) - (Number(b.market_cap_rank) || 99999)).slice(0, 30).slice(0, MAX_CANDIDATES);
      if (!candidates.length) return { status: 'no_setup', provider: 'Binance USDⓈ-M Futures', observed_at: new Date(now()).toISOString(), candidates_checked: 0, setup: null, reason: 'Tidak ada ticker unik pada daftar market yang cocok dengan kontrak USDT perpetual aktif.' };
      const prices = await request('/fapi/v1/premiumIndex');
      if (!Array.isArray(prices)) throw fail('BINANCE_FUTURES_INVALID_RESPONSE');
      const priceMap = new Map(prices.filter((p) => p && finite(p.markPrice)).map((p) => [p.symbol, Number(p.markPrice)]));
      const results = await Promise.allSettled(candidates.map(async (coin) => {
        const symbol = String(coin.symbol).toUpperCase() + 'USDT';
        const mark = priceMap.get(symbol);
        if (!mark) return null;
        const rows = await request('/fapi/v1/klines', { symbol, interval: '1h', limit: '200' });
        return analyzeCandidate(coin, symbol, mark, rows, now());
      }));
      const setups = results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value).sort((a, b) => b.score - a.score);
      const payload = {
        status: setups.length ? 'success' : 'no_setup', provider: 'Binance USDⓈ-M Futures public market data',
        observed_at: new Date(now()).toISOString(), timeframe: '1H', candidates_checked: candidates.length,
        candidates_failed: results.filter((r) => r.status === 'rejected').length,
        setup: setups[0] || null,
        reason: setups.length ? null : 'Belum ada kandidat yang memenuhi filter trend, RSI, ATR, dan volume. Scanner tidak memaksakan sinyal.'
      };
      cached = { payload, expiresAt: now() + CACHE_TTL_MS };
      return payload;
    })();
    inFlight = work.finally(() => { inFlight = null; });
    return inFlight;
  }
  return { scan, clearCache: () => { cached = null; exchangeInfoCache = null; } };
}
module.exports = { createTradeSetupService, analyzeCandidate, indicators, median, ema, CACHE_TTL_MS, MAX_CANDIDATES };
