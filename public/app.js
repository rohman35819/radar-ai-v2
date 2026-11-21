'use strict';
const $ = (s) => document.querySelector(s);
const h = (tag, a = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(a)) k === 'class' ? (e.className = v) : e.setAttribute(k, v); for (const c of kids.flat()) e.append(c instanceof Node ? c : document.createTextNode(c ?? '')); return e; };
const money = (v) => v == null ? 'N/A' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + v.toFixed(2);
const pct = (v) => v == null ? h('span', {}, 'N/A') : h('span', { class: v >= 0 ? 'up' : 'dn' }, (v > 0 ? '+' : '') + v.toFixed(1) + '%');
const x = (v) => v == null ? 'N/A' : v.toFixed(2) + 'x';
const FLAG = { fdv_unknown: 'FDV tidak diketahui', fdv_gt_5x_mcap: 'FDV >5x MCap', volume_gt_mcap: 'Volume > MCap', stale: 'Data basi' };
let data = null, aiGroup = null, tab = 'screener', watch = [];
try { watch = JSON.parse(localStorage.getItem('watch') || '[]'); } catch {}
const saveWatch = () => { try { localStorage.setItem('watch', JSON.stringify(watch)); } catch {} };

function tokenCard(t) {
  const f = t.fundamental, on = watch.includes(t.id);
  const star = h('button', { class: 'star', 'aria-label': 'watchlist' }, on ? '★' : '☆');
  star.onclick = () => { watch = on ? watch.filter((i) => i !== t.id) : [...watch, t.id]; saveWatch(); render(); };
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, h('b', {}, `${t.symbol} · ${t.name}`), star),
    h('div', { class: 'row' }, h('span', {}, t.price == null ? 'N/A' : '$' + t.price), pct(t.change_24h)),
    h('div', { class: 'g' }, h('span', {}, 'MCap ' + money(t.market_cap)), h('span', {}, 'Vol ' + money(t.volume_24h)), h('span', {}, 'FDV ' + money(t.fdv)),
      h('span', {}, 'Vol/MCap (24j) ' + x(t.vol_mcap)),
      h('span', {}, t.vol10m ? `Vol 10m (asli, ${t.vol10m.exchange}): ${money(t.vol10m.volume_usdt)} · ${x(t.vol10m.x)} median` : 'Vol 10m (asli): N/A (data belum cukup/tidak ada pair)'), h('span', {}, '7h ', pct(t.change_7d)),
      h('span', {}, f ? 'TVL ' + money(f.tvl) : 'TVL: N/A (tidak ada di DeFiLlama)'),
      ...(f ? [h('span', {}, 'Fees 24j ' + money(f.fees_24h)), h('span', {}, 'Revenue 24j ' + money(f.revenue_24h)), h('span', {}, 'MCap/TVL ' + x(f.mcap_tvl)), h('span', {}, 'MCap/Fees(thn) ' + x(f.mcap_fees_annualized))] : [])),
    t.vol10m && t.vol10m.spike ? [h('span', { class: 'tag' }, 'LONJAKAN VOLUME 10M')] : [],
    t.flags.map((k) => h('span', { class: 'tag' }, FLAG[k] || k)));
}
function renderGroup() {\n  const v = $('#view'); v.replaceChildren();\n  if (!aiGroup?.last) return v.append(h('div', { class: 'card' }, 'Belum ada diskusi AI. Laporan harian berikutnya dijadwalkan pukul 09.00 WIB.'));\n  const g = aiGroup.last, f = g.final || {};\n  v.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', {}, 'Keputusan grup'), h('span', { class: f.decision === 'LONG' ? 'up' : f.decision === 'SHORT' ? 'dn' : 'tag' }, f.decision || 'WAIT')), h('div', { class: 'muted' }, new Date(g.created_at).toLocaleString() + ' · ' + (g.status || 'unknown')), h('p', {}, f.summary || 'Belum ada ringkasan'), h('div', { class: 'g' }, h('span', {}, 'Keyakinan: ' + (f.confidence_score ?? 0) + '/100'), h('span', {}, 'Anggota valid: ' + (g.analyses || []).filter(a => !a.error).length + '/3'))));\n  (g.analyses || []).forEach(a => v.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', {}, (a.provider || 'AI').toUpperCase()), h('span', { class: a.error ? 'dn' : 'tag' }, a.error ? 'Gagal' : a.decision)), a.error ? h('p', {}, a.error) : h('p', {}, a.summary || ''), ...(a.reasons || []).map(x => h('div', { class: 'muted' }, '• ' + x)), ...(a.risks || []).map(x => h('div', { class: 'tag' }, x)))));\n  v.append(h('div', { class: 'card' }, h('b', {}, 'Risiko keputusan akhir'), ...(f.risks || []).map(x => h('div', { class: 'tag' }, x)), h('div', { class: 'muted' }, 'Diskusi AI adalah analisis, bukan jaminan hasil trading. Tidak ada transaksi otomatis.')));\n}\nfunction render() {
  const v = $('#view'); v.replaceChildren();
  if (tab === 'ai') return renderGroup();\n  if (!data) return v.append(h('div', { class: 'card' }, 'Belum ada data.'));
  const q = $('#q').value.trim().toLowerCase(), k = $('#sort').value;
  const list = (tab === 'watch' ? data.tokens.filter((t) => watch.includes(t.id)) : data.tokens)
    .filter((t) => !q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    .sort((a, b) => (b[k] ?? -Infinity) - (a[k] ?? -Infinity));
  $('#tools').hidden = !(tab === 'screener' || tab === 'watch');
  if (tab === 'screener' || tab === 'watch') {
    if (!list.length) v.append(h('div', { class: 'card' }, tab === 'watch' ? 'Watchlist kosong. Tekan ☆ pada token.' : 'Tidak ada token yang lolos filter (atau sumber data gagal; lihat status).'));
    list.slice(0, 200).forEach((t) => v.append(tokenCard(t)));
  } else if (tab === 'news') {
    if (!data.news.length) v.append(h('div', { class: 'card' }, 'Belum ada berita. Periksa NEWS_FEEDS dan status sumber.'));
    data.news.forEach((n) => v.append(h('div', { class: 'card' }, h('a', { href: n.link, target: '_blank', rel: 'noopener noreferrer' }, n.title), h('div', { class: 'muted' }, `${n.source} · ${n.published_at ? new Date(n.published_at).toLocaleString() : ''}`))));
  } else if (tab === 'unlock') {
    if (!data.unlocks.length) v.append(h('div', { class: 'card' }, 'Belum ada data unlock. Tidak ada sumber gratis terverifikasi: isi data/unlocks.json atau UNLOCKS_URL (lihat README).'));
    data.unlocks.sort((a, b) => a.date.localeCompare(b.date)).forEach((u) => v.append(h('div', { class: 'card' }, h('b', {}, u.symbol || u.id), ` · ${new Date(u.date).toLocaleDateString()} · ${money(u.amount_usd)} · ${u.pct_supply ?? 'N/A'}% supply`, h('div', { class: 'muted' }, u.source))));
  } else {
    if (!data.alerts.length) v.append(h('div', { class: 'card' }, 'Belum ada alert.'));
    data.alerts.forEach((a) => v.append(h('div', { class: 'card' }, h('b', {}, ({ volume_10m: 'VOLUME 10 MENIT (CANDLE ASLI)', volume_est24h: 'ESTIMASI Δ VOLUME 24J (BUKAN 10 MENIT)' })[a.type] || a.type.toUpperCase()), ' ' + a.msg, h('div', { class: 'muted' }, `${new Date(a.at).toLocaleString()} · Telegram: ${a.delivered ? 'terkirim' : 'tidak terkirim'}`))));
  }
}
function status() {
  if (!data) return;
  const bad = Object.entries(data.health).filter(([, s]) => !s.ok);
  $('#status').textContent = data.last_ok ? 'Update ' + new Date(data.last_ok).toLocaleTimeString() : 'Belum ada data sukses';
  const b = $('#banner'), msgs = [];
  const age = data.last_ok ? Date.now() - Date.parse(data.last_ok) : Infinity;
  if (data.stale || age > 30 * 60000) msgs.push('Data basi/belum ada.');
  bad.forEach(([n, s]) => msgs.push(`${n}: ${s.error}`));
  if (data.config_needed.telegram) msgs.push('Telegram belum dikonfigurasi (alert hanya di dashboard).');
  b.hidden = !msgs.length; b.textContent = msgs.join(' | ');
}
async function loadGroup() { try { const r = await fetch('/api/ai/group'); if (!r.ok) throw 0; const j = await r.json(); aiGroup = j.group; } catch {} }\nasync function load() {
  try { const r = await fetch('/api/snapshot'); if (!r.ok) throw 0; data = await r.json(); } catch { $('#status').textContent = 'Offline/gagal memuat'; }
  await loadGroup(); status(); render();
}
document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.t; document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b)); render(); });
$('#q').oninput = render; $('#sort').onchange = render;
load(); setInterval(load, 120000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
