'use strict';
// Aturan alert murni (mudah diuji). Cooldown per key agar tidak spam.
// Riwayat sampel per token: [{t,v,p}] (v = volume_24h bergulir dari CoinGecko).
function pushHistory(hist, tokens, now, keep = 72) {
  const ids = new Set(tokens.map((t) => t.id));
  for (const id of Object.keys(hist)) if (!ids.has(id)) delete hist[id];
  for (const t of tokens) {
    if (t.volume_24h == null) continue;
    (hist[t.id] = hist[t.id] || []).push({ t: now, v: t.volume_24h, p: t.price });
    if (hist[t.id].length > keep) hist[t.id] = hist[t.id].slice(-keep);
  }
}
// CoinGecko tidak menyediakan volume per-10-menit gratis. Estimasi terbaik: selisih volume_24h antar sampel
// berjarak ~1 interval refresh, dibandingkan dengan median selisih positif token itu sendiri.
function volumeSpike(samples, cfg) {
  if (!samples || samples.length < 2) return null;
  const want = cfg.refreshMs, ok = (g) => g >= want * 0.7 && g <= want * 1.6;
  const cur = samples[samples.length - 1], prv = samples[samples.length - 2];
  if (!ok(cur.t - prv.t)) return null;
  const delta = cur.v - prv.v;
  const base = [];
  for (let i = 1; i < samples.length - 1; i++) {
    const d = samples[i].v - samples[i - 1].v;
    if (ok(samples[i].t - samples[i - 1].t) && d > 0) base.push(d);
  }
  if (base.length < 6 || delta <= 0) return null;
  base.sort((a, b) => a - b);
  const med = base[Math.floor(base.length / 2)];
  if (delta < cfg.volumeSpikeX * med || delta < cfg.minVolumeDelta) return null;
  return { delta, med, x: delta / med, minutes: (cur.t - prv.t) / 60000 };
}
function evaluate({ next = [], history = {}, vol10m = {}, unlocks = [], now = Date.now(), cfg, log = {} }) {
  const out = [];
  const cool = cfg.cooldownH * 3600000;
  const push = (key, type, id, msg) => {
    if (log[key] && now - log[key] < cool) return;
    log[key] = now;
    out.push({ key, type, id, msg, at: new Date(now).toISOString() });
  };
  for (const t of next) {
    if (t.flags.includes('stale')) continue; // jangan beri alert dari data basi
    if (t.change_24h !== null && Math.abs(t.change_24h) >= cfg.priceAlertPct)
      push(`price:${t.id}`, 'price', t.id, `${t.symbol} ${t.change_24h > 0 ? '+' : ''}${t.change_24h.toFixed(1)}% (24j), harga $${t.price}`);
    const m = vol10m[t.id];
    if (m && m.spike) push(`vol10m:${t.id}`, 'volume_10m', t.id, `${t.symbol} VOLUME ASLI 10 mnt (candle ${m.exchange} ${m.pair}, bucket ${m.bucket_start.slice(11, 16)} UTC): $${Math.round(m.volume_usdt)} = ${m.x.toFixed(1)}x median ${m.buckets_used} bucket sebelumnya`);
    else if (!m && cfg.volumeEstAlerts !== false) { // hanya jika TIDAK ada data candle asli
      const sp = volumeSpike(history[t.id], cfg);
      if (sp) push(`volest:${t.id}`, 'volume_est24h', t.id, `${t.symbol} ESTIMASI (bukan volume 10 mnt): volume 24j bergulir naik +$${Math.round(sp.delta)} dalam ~${sp.minutes.toFixed(0)} mnt (${sp.x.toFixed(1)}x median selisih)`);
    }
  }
  for (const u of unlocks) {
    const days = (Date.parse(u.date) - now) / 86400000;
    if (days >= 0 && days <= cfg.unlockDays)
      push(`unlock:${u.id}:${u.date.slice(0, 10)}`, 'unlock', u.id, `Unlock ${u.symbol || u.id} dalam ${days.toFixed(1)} hari` + (u.pct_supply ? ` (${u.pct_supply}% supply)` : ''));
  }
  return out;
}
async function notify(alerts, cfg) {
  const res = alerts.map((a) => ({ ...a, delivered: false }));
  if (!cfg.tgToken || !cfg.tgChat) return res;
  for (const a of res) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${cfg.tgToken}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: cfg.tgChat, text: `RADAR AI [${a.type}] ${a.msg}` }),
        signal: AbortSignal.timeout(10000),
      });
      a.delivered = r.ok;
    } catch { a.delivered = false; }
  }
  return res;
}
module.exports = { evaluate, notify, pushHistory, volumeSpike };
