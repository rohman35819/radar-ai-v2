'use strict';
const $ = (selector) => document.querySelector(selector);
const fmtMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
  if (Math.abs(n) < 0.01 && n !== 0) return '$' + n.toPrecision(4);
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 4 });
};
const fmtPct = (value) => Number.isFinite(Number(value)) ? (Number(value) > 0 ? '+' : '') + Number(value).toFixed(2) + '%' : '—';
const fmtNum = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '—';
const safeText = (value) => String(value ?? '—');
const node = (tag, className, text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};
let market = null;
let chartBusy = false;
let search = '';
let refreshBusy = false;
function changeNode(value) {
  const span = node('span', Number(value) >= 0 ? 'positive' : 'negative', fmtPct(value));
  return span;
}
function globalMetrics() {
  const g = market?.data?.global?.data || {};
  const d = market?.data?.global?.data?.data || {};
  const source = Object.keys(g).length ? g : d;
  const cap = source.total_market_cap?.usd;
  const volume = source.total_volume?.usd;
  const btc = source.market_cap_percentage?.btc;
  const eth = source.market_cap_percentage?.eth;
  const stats = [
    ['TOTAL MARKET CAP', fmtMoney(cap), fmtPct(source.market_cap_change_percentage_24h_usd)],
    ['VOLUME 24 JAM', fmtMoney(volume), 'Global trading volume'],
    ['BTC DOMINANCE', btc == null ? '—' : Number(btc).toFixed(2) + '%', 'Share of total market cap'],
    ['ETH DOMINANCE', eth == null ? '—' : Number(eth).toFixed(2) + '%', 'Share of total market cap'],
    ['CRYPTO / MARKETS', fmtNum(source.active_cryptocurrencies), fmtNum(source.markets) + ' tracked markets']
  ];
  const target = $('#global-stats');
  target.replaceChildren();
  stats.forEach(([label, value, sub], index) => {
    const box = node('article', 'market-stat');
    box.append(node('small', '', label), node('strong', '', value), node('span', index === 0 && Number(source.market_cap_change_percentage_24h_usd) >= 0 ? 'positive' : 'muted', sub));
    target.append(box);
  });
}
function marketRows() {
  const rows = Array.isArray(market?.data?.markets) ? market.data.markets : [];
  const visible = rows.filter((coin) => !search || [coin.name, coin.symbol].some((v) => String(v || '').toLowerCase().includes(search)));
  const tbody = $('#market-table');
  tbody.replaceChildren();
  if (!visible.length) {
    const tr = node('tr'); const td = node('td', 'muted', 'Tidak ada aset yang cocok.'); td.colSpan = 7; tr.append(td); tbody.append(tr);
  }
  visible.forEach((coin) => {
    const tr = node('tr');
    const asset = node('td', 'asset-cell');
    const image = node('span', 'coin-image', safeText(coin.symbol).slice(0, 3).toUpperCase());
    const idr = market?.data?.markets_idr?.find((item) => item.id === coin.id);
    const identity = node('span', 'asset-name');
    identity.append(node('b', '', safeText(coin.name)), node('small', '', safeText(coin.symbol).toUpperCase() + ' · #' + safeText(coin.market_cap_rank)));
    const priceCell = node('td', 'number-cell');
    priceCell.append(node('span', '', fmtMoney(coin.current_price)), node('small', 'idr-price', idr ? 'Rp' + Number(idr.current_price).toLocaleString('id-ID', { maximumFractionDigits: 0 }) : 'IDR —'));
    asset.append(image, identity);
    tr.append(asset);
    tr.append(priceCell);
    tr.append(changeNode(coin.price_change_percentage_1h_in_currency));
    tr.append(changeNode(coin.price_change_percentage_24h));
    tr.append(changeNode(coin.price_change_percentage_7d_in_currency));
    tr.append(node('td', 'number-cell', fmtMoney(coin.market_cap)));
    tr.append(node('td', 'number-cell', fmtMoney(coin.total_volume)));
    tbody.append(tr);
  });
  $('#market-count').textContent = visible.length + ' aset ditampilkan · CoinGecko Top 100';
  const select = $('#chart-coin');
  const current = select.value || 'bitcoin';
  select.replaceChildren();
  visible.slice(0, 100).forEach((coin) => {
    const option = node('option', '', safeText(coin.name) + ' (' + safeText(coin.symbol).toUpperCase() + ')');
    option.value = coin.id;
    select.append(option);
  });
  if ([...select.options].some((option) => option.value === current)) select.value = current;
  else if ([...select.options].some((option) => option.value === 'bitcoin')) select.value = 'bitcoin';
}
function renderCompact(target, rows, renderer, emptyText) {
  target.replaceChildren();
  if (!rows.length) return target.append(node('div', 'muted', emptyText));
  rows.forEach((row, index) => target.append(renderer(row, index)));
}
function renderTrending() {
  const coins = (market?.data?.trending?.coins || []).slice(0, 8);
  renderCompact($('#trending-list'), coins, (entry, index) => {
    const coin = entry.item || {};
    const row = node('div', 'compact-row');
    row.append(node('b', 'rank', String(index + 1).padStart(2, '0')), node('span', 'compact-name', safeText(coin.name) + ' (' + safeText(coin.symbol).toUpperCase() + ')'), node('small', 'muted', coin.market_cap_rank ? '#' + coin.market_cap_rank : 'Trending'));
    return row;
  }, 'Data trending belum tersedia.');
}
function renderMovers() {
  const rows = market?.data?.markets || [];
  const gainers = [...rows].filter((coin) => Number.isFinite(Number(coin.price_change_percentage_24h))).sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 6);
  const losers = [...rows].filter((coin) => Number.isFinite(Number(coin.price_change_percentage_24h))).sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0, 6);
  const draw = (coin) => {
    const row = node('div', 'compact-row');
    row.append(node('b', '', safeText(coin.symbol).toUpperCase()), node('span', 'compact-name', safeText(coin.name)), changeNode(coin.price_change_percentage_24h));
    return row;
  };
  renderCompact($('#gainers'), gainers, draw, 'Data gainers belum tersedia.');
  renderCompact($('#losers'), losers, draw, 'Data losers belum tersedia.');
}
function renderSectors() {
  const rows = [...(market?.data?.categories || [])].filter((item) => item && item.name).sort((a, b) => Number(b.market_cap_change_24h || 0) - Number(a.market_cap_change_24h || 0)).slice(0, 10);
  renderCompact($('#sector-list'), rows, (item) => {
    const row = node('div', 'compact-row');
    row.append(node('b', '', safeText(item.name)), node('span', 'compact-name', 'MCap ' + fmtMoney(item.market_cap)), changeNode(item.market_cap_change_24h));
    return row;
  }, 'Data kategori belum tersedia.');
}
function renderExchanges() {
  const rows = [...(market?.data?.exchanges || [])].sort((a, b) => Number(b.trade_volume_24h_btc || 0) - Number(a.trade_volume_24h_btc || 0)).slice(0, 10);
  renderCompact($('#exchange-list'), rows, (item, index) => {
    const row = node('div', 'compact-row');
    row.append(node('b', 'rank', String(index + 1).padStart(2, '0')), node('span', 'compact-name', safeText(item.name) + (item.country ? ' · ' + item.country : '')), node('small', 'muted', 'Trust ' + safeText(item.trust_score) + ' · ' + fmtNum(item.trade_volume_24h_btc) + ' BTC'));
    return row;
  }, 'Data exchange belum tersedia.');
}
function renderExchangeSelector() {
  const select = $('#exchange-select');
  if (!select) return;
  const rows = market?.data?.exchanges || [];
  const current = select.value || 'binance';
  select.replaceChildren();
  rows.slice(0, 30).forEach((exchange) => {
    const option = node('option', '', safeText(exchange.name));
    option.value = exchange.id;
    select.append(option);
  });
  if ([...select.options].some((option) => option.value === current)) select.value = current;
  else if ([...select.options].some((option) => option.value === 'binance')) select.value = 'binance';
  if (select.value && select.dataset.loaded !== select.value) loadExchangeTickers();
}
async function loadExchangeTickers() {
  const id = $('#exchange-select').value;
  const body = $('#exchange-tickers');
  if (!id || !body) return;
  body.replaceChildren();
  const loading = node('td', 'muted', 'Memuat trading pairs…'); loading.colSpan = 6;
  const row = node('tr'); row.append(loading); body.append(row);
  try {
    const response = await fetch('/api/market-intelligence/exchange-tickers?exchange=' + encodeURIComponent(id), { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') throw new Error(result.message || result.code || 'Ticker unavailable');
    const tickers = (result.data?.tickers || []).slice(0, 20);
    body.replaceChildren();
    tickers.forEach((ticker) => {
      const tr = node('tr');
      tr.append(node('td', '', safeText(ticker.base) + '/' + safeText(ticker.target)));
      tr.append(node('td', '', safeText(ticker.market?.name || ticker.market?.identifier)));
      tr.append(node('td', 'number-cell', fmtMoney(ticker.converted_last?.usd ?? ticker.last)));
      tr.append(node('td', 'number-cell', fmtMoney(ticker.converted_volume?.usd ?? ticker.volume)));
      tr.append(node('td', 'number-cell', ticker.bid_ask_spread_percentage == null ? '—' : Number(ticker.bid_ask_spread_percentage).toFixed(3) + '%'));
      tr.append(node('td', '', safeText(ticker.trust_score || ticker.market?.trust_score || '—')));
      body.append(tr);
    });
    if (!tickers.length) { const tr = node('tr'); const td = node('td', 'muted', 'Tidak ada pair tersedia.'); td.colSpan = 6; tr.append(td); body.append(tr); }
    $('#exchange-ticker-status').textContent = tickers.length + ' pair ditampilkan · diperbarui ' + new Date(result.updated_at).toLocaleString('id-ID') + (result.stale ? ' · DATA CACHE LAMA' : '');
    $('#exchange-select').dataset.loaded = id;
  } catch (error) {
    body.replaceChildren(); const tr = node('tr'); const td = node('td', 'negative', safeText(error.message)); td.colSpan = 6; tr.append(td); body.append(tr);
    $('#exchange-ticker-status').textContent = 'Data pair belum tersedia; periksa kuota dan akses CoinGecko.';
    $('#exchange-select').dataset.loaded = id;
  }
}
function renderMomentum() {
  const rows = (market?.data?.markets || []).map((coin) => ({
    coin,
    h1: Number(coin.price_change_percentage_1h_in_currency),
    h24: Number(coin.price_change_percentage_24h),
    d7: Number(coin.price_change_percentage_7d_in_currency)
  })).filter((item) => Number.isFinite(item.h1) && item.h1 > 0 && Number.isFinite(item.h24) && item.h24 > 0 && Number.isFinite(item.d7) && item.d7 > 0)
    .sort((a, b) => (b.h1 + b.h24 + (Number.isFinite(b.d7) ? b.d7 : 0)) - (a.h1 + a.h24 + (Number.isFinite(a.d7) ? a.d7 : 0))).slice(0, 8);
  renderCompact($('#momentum-list'), rows, (item) => {
    const row = node('div', 'compact-row');
    row.append(node('b', '', safeText(item.coin.symbol).toUpperCase()), node('span', 'compact-name', safeText(item.coin.name)), changeNode(item.h24));
    return row;
  }, 'Belum ada aset dengan momentum positif yang konsisten.');
}
function turnover(coin) {
  const cap = Number(coin.market_cap), volume = Number(coin.total_volume);
  return Number.isFinite(cap) && cap > 0 && Number.isFinite(volume) ? volume / cap * 100 : null;
}
function renderVolumeActivity() {
  const rows = (market?.data?.markets || []).map((coin) => ({ coin, ratio: turnover(coin) })).filter((item) => item.ratio !== null)
    .sort((a, b) => b.ratio - a.ratio).slice(0, 8);
  renderCompact($('#volume-activity'), rows, (item) => {
    const row = node('div', 'compact-row');
    row.append(node('b', '', safeText(item.coin.symbol).toUpperCase()), node('span', 'compact-name', safeText(item.coin.name)), node('small', 'muted', item.ratio.toFixed(2) + '% turnover'));
    return row;
  }, 'Data volume belum tersedia.');
}
function renderRisk() {
  const rows = (market?.data?.markets || []).map((coin) => ({ coin, turnover: turnover(coin), change: Number(coin.price_change_percentage_24h) }))
    .filter((item) => Number.isFinite(item.change) && (item.change <= -10 || (item.change < 0 && item.turnover !== null && item.turnover < 1)))
    .sort((a, b) => a.change - b.change).slice(0, 10);
  renderCompact($('#risk-list'), rows, (item) => {
    const row = node('div', 'compact-row');
    row.append(node('b', '', safeText(item.coin.symbol).toUpperCase()), node('span', 'compact-name', item.change <= -10 ? 'Penurunan 24J besar' : 'Turnover rendah'), changeNode(item.change));
    return row;
  }, 'Tidak ada aset Top 100 yang melewati ambang risiko heuristik saat ini.');
}
function renderSummary() {
  const g = market?.data?.global?.data || {};
  const rows = market?.data?.markets || [];
  const positive = rows.filter((coin) => Number(coin.price_change_percentage_24h) > 0).length;
  const breadth = rows.length ? positive / rows.length : 0;
  const capChange = Number(g.market_cap_change_percentage_24h_usd);
  const btcDominance = Number(g.market_cap_percentage?.btc);
  const btc = rows.find((coin) => coin.id === 'bitcoin');
  const categories = [...(market?.data?.categories || [])].sort((a, b) => Number(b.market_cap_change_24h || 0) - Number(a.market_cap_change_24h || 0));
  const sector = categories[0];
  const regime = Number.isFinite(capChange) && capChange > 1 && breadth > .58 ? 'BULLISH' : Number.isFinite(capChange) && capChange < -1 && breadth < .42 ? 'BEARISH' : 'MIXED / SIDEWAYS';
  const target = $('#market-summary');
  target.replaceChildren(node('div', 'regime-value ' + (regime === 'BULLISH' ? 'positive' : regime === 'BEARISH' ? 'negative' : 'neutral'), regime));
  const facts = [
    'Market cap 24 jam: ' + fmtPct(capChange),
    'Market breadth: ' + Math.round(breadth * 100) + '% aset Top 100 naik',
    'BTC dominance: ' + (Number.isFinite(btcDominance) ? btcDominance.toFixed(2) + '%' : '—'),
    'BTC 24 jam: ' + fmtPct(btc?.price_change_percentage_24h),
    'Sektor terkuat: ' + (sector?.name || 'Belum tersedia')
  ];
  facts.forEach((fact) => target.append(node('p', 'summary-fact', fact)));
  target.append(node('small', 'muted', 'Heuristik statistik RADAR · bukan hasil model AI atau sinyal trading'));
}
function updateStatus() {
  const sources = market?.sources || {};
  const total = Object.keys(sources).length;
  const ok = Object.values(sources).filter((source) => source.ok).length;
  const stale = Object.values(sources).some((source) => source.stale);
  $('#status').textContent = total && ok === total ? 'Data terhubung' : ok ? 'Data parsial' : 'Sumber gagal';
  $('#side-status').textContent = ok + '/' + total + ' sumber aktif';
  $('#freshness').textContent = stale ? 'DATA SEBAGIAN LAMA' : ok === total ? 'DATA TERHUBUNG' : 'DATA PARSIAL';
  $('#updated').textContent = 'Pembaruan: ' + new Date(market?.updated_at || Date.now()).toLocaleString('id-ID');
  const errors = Object.entries(sources).filter(([, value]) => !value.ok).map(([name, value]) => name + ': ' + (value.error || 'unavailable'));
  $('#notice').hidden = !errors.length;
  $('#notice').textContent = errors.length ? 'Sebagian feed tidak tersedia: ' + errors.join(' · ') + '. Data cache lama dapat ditampilkan.' : '';
}
function drawChart(series) {
  const target = $('#price-chart');
  target.replaceChildren();
  const values = (series || []).filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
  if (values.length < 2) return target.append(node('div', 'muted', 'Data historis belum tersedia untuk rentang ini.'));
  const width = 900, height = 260, pad = 24;
  const nums = values.map((point) => Number(point[1]));
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  const points = values.map((point, index) => {
    const x = pad + index / (values.length - 1) * (width - pad * 2);
    const y = height - pad - (Number(point[1]) - min) / span * (height - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Grafik historis harga USD');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', points);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'currentColor');
  line.setAttribute('stroke-width', '3');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  svg.append(line);
  target.append(svg);
  $('#chart-meta').textContent = 'Terendah ' + fmtMoney(min) + ' · Tertinggi ' + fmtMoney(max) + ' · Terakhir ' + fmtMoney(nums[nums.length - 1]);
}
async function loadChart() {
  if (chartBusy) return;
  const coin = $('#chart-coin').value || 'bitcoin';
  const days = $('#chart-days').value || '7';
  if (!coin) return;
  chartBusy = true;
  $('#price-chart').replaceChildren(node('div', 'muted', 'Memuat histori harga…'));
  try {
    const response = await fetch('/api/market-intelligence/chart?coin=' + encodeURIComponent(coin) + '&days=' + encodeURIComponent(days), { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') throw new Error(result.message || result.code || 'Chart unavailable');
    const metric = $('#chart-metric').value || 'prices';
    drawChart(result.data?.[metric] || []);
    if (result.stale) $('#chart-meta').textContent += ' · DATA CACHE LAMA';
  } catch (error) {
    $('#price-chart').replaceChildren(node('div', 'negative', 'Grafik tidak tersedia: ' + safeText(error.message)));
  } finally { chartBusy = false; }
}
async function loadDerivatives() {
  const symbol = String($('#derivatives-symbol').value || '').trim().toUpperCase();
  const body = $('#derivatives-table');
  const status = $('#derivatives-status');
  if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol)) {
    status.textContent = 'Format pair tidak valid. Contoh: BTCUSDT.';
    return;
  }
  body.replaceChildren();
  const loading = node('td', 'muted', 'Memuat data Binance Futures…'); loading.colSpan = 3;
  const loadingRow = node('tr'); loadingRow.append(loading); body.append(loadingRow);
  try {
    const response = await fetch('/api/market-intelligence/derivatives?symbol=' + encodeURIComponent(symbol), { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') throw new Error(result.message || result.code || 'Derivatives unavailable');
    const funding = result.data?.funding || {};
    const oi = result.data?.open_interest || {};
    const oiHistory = Array.isArray(result.data?.open_interest_history) ? result.data.open_interest_history : [];
    const taker = Array.isArray(result.data?.taker_flow) ? result.data.taker_flow : [];
    const latestOI = oiHistory[oiHistory.length - 1] || {};
    const latestTaker = taker[taker.length - 1] || {};
    const rows = [
      ['Funding rate terakhir', funding.lastFundingRate == null ? null : Number(funding.lastFundingRate) * 100, 'Persentase per periode funding'],
      ['Mark price', funding.markPrice == null ? null : Number(funding.markPrice), 'Harga mark dalam USDT'],
      ['Open interest kontrak', oi.openInterest == null ? null : Number(oi.openInterest), 'Jumlah kontrak; bukan arah long/short'],
      ['Open interest value', latestOI.sumOpenInterestValue == null ? null : Number(latestOI.sumOpenInterestValue), 'Nilai notional USDT dari histori 5 menit'],
      ['Taker buy volume', latestTaker.buyVol == null ? null : Number(latestTaker.buyVol), 'Volume aset dasar · interval 5 menit'],
      ['Taker sell volume', latestTaker.sellVol == null ? null : Number(latestTaker.sellVol), 'Volume aset dasar · interval 5 menit'],
      ['Taker buy/sell ratio', latestTaker.buySellRatio == null ? null : Number(latestTaker.buySellRatio), 'Di atas 1 berarti volume agresor beli lebih besar']
    ];
    body.replaceChildren();
    rows.forEach(([label, value, unit]) => {
      const tr = node('tr');
      tr.append(node('td', '', label), node('td', 'number-cell', value == null || !Number.isFinite(value) ? 'N/A' : label.includes('rate') ? value.toFixed(4) + '%' : label.includes('price') ? fmtMoney(value) : fmtNum(value)), node('td', 'muted', unit));
      body.append(tr);
    });
    const failures = Object.entries(result.sources || {}).filter(([, source]) => !source.ok).map(([name, source]) => name + ': ' + source.error);
    status.textContent = symbol + ' · ' + new Date(result.observed_at).toLocaleString('id-ID') + (result.cached ? ' · cache 5 menit' : '') + (failures.length ? ' · parsial: ' + failures.join(', ') : ' · semua sumber OK');
  } catch (error) {
    body.replaceChildren();
    const tr = node('tr'); const td = node('td', 'negative', safeText(error.message)); td.colSpan = 3; tr.append(td); body.append(tr);
    status.textContent = 'Data derivatives tidak tersedia. Coba lagi setelah cooldown.';
  }
}
async function loadMacro() {
  const body = $('#macro-table');
  const status = $('#macro-status');
  if (!body || !status) return;
  body.replaceChildren();
  const loading = node('td', 'muted', 'Memuat data makro dari BLS, US Treasury, dan New York Fed…'); loading.colSpan = 4;
  const loadingRow = node('tr'); loadingRow.append(loading); body.append(loadingRow);
  try {
    const response = await fetch('/api/market-intelligence/macro', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') throw new Error(result.message || result.code || 'Sumber makro belum tersedia');
    body.replaceChildren();
    (result.series || []).forEach((item) => {
      const latest = item.latest || {};
      const tr = node('tr');
      const value = latest.value == null || !Number.isFinite(Number(latest.value)) ? 'N/A' : Number(latest.value).toLocaleString('en-US', { maximumFractionDigits: 4 }) + (item.units === 'Percent' ? '%' : '');
      tr.append(node('td', '', safeText(item.title)), node('td', 'number-cell', value), node('td', '', safeText(latest.date || '—')), node('td', 'muted', safeText(item.source + ' · ' + item.frequency)));
      body.append(tr);
    });
    if (!(result.series || []).length) { const tr = node('tr'); const td = node('td', 'muted', 'Belum ada observasi makro.'); td.colSpan = 4; tr.append(td); body.append(tr); }
    const failures = Object.entries(result.sources || {}).filter(([, source]) => !source.ok).map(([name]) => name.toUpperCase());
    const stale = (result.series || []).some((item) => item.stale);
    status.textContent = 'BLS · US Treasury · New York Fed · retrieved ' + new Date(result.observed_at).toLocaleString('id-ID') + (result.cached ? ' · cache aktif' : '') + (stale ? ' · memakai data cache lama' : '') + (failures.length ? ' · sumber bermasalah: ' + failures.join(', ') : ' · sumber tersedia');
  } catch (error) {
    body.replaceChildren();
    const tr = node('tr'); const td = node('td', 'negative', safeText(error.message)); td.colSpan = 4; tr.append(td); body.append(tr);
    status.textContent = 'Data makro belum tersedia. Coba lagi setelah cooldown.';
  }
}
async function loadAICouncilSummary() {
  const target = $('#ai-market-summary');
  try {
    const response = await fetch('/api/ai/group', { cache: 'no-store' });
    if (!response.ok) throw new Error('AI Council unavailable');
    const result = await response.json();
    const report = result.group?.last;
    target.replaceChildren();
    if (!report) return target.append(node('div', 'muted', 'Belum ada laporan AI Council tersimpan. Jalankan rapat dari dashboard utama untuk menampilkan ringkasan di sini.'));
    const final = report.final || {};
    target.append(node('div', 'regime-value ' + String(final.decision || 'WAIT').toLowerCase(), safeText(final.decision || 'WAIT')));
    target.append(node('p', 'summary-fact', safeText(final.summary || 'Tidak ada ringkasan AI.')));
    target.append(node('small', 'muted', 'Provider: ' + safeText(final.provider) + ' · ' + new Date(report.created_at).toLocaleString('id-ID') + ' · ' + safeText(report.status)));
    (final.reasons || []).slice(0, 3).forEach((reason) => target.append(node('p', 'summary-fact', '• ' + safeText(reason))));
  } catch {
    target.replaceChildren(node('div', 'muted', 'Laporan AI Council belum dapat dimuat.'));
  }
}
function renderAll() {
  if (!market) return;
  globalMetrics();
  marketRows();
  renderTrending();
  renderMovers();
  renderMomentum();
  renderVolumeActivity();
  renderRisk();
  renderSectors();
  renderExchanges();
  renderSummary();
  renderExchangeSelector();
  loadAICouncilSummary();
  updateStatus();
}
async function loadMarket(force = false) {
  if (refreshBusy) return;
  refreshBusy = true;
  $('#refresh').classList.add('spinning');
  try {
    const response = await fetch('/api/market-intelligence', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok && !result.data) throw new Error(result.message || result.code || 'Gagal mengambil data CoinGecko');
    market = result;
    renderAll();
    if (!$('#chart-coin').options.length) await loadChart();
    if (force) $('#updated').textContent += ' · data memakai cache server 60 menit untuk menjaga kuota Demo';
  } catch (error) {
    $('#status').textContent = 'Gagal menghubungkan';
    $('#side-status').textContent = 'Periksa server';
    $('#notice').hidden = false;
    $('#notice').textContent = 'Market Intelligence belum dapat dimuat: ' + safeText(error.message);
  } finally {
    refreshBusy = false;
    $('#refresh').classList.remove('spinning');
  }
}
function setSidebarOpen(open) {
  const sidebar = $('#sidebar');
  const toggle = $('#menu-toggle');
  sidebar.classList.toggle('open', open);
  document.body.classList.toggle('sidebar-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
}
$('#menu-toggle').addEventListener('click', () => setSidebarOpen(!$('#sidebar').classList.contains('open')));
$('#sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false));
document.querySelectorAll('.side-nav a').forEach((link) => link.addEventListener('click', () => setSidebarOpen(false)));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setSidebarOpen(false); });
window.addEventListener('resize', () => { if (window.innerWidth > 760) setSidebarOpen(false); });
$('#refresh').addEventListener('click', () => loadMarket(true));
$('#load-derivatives').addEventListener('click', loadDerivatives);
$('#load-macro').addEventListener('click', loadMacro);
$('#derivatives-symbol').addEventListener('keydown', (event) => { if (event.key === 'Enter') loadDerivatives(); });
$('#coin-search').addEventListener('input', (event) => { search = event.target.value.trim().toLowerCase(); marketRows(); });
$('#chart-coin').addEventListener('change', loadChart);
$('#chart-days').addEventListener('change', loadChart);
$('#chart-metric').addEventListener('change', loadChart);
$('#exchange-select').addEventListener('change', () => { $('#exchange-select').dataset.loaded = ''; loadExchangeTickers(); });
loadMarket();
loadMacro();
setInterval(() => loadMarket(false), 5 * 60 * 1000);
