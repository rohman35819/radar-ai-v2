'use strict';
(function () {
  const fmt = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const digits = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 4 : Math.abs(n) >= 0.01 ? 6 : 8;
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  };
  const node = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = String(text);
    return item;
  };
  function render() {
    const root = node('section', 'trade-setup-panel');
    const head = node('div', 'trade-setup-head');
    const intro = node('div');
    intro.append(node('div', 'eyebrow', 'RADAR SIGNAL / BINANCE USDⓈ-M FUTURES'));
    intro.append(node('h2', '', 'Trade Setup Scanner'));
    intro.append(node('p', 'muted', 'Satu kandidat terbaik dari pair USDT perpetual yang cocok dengan ticker market.'));
    const refresh = node('button', 'secondary-btn', 'Scan ulang');
    refresh.type = 'button';
    head.append(intro, refresh);
    const content = node('div', 'trade-setup-content', 'Menghitung kandidat dari candle 1 jam…');
    root.append(head, content);
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      refresh.disabled = true;
      content.replaceChildren(node('p', 'muted', 'Memindai candle tertutup, indikator trend, volatilitas, dan volume…'));
      try {
        const response = await fetch('/api/market-intelligence/trade-setups', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || result.status === 'error') throw new Error(result.message || result.code || 'Trade Setup tidak tersedia');
        content.replaceChildren();
        if (!result.setup) {
          content.append(node('div', 'trade-setup-empty', result.reason || 'Belum ada setup yang memenuhi filter. Tidak ada sinyal yang dipaksakan.'));
          content.append(node('small', 'muted', 'Kandidat diperiksa: ' + (result.candidates_checked ?? 0) + ' · ' + (result.observed_at ? new Date(result.observed_at).toLocaleString('id-ID') : 'Waktu tidak tersedia')));
          return;
        }
        const setup = result.setup;
        const top = node('div', 'trade-setup-coin');
        const name = node('div');
        name.append(node('strong', '', setup.name + ' (' + setup.symbol.replace(/USDT$/, '') + ')'));
        name.append(node('small', 'muted', setup.symbol + ' · LONG · timeframe 1H · harga mark referensi'));
        top.append(name, node('span', 'trade-setup-score', 'SCORE ' + setup.score + '/100'));
        content.append(top);
        const levels = node('div', 'trade-setup-levels');
        [
          ['ENTRY / HARGA ACUAN', setup.entry, 'entry'],
          ['STOP LOSS', setup.stop_loss, 'stop'],
          ['TAKE PROFIT 1 · 1R', setup.tp1, 'target'],
          ['TAKE PROFIT 2 · 2R', setup.tp2, 'target'],
          ['TAKE PROFIT 3 · 3R', setup.tp3, 'target']
        ].forEach(([label, value, kind]) => {
          const box = node('div', 'trade-setup-level ' + kind);
          box.append(node('small', '', label), node('b', '', fmt(value)));
          levels.append(box);
        });
        content.append(levels);
        const metrics = node('div', 'trade-setup-meta');
        metrics.append(node('span', '', 'RSI 14: ' + fmt(setup.indicators?.rsi_14)));
        metrics.append(node('span', '', 'ATR 14: ' + fmt(setup.indicators?.atr_14) + ' (' + fmt(setup.indicators?.atr_percent) + '%)'));
        metrics.append(node('span', '', 'Volume 5 candle / median: ' + fmt(setup.indicators?.volume_ratio_5_vs_20) + 'x'));
        metrics.append(node('span', '', 'Risk ke SL: ' + fmt(setup.risk_percent) + '%'));
        content.append(metrics);
        content.append(node('p', 'trade-setup-note', 'Target dihitung dari 1R / 2R / 3R; 1R = 1,5 × ATR(14). Skor adalah confluence indikator, bukan probabilitas profit.'));
        content.append(node('p', 'trade-setup-warning', 'Harga entry adalah mark price saat pemindaian, bukan harga order atau jaminan fill. Pemetaan pair memakai ticker unik, bukan contract address. Cek ulang harga, likuiditas, funding, dan risiko sebelum keputusan.'));
        content.append(node('small', 'muted', 'Candle terakhir: ' + new Date(setup.last_closed_candle).toLocaleString('id-ID') + ' · Dipindai: ' + new Date(setup.observed_at).toLocaleString('id-ID') + ' · Cache 2 menit'));
      } catch (error) {
        content.replaceChildren(node('div', 'trade-setup-empty', 'Trade Setup tidak tersedia: ' + String(error.message || error).slice(0, 180)));
      } finally {
        busy = false;
        refresh.disabled = false;
      }
    };
    refresh.addEventListener('click', load);
    load();
    return root;
  }
  window.RadarTradeSetups = { render };
})();
