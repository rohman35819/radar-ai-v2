# RADAR AI V2 — Quant MVP Vertical Slice Runbook

**Status:** IMPLEMENTED / TESTED on branch `feat/quant-mvp-vertical-slice`. Not deployed. Not live trading.
**Owner:** BOS · Issue: [#154](https://github.com/rohman35819/radar-ai-v2/issues/154) · **Data:** SYNTHETIC fixture (not real market data).
**Lead:** Grok (Direktur Utama / Divisi 06), dengan ruang lingkup Divisi 03/04/05/07 sesuai mandat.

## 1. Apa yang benar-benar dibangun

Satu alur riset deterministik dari data → sinyal → backtest → validasi → laporan JSON → shadow simulation TypeScript:

```
make_fixture.py  → fixtures/synthetic_btcusdt_1d.csv (+ provenance)
quant_data.py    → OHLCV quality guard + provenance + checksum
strategy.py      → SMA crossover long/flat (SATU strategi baseline)
backtest_engine.py → eksekusi open berikutnya, fee + slippage + funding + SL + kill switch
validation.py    → train / validation / out-of-sample + walk-forward
report.py        → quant-report.v1 (machine-readable)
quant_cli.py     → CLI satu perintah
src/quant/*      → kontrak TS terversi + risk gate + paper/shadow simulation
verify_report.py → QA independen otomatis (hitung ulang metrik dari artifact)
```

Python = riset/statistik/backtest. TypeScript = kontrak, risk control, dan orchestration shadow. **Tidak ada order exchange, withdraw, transfer, API key, atau layanan berbayar.**

## 2. Cara menjalankan dan mengulang

Dari root repository (Node ≥ 20, Python 3.13 di CI; 3.14 lokal):

```sh
# 1. Regenerasi fixture sintetik (deterministik)
python3 research/python/make_fixture.py

# 2. Jalankan backtest + validasi + hasilkan laporan
python3 research/python/quant_cli.py \
  research/python/fixtures/synthetic_btcusdt_1d.csv \
  --source 'deterministic synthetic fixture' --symbol BTCUSDT --interval 1d \
  --retrieved-at 2026-11-27T00:00:00Z --data-kind synthetic \
  --report research/python/output/example_report.json

# 3. QA independen otomatis terhadap artifact
python3 research/python/verify_report.py research/python/output/example_report.json \
  --csv research/python/fixtures/synthetic_btcusdt_1d.csv \
  --output research/python/output/qa_verification.json

# 4. Seluruh tes
npm test                                   # JS/TS + integration
python3 -m unittest discover -s research/python -p 'test_*.py' -v
npm run typecheck                          # CI: npx typescript@5.9.3 tsc --noEmit
```

Output `example_report.json` adalah contoh artifact nyata hasil menjalankan CLI di atas, bukan data demo yang diklaim live.

## 3. Data dan provenance

- `fixtures/synthetic_btcusdt_1d.csv`: 360 candle harian, 2025-01-01 → 2025-12-26, dibuat oleh rumus tetap di `make_fixture.py`. Sidecar `.provenance.json` menyimpan `data_kind: synthetic`, sumber, rentang, dan batasan.
- `quant_data.py` menolak: timestamp tanpa zona waktu, timestamp tidak naik/duplikat, gap melebihi batas, OHLC yang melanggar `high ≥ max(open,close,low)` / `low ≤ min(...)`, harga non-finite/non-positif, volume negatif, kolom kurang. Setiap dataset menyimpan SHA-256 file mentah.
- **Keterbatasan utama:** endpoint market publik (Binance/Coinbase/Kraken) **tidak terjangkau dari sesi pengembangan ini**. Karena itu angka backtest pada artifact adalah verifikasi deterministik atas data sintetik, **bukan bukti kinerja pasar**.
- Untuk data publik nyata (gratis, tanpa API key), jalankan ketika jaringan tersedia:

```sh
python3 research/python/fetch_ohlcv.py --symbol BTCUSDT --interval 1d --limit 365 \
  --output research/python/fixtures/btcusdt_1d_public.csv
python3 research/python/quant_cli.py research/python/fixtures/btcusdt_1d_public.csv \
  --source 'https://api.binance.com/api/v3/klines' --symbol BTCUSDT --interval 1d \
  --data-kind public_api --report research/python/output/public_report.json
```
  Adapter membuang candle yang belum selesai (`close_time` di masa depan), memvalidasi OHLC, dan tidak mengirim kunci/secret. Jangan menjalankan ini pada lingkungan tanpa akses jaringan; `parse_klines()` sudah diuji dengan response mock.

## 4. Strategi, biaya, dan anti-look-ahead

- Strategi tunggal: `SMA crossover long/flat_v1`. Sinyal bar `i` dihitung hanya dari close sampai `i-1`; eksekusi pada **open bar `i`**. Tes `test_signals_never_read_future_candles` dan `test_backtest_prefix_is_independent_of_future_data` membuktikan tidak ada ketergantungan pada masa depan.
- Biaya: `fee_bps` + `slippage_bps` per perubahan posisi (default 10 + 5 bps), `funding_bps_per_day` hanya saat posisi terbuka (default 0 untuk spot; harus diisi bila memakai perpetual, dan funding KONFIGURASI nyata wajib diverifikasi sebelum interpretasi).
- Position sizing `position_fraction` (0,1]; stop loss pada low bar dengan fill di harga stop setelah slippage; kill switch drawdown menghentikan entry selanjutnya. Asumsi fill intrabar adalah penyederhanaan dan tercantum di `limitations` laporan.
- Benchmark: `buy_hold_gross_pct`, `buy_hold_net_pct` (setelah biaya masuk/keluar), dan `no_trade_return_pct = 0`.

## 5. Validasi dan kriteria penolakan

- Split kontigu: 50% train / 25% validation / 25% out-of-sample. Parameter dipilih **hanya** pada validation dari grid kecil `(3,8), (5,20), (10,30)`; OOS dijalankan sekali dengan parameter terpilih.
- Walk-forward: fold train 120 bar → test 40 bar, bergeser 40 bar. Parameter dipilih pada train tiap fold.
- Kriteria: minimal 2 trade di OOS, max drawdown OOS ≤ 25%, pemilihan validation diterima, dan mayoritas fold walk-forward positif. Jika gagal, `accepted_for_paper_candidate = false` beserta `acceptance_reasons`.
- Contoh artifact saat ini **tidak diterima** (`oos_too_few_trades`, `walk_forward_not_majority_positive`). Itu hasil yang jujur, bukan kegagalan teknis. **Tidak ada klaim strategi profitable.**

## 6. Kontrak TypeScript dan shadow simulation

- `src/quant/contracts.mts`: `quant-report.v1` dan `quant-signal.v1` + runtime guard. Menolak schema salah, `live_trading=true`, `withdrawal=true`, `profit_claim=true`, `total_trades` negatif, checksum cacat, dan sinyal tidak valid.
- `src/quant/risk.mts`: `evaluatePaperRisk()` fail-closed (kill switch, stale data, sinyal invalid, batas exposure).
- `src/quant/paper.mts`: `runPaperSimulation()` mengonsumsi sinyal hasil Python, menghasilkan `fills`, `rejected`, `audit`, `equity_factor`, dan `no_order_submitted: true`. Tidak ada `fetch`, klien exchange, atau jalur order. Tes membuktikan determinisme, penolakan kill switch/stale, dan absennya jalur order.

## 7. Hasil terverifikasi (lokal, sebelum CI)

- Python: **19/19** (8 backtest lama + 11 baru).
- `npm test`: **237/237** (233 existing + 4 integrasi baru).
- Strict TypeScript `tsc --noEmit`: **exit 0**.
- QA independen otomatis `verify_report.py`: **12/12 check passed** (`research/python/output/qa_verification.json`). Ini bukan sign-off manusia Divisi 05.
- Hostless Build/LIVE: **tidak diverifikasi**. Tidak ada deploy, worker, produksi DB, live order, atau withdrawal yang diaktifkan.

## 8. Batasan dan larangan

- Data sintetik → angka tidak boleh dipakai sebagai bukti profit atau keputusan finansial.
- Satu aset, satu interval, satu strategi; tidak digeneralisasi.
- Biaya/kontrak perpetual tidak diverifikasi terhadap venue nyata.
- Tidak ada paper live/real-time; shadow simulation hanya deterministik offline.
- Rp0: tanpa API berbayar, VPS, database produksi, atau modal.
- Pertahankan semua menu/route dashboard RADAR AI V2; perubahan ini tidak menyentuh frontend produksi.

## 9. NEXT TASK

Jalankan dengan data publik nyata (`fetch_ohlcv.py`) pada lingkungan berjaringan, evaluasi apakah kriteria validasi lolos, lalu — hanya jika lolos dan disetujui — lanjut ke paper ledger TypeScript dengan reconciliation. Tetap tanpa order sungguhan.
