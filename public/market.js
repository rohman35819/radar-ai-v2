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
    const image = node('img', 'coin-image');
    image.src = coin.image || '';
    image.alt = '';
    image.loading = 'lazy';
    const identity = node('span', 'asset-name');
    identity.append(node('b', '', safeText(coin.name)), node('small', '', safeText(coin.symbol).toUpperCase() + ' · #' + safeText(coin.market_cap_rank)));
    asset.append(image, identity);
    tr.append(asset);
    tr.append(node('td', 'number-cell', fmtMoney(coin.current_price)));
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
    drawChart(result.data?.prices || []);
  } catch (error) {
    $('#price-chart').replaceChildren(node('div', 'negative', 'Grafik tidak tersedia: ' + safeText(error.message)));
  } finally { chartBusy = false; }
}
function renderAll() {
  if (!market) return;
  globalMetrics();
  marketRows();
  renderTrending();
  renderMovers();
  renderSectors();
  renderExchanges();
  renderSummary();
  updateStatus();
}
async function loadMarket(force = false) {
  if (refreshBusy) return;
  refreshBusy = true;
  $('#refresh').classList.add('spinning');
  try {
    const response = await fetch('/api/market-intelligence' + (force ? '?refresh=1' : ''), { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok && !result.data) throw new Error(result.message || result.code || 'Gagal mengambil data CoinGecko');
    market = result;
    renderAll();
    if (!$('#chart-coin').options.length) await loadChart();
    if (force) {
      const notice = $('#notice');
      if (!notice.hidden) notice.textContent += ' Periksa kuota/key CoinGecko jika masalah berlanjut.';
    }
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
$('#refresh').addEventListener('click', () => loadMarket(true));
$('#coin-search').addEventListener('input', (event) => { search = event.target.value.trim().toLowerCase(); marketRows(); });
$('#chart-coin').addEventListener('change', loadChart);
$('#chart-days').addEventListener('change', loadChart);
loadMarket();
setInterval(() => loadMarket(false), 5 * 60 * 1000);
