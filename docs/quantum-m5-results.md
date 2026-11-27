# Quantum M5 vertical slice — BTC/USDT — 27 November 2026

Status: **engine implemented and tested; no strategy promoted**. SPOT + FUTURES, M5, hybrid regime-aware, scalping and momentum. Live trading, orders, withdrawals, worker, paper ledger and paid resources remain OFF; budget Rp0.

## Data

- Free public Binance klines `data-api.binance.vision`, BTCUSDT interval 5m, retrieved `2026-11-27T06:49:52Z`.
- 9,999 closed M5 candles, `2026-10-23T13:30Z` → `2026-11-27T06:40Z`; one still-open candle was skipped, never used for signals.
- Quality: 0 duplicates, 0 missing intervals, 0 OHLCV violations. Provenance sidecar with source, symbol, interval, range, rows, retrieval time and SHA-256 `38fb4834944bab43a94d9e91363f601b03e661846f8cfd2424efb456b473c012`.
- `m5_data.py` rejects non-UTC/naive timestamps, duplicate and missing candles, invalid OHLCV, checksum mismatch and stale data (>3 bars old relative to retrieval).

## Engine

- `hybrid.py`: EMA, RSI, VWAP, ATR, breakout; regime (UP/DOWN/FLAT × LOW/NORMAL/HIGH); SCALP / MOMENTUM / HOLD / NO_TRADE selector; bounded config; ATR-based stop/TP; risk-based position fraction; mode comparison.
- `hybrid_backtest.py`: next-bar-open execution, SPOT long-only, FUTURES long/short at 1x baseline, fee 7.5 bps + slippage 7.5 bps + spread 2 bps per side, funding 0 spot / pre-registered 0 futures, stop/take-profit, simplified isolated liquidation, kill switch, final-equity drawdown recomputation.
- `hybrid_validation.py`: train 60% / validation 20% / OOS 20%, contiguous disjoint walk-forward (2000 train / 500 test / step 500), selection on validation only, OOS once, unchanged criteria (≥2 trades, OOS DD ≤25%, WF majority positive).

Six experiments were pre-registered in `research/python/experiments/hybrid_registry.json` at `2026-11-27T06:59:49Z`, before the first report. Reports: `research/python/output/hybrid_m5/`.

| Experiment | Instrument | OOS net % | OOS DD % | Trades | PF | Expect/trade % | WF +/total | Status |
|---|---|---:|---:|---:|---:|---:|---:|---|
| m5-01 hybrid | SPOT | 0.00 | 0.00 | 0 | n/a | 0.000 | 0/15 | REJECT |
| m5-02 hybrid | FUTURES | -2.81 | 2.81 | 14 | 0.000 | -0.203 | 1/15 | REJECT |
| m5-03 scalp | SPOT | -25.53 | 25.66 | — | — | — | 0/15 | REJECT |
| m5-04 scalp | FUTURES | -35.33 | 36.82 | 188 | 0.238 | -0.282 | 0/15 | REJECT |
| m5-05 momentum | SPOT | 0.00 | 0.00 | 0 | n/a | 0.000 | 0/15 | REJECT |
| m5-06 momentum | FUTURES | -2.81 | 2.81 | 14 | 0.000 | -0.203 | 1/15 | REJECT |

Benchmarks are in each report (`buy_hold_net_pct`, `no_trade_return_pct = 0`). No strategy passed walk-forward majority; scalping breached drawdown limit. Hybrid produced no tradable signal on SPOT and only 14 futures trades OOS. These are failures, retained as evidence; criteria were not relaxed.

## Verification

`python3 -m unittest discover -s research/python -p 'test_*.py'`: **all tests pass** (M5 data 5, hybrid 7, backtest 6, validation 3, plus existing Quant suites). `git diff --check` clean. Engineering status: Python engine is code + tests + artifacts, not a deployed service.
