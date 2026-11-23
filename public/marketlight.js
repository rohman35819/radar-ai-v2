'use strict';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const text = (value, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);
  const hasNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const number = (value, digits = 2) => hasNumber(value) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
  const money = (value) => hasNumber(value) ? '$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
  const node = (tag, cls, value) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value !== undefined) el.textContent = value;
    return el;
  };
  let busy = false;

  function metric(label, value, detail) {
    const card = node('article', 'market-stat');
    card.append(node('small', '', label), node('strong', '', value), node('span', 'muted', detail || ''));
    return card;
  }

  function render(payload) {
    const d = payload.data || {};
    const derivatives = d.derivatives || {};
    const oi = derivatives.oi || {};
    const liquidation = d.liquidations || {};
    const fear = d.fear_greed || {};
    const total = liquidation.total || {};
    const stats = $('#marketlight-stats');
    stats.replaceChildren(
      metric('TOTAL OPEN INTEREST', money(oi.total), 'Agregat USD · ' + payload.base),
      metric('PERUBAHAN OI 24J', hasNumber(oi.change24h) ? (Number(oi.change24h) * 100).toFixed(2) + '%' : '—', 'Fraction provider → persen'),
      metric('LIKUIDASI LONG · GLOBAL', money(total.long), 'Seluruh pasar · ' + payload.liquidation_hours + ' jam'),
      metric('LIKUIDASI SHORT · GLOBAL', money(total.short), 'Seluruh pasar · ' + payload.liquidation_hours + ' jam'),
      metric('FEAR & GREED', hasNumber(fear.value) ? number(fear.value, 0) + ' / 100' : '—', text(fear.label, 'Belum tersedia'))
    );

    const rows = $('#marketlight-venues');
    rows.replaceChildren();
    const oiByExchange = Array.isArray(oi.byExchange) ? oi.byExchange : [];
    const fundingRaw = derivatives.funding?.byExchange;
    const fundingRows = Array.isArray(fundingRaw) ? fundingRaw : fundingRaw && typeof fundingRaw === 'object' ? Object.entries(fundingRaw).map(([exchange, value]) => ({ exchange, ...(value || {}) })) : [];
    const venues = [...new Set([...oiByExchange.map((item) => item.exchange), ...fundingRows.map((item) => item.exchange)].filter(Boolean))].sort();
    venues.forEach((venue) => {
      const f = fundingRows.find((item) => item.exchange === venue) || {};
      const o = oiByExchange.find((item) => item.exchange === venue) || {};
      const tr = node('tr');
      const rate = hasNumber(f.rate) ? (Number(f.rate) * 100).toFixed(4) + '%' : '—';
      const interval = f.intervalHours == null ? 'Default venue' : number(f.intervalHours, 0) + ' jam';
      const change = hasNumber(o.change24h) ? (Number(o.change24h) * 100).toFixed(2) + '%' : '—';
      tr.append(node('td', '', venue), node('td', 'number-cell', rate), node('td', '', interval), node('td', 'number-cell', money(o.usd)), node('td', 'number-cell', change));
      rows.append(tr);
    });
    if (!venues.length) {
      const tr = node('tr'); const td = node('td', 'muted', 'Data exchange belum tersedia.'); td.colSpan = 5; tr.append(td); rows.append(tr);
    }
    const sourceRows = Object.entries(payload.sources || {});
    const stale = sourceRows.some(([, source]) => source.stale);
    const failures = sourceRows.filter(([, source]) => !source.ok).map(([name, source]) => name + ': ' + (source.error || (source.stale ? 'stale' : 'unavailable')));
    $('#marketlight-status').textContent = payload.base + ' · snapshot diambil ' + new Date(payload.observed_at).toLocaleString('id-ID') +
      (payload.cached ? ' · cache' : '') + (stale ? ' · DATA LAMA' : '') +
      (failures.length ? ' · parsial: ' + failures.join(', ') : ' · seluruh feed OK');
    const feedNames = { derivatives: 'Open interest/funding', liquidations: 'Likuidasi global', fear_greed: 'Fear & Greed' };
    $('#marketlight-freshness').textContent = 'Waktu observasi sumber (terpisah dari waktu pengambilan): ' +
      sourceRows.map(([name, source]) => feedNames[name] + ': ' + (source.updated_at ? new Date(source.updated_at).toLocaleString('id-ID') : 'belum tersedia') +
        (source.stale ? ' [lama]' : '')).join(' · ');
  }

  async function load() {
    if (busy) return;
    busy = true;
    const button = $('#load-marketlight');
    const status = $('#marketlight-status');
    button.disabled = true;
    status.textContent = 'Mengambil data publik Marketlight…';
    try {
      const base = $('#marketlight-base').value;
      const hours = $('#marketlight-hours').value;
      const response = await fetch('/api/market-intelligence/marketlight?base=' + encodeURIComponent(base) + '&hours=' + encodeURIComponent(hours), { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload.status === 'error') throw new Error(payload.message || payload.code || 'Marketlight unavailable');
      render(payload);
    } catch (error) {
      status.textContent = 'Marketlight belum tersedia: ' + text(error.message);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  $('#load-marketlight')?.addEventListener('click', load);
  $('#marketlight-base')?.addEventListener('change', () => { $('#marketlight-status').textContent = 'Aset berubah. Tekan Muat data untuk memperbarui snapshot.'; });
})();
