'use strict';
// Analitik TOP 5 murni: tidak mengakses DOM/jaringan, dapat diuji di Node dan dipakai browser.
// Semua angka berasal dari data yang diberikan. Bila data kurang, status NOT_ENOUGH_DATA.
(function (global) {
  const num = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const validId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
  const ageMs = (timestamp, now) => {
    if (!timestamp) return null;
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? now - parsed : null;
  };
  const priceSeries = (prices) => (Array.isArray(prices) ? prices : [])
    .filter((point) => Array.isArray(point) && Number.isFinite(Number(point[1])))
    .map((point) => Number(point[1]));

  function sma(values, period) {
    if (!Array.isArray(values) || values.length < period) return null;
    const slice = values.slice(-period);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  }
  function ema(values, period) {
    if (!Array.isArray(values) || values.length < period) return null;
    const k = 2 / (period + 1);
    let result = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    for (let i = period; i < values.length; i++) result = values[i] * k + result * (1 - k);
    return result;
  }
  function rsi(values, period = 14) {
    if (!Array.isArray(values) || values.length <= period) return null;
    const slice = values.slice(-(period + 1));
    let gains = 0, losses = 0;
    for (let i = 1; i < slice.length; i++) {
      const delta = slice[i] - slice[i - 1];
      if (delta > 0) gains += delta; else losses -= delta;
    }
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return clamp(100 - 100 / (1 + rs), 0, 100);
  }

  // Skor transparan dari field yang benar-benar ada. Bukan probabilitas keuntungan.
  function rankTop5(tokens, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : 15 * 60 * 1000;
    const scored = (Array.isArray(tokens) ? tokens : []).filter((item) => item && typeof item === 'object').map((token) => {
      const price = num(token.price);
      const cap = num(token.market_cap);
      const volume = num(token.volume_24h);
      const change = num(token.change_24h);
      const liquidity = num(token.liquidity_usd);
      const identity = validId(token.id);
      const timestamp = token.source_updated_at || token.observed_at || token.last_ok || null;
      const age = ageMs(timestamp, now);
      const fresh = age !== null && age >= 0 && age <= maxAgeMs;
      const available = [price, cap, volume, change, identity ? 1 : null].filter((value) => value !== null).length;
      const completeness = available / 5;
      const momentum = clamp((change === null ? 0 : change) / 20, -1, 1);
      const turnover = cap > 0 && volume !== null ? clamp(volume / cap, 0, 1) : 0;
      const liquidityScore = liquidity === null ? null : clamp(liquidity / 100000, 0, 1);
      const breakdown = {
        momentum: Number((20 * (momentum + 1) / 2).toFixed(2)),
        volume_to_mcap: Number((25 * turnover).toFixed(2)),
        liquidity: liquidityScore === null ? null : Number((15 * liquidityScore).toFixed(2)),
        freshness: fresh ? 10 : 0,
        completeness: Number((10 * completeness).toFixed(2)),
      };
      let score = breakdown.momentum + breakdown.volume_to_mcap + (breakdown.liquidity || 0) + breakdown.freshness + breakdown.completeness;
      const notEnoughData = price === null || change === null || !identity || !fresh;
      if (!fresh) score = Math.min(score, 45);
      score = Number(clamp(score, 0, 100).toFixed(2));
      const signal = notEnoughData ? 'WAIT' : (score >= 62 && change > 0 ? 'BUY SETUP' : score >= 45 ? 'WAIT' : 'AVOID');
      // Confidence mengukur kelengkapan/kesegaran data, bukan peluang profit.
      const confidence = Math.round(clamp(completeness * 65 + (fresh ? 25 : 0) + (liquidityScore !== null ? 10 : 0), 0, 100));
      const riskLevel = !fresh ? 'EXTREME' : completeness < 0.6 ? 'HIGH' : liquidityScore !== null && liquidityScore < 0.3 ? 'HIGH' : 'MEDIUM';
      const reasons = [];
      if (change !== null) reasons.push('Perubahan 24 jam ' + change.toFixed(2) + '% (data aktual).');
      if (volume !== null && cap > 0) reasons.push('Volume/market cap ' + (volume / cap).toFixed(3) + 'x.');
      if (liquidity !== null) reasons.push('Likuiditas ' + liquidity.toLocaleString('en-US') + ' USD.');
      if (!fresh) reasons.push('Data tidak segar atau timestamp tidak tersedia.');
      if (!identity) reasons.push('Identitas aset tidak tervalidasi.');
      return {
        id: identity ? token.id : null, symbol: String(token.symbol || '—').toUpperCase(),
        name: String(token.name || token.id || '—'), price, market_cap: cap, volume_24h: volume,
        fdv: num(token.fdv),
        contract_address: token.contract_address || token.token_address || null,
        chain: token.chain || token.network_id || null,
        change_24h: change, liquidity_usd: liquidity, timestamp, age_ms: age, fresh,
        score, breakdown, signal, confidence, risk_level: riskLevel, not_enough_data: notEnoughData, reasons,
      };
    });
    scored.sort((a, b) => b.score - a.score || String(a.symbol).localeCompare(String(b.symbol)));
    return scored.slice(0, 5).map((item, index) => ({ ...item, rank: index + 1 }));
  }

  // Rencana mekanis dari volatilitas historis yang teramati. Bukan prediksi dan bukan order.
  function buildTradePlan(input = {}) {
    const price = num(input.price);
    if (price === null || price <= 0) return { status: 'NOT_ENOUGH_DATA', reason: 'Harga actual tidak tersedia.' };
    const series = priceSeries(input.prices);
    if (series.length < 12) return { status: 'NOT_ENOUGH_DATA', reason: 'Histori harga kurang dari 12 titik.' };
    const recent = series.slice(-12);
    const returns = [];
    for (let i = 1; i < recent.length; i++) {
      if (recent[i - 1] > 0) returns.push((recent[i] - recent[i - 1]) / recent[i - 1]);
    }
    if (returns.length < 8) return { status: 'NOT_ENOUGH_DATA', reason: 'Sampel return tidak cukup.' };
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
    const deviation = Math.sqrt(variance);
    if (!(deviation > 0)) return { status: 'NOT_ENOUGH_DATA', reason: 'Volatilitas historis tidak terukur.' };
    const observedMove = deviation * price; // USD, dari return histori nyata
    const support = Math.min(...recent), resistance = Math.max(...recent);
    const entry = clamp(price, Math.min(support, price), Math.max(resistance, price));
    const buyLow = Math.max(0.00000001, entry - observedMove * 0.25);
    const buyHigh = Math.max(buyLow, entry + observedMove * 0.25);
    const takeProfits = [1, 2, 3].map((multiple) => Number((entry + observedMove * multiple).toFixed(8)));
    const stopLoss = Math.max(0.00000001, entry - observedMove * 1.5);
    const reward = takeProfits[1] - entry;
    const risk = entry - stopLoss;
    return {
      status: 'MECHANICAL_PLAN',
      method: 'Entry dibatasi pada rentang harga histori teramati; TP/SL = 1x/2x/3x dan 1.5x volatilitas standar return 12 titik terakhir.',
      observed_move_usd: Number(observedMove.toFixed(8)),
      support: Number(support.toFixed(8)), resistance: Number(resistance.toFixed(8)),
      buy_price: Number(entry.toFixed(8)), buy_zone: [Number(buyLow.toFixed(8)), Number(buyHigh.toFixed(8))],
      tp1: takeProfits[0], tp2: takeProfits[1], tp3: takeProfits[2],
      tp1_pct: Number(((takeProfits[0] / entry - 1) * 100).toFixed(2)),
      tp2_pct: Number(((takeProfits[1] / entry - 1) * 100).toFixed(2)),
      tp3_pct: Number(((takeProfits[2] / entry - 1) * 100).toFixed(2)),
      stop_loss: Number(stopLoss.toFixed(8)),
      stop_loss_pct: Number(((stopLoss / entry - 1) * 100).toFixed(2)),
      risk_reward: Number((reward / risk).toFixed(2)),
      invalidation: 'Harga menutup di bawah support teramati (' + support.toFixed(8) + ') atau data historis menjadi stale.',
      estimation_note: 'Durasi setup tidak diperkirakan karena tidak ada interval waktu yang terverifikasi pada sumber harga.',
      disclaimer: 'Rencana mekanis berdasarkan data historis, bukan prediksi, bukan saran investasi, dan tidak mengirim order.',
    };
  }

  function indicatorSummary(prices) {
    const series = priceSeries(prices);
    const last = series.length ? series[series.length - 1] : null;
    const result = { price: last, sma20: sma(series, 20), ema12: ema(series, 12), ema26: ema(series, 26), rsi14: rsi(series, 14), macd: null, vwap: null };
    if (result.ema12 !== null && result.ema26 !== null) result.macd = result.ema12 - result.ema26;
    for (const key of Object.keys(result)) {
      if (result[key] === null) result[key] = 'NOT ENOUGH DATA';
    }
    result.vwap = 'NOT ENOUGH DATA'; // sumber harga tidak menyertakan volume per candle
    return result;
  }

  const api = { num, clamp, validId, sma, ema, rsi, rankTop5, buildTradePlan, indicatorSummary };
  global.RadarTop5 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
