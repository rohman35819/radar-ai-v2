"""Deterministic SPOT/FUTURES backtest tests: no network, no orders."""
from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from hybrid import HybridConfig, HybridSignal
from hybrid_backtest import run_hybrid_backtest
from quant_data import Candle

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def candles(count: int = 30, *, drift: float = 1.0) -> list[Candle]:
    rows = []
    price = 100.0
    for i in range(count):
        close = price + drift
        rows.append(Candle(
            timestamp=(START + timedelta(minutes=5 * i)).isoformat().replace("+00:00", "Z"),
            open=price, high=max(price, close) + 0.1, low=min(price, close) - 0.1,
            close=close, volume=100.0,
        ))
        price = close
    return rows


def signals(count: int, action_bar: int, target: int, stop_pct: float = 0.01) -> list[HybridSignal]:
    out = []
    for i in range(count):
        active = i == action_bar
        out.append(HybridSignal(
            bar_index=i,
            timestamp=(START + timedelta(minutes=5 * i)).isoformat().replace("+00:00", "Z"),
            target=target if active else 0,
            strategy='MOMENTUM' if active else 'HOLD',
            stop_pct=stop_pct if active else 0.0,
            take_profit_pct=stop_pct * 2 if active else 0.0,
            expires_at=i + 6,
            confidence=0.6 if active else 0.0,
        ))
    return out


class HybridBacktestTests(unittest.TestCase):
    def test_spot_ignores_short_and_futures_allows_it(self):
        rows = candles(20, drift=-1.0)
        sigs = signals(20, 2, -1)
        spot = run_hybrid_backtest(rows, sigs, HybridConfig(), instrument='SPOT')
        futures = run_hybrid_backtest(rows, sigs, HybridConfig(), instrument='FUTURES')
        self.assertEqual(spot['total_trades'], 0)
        self.assertGreaterEqual(futures['total_trades'], 1)
        self.assertGreater(futures['net_return_pct'], 0)

    def test_long_profit_and_execution_at_open(self):
        rows = candles(12, drift=1.0)
        result = run_hybrid_backtest(rows, signals(12, 1, 1), HybridConfig(), instrument='FUTURES')
        self.assertGreater(result['net_return_pct'], 0)
        entry = result['trades'][0]
        self.assertAlmostEqual(entry.entry_price, rows[1].open * (1 + 0.00075 + 0.00075 + 0.0001), places=6)

    def test_costs_reduce_net_return(self):
        rows = candles(20, drift=1.0)
        sigs = signals(20, 1, 1)
        free = run_hybrid_backtest(rows, sigs, replace(HybridConfig(), fee_bps_per_side=0, slippage_bps_per_side=0, spread_bps=0), instrument='FUTURES')
        costly = run_hybrid_backtest(rows, sigs, replace(HybridConfig(), fee_bps_per_side=30, slippage_bps_per_side=30, spread_bps=10), instrument='FUTURES')
        self.assertLess(costly['net_return_pct'], free['net_return_pct'])

    def test_funding_paid_by_long_received_by_short(self):
        rows = candles(20, drift=0.0)
        cfg = replace(HybridConfig(), funding_bps_per_day=100.0)
        long = run_hybrid_backtest(rows, signals(20, 1, 1), cfg, instrument='FUTURES')
        short = run_hybrid_backtest(rows, signals(20, 1, -1), cfg, instrument='FUTURES')
        self.assertLess(long['net_return_pct'], short['net_return_pct'])

    def test_drawdown_recomputed_from_final_equity(self):
        rows = candles(40, drift=-0.5)
        result = run_hybrid_backtest(rows, signals(40, 2, 1, stop_pct=0.02), HybridConfig(), instrument='FUTURES')
        peak = 1.0
        recomputed = 0.0
        for value in result['equity_curve']:
            peak = max(peak, value)
            recomputed = max(recomputed, (peak - value) / peak)
        self.assertAlmostEqual(recomputed * 100.0, result['max_drawdown_pct'], places=4)

    def test_stop_loss_is_hit(self):
        rows = list(candles(12, drift=1.0))
        rows[3] = replace(rows[3], high=101.0, low=80.0, close=100.0)
        result = run_hybrid_backtest(rows, signals(12, 2, 1, stop_pct=0.05), HybridConfig(), instrument='FUTURES')
        self.assertTrue(any(trade.reason == 'stop_loss' for trade in result['trades']))


if __name__ == '__main__':
    unittest.main()
