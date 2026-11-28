"""Risk-control and accounting regression tests for the M5 hybrid backtest.

These tests target defects that invalidate published metrics when present:

* equity must equal the compounded trade returns (no double counting of the
  holding-period move);
* one signal may open at most one position (no silent re-entry after a stop);
* the drawdown kill switch and the daily-loss limit must arm even when the
  breach is realised by an exit, and must block later entries;
* a gap through the stop must fill at the open, not at the stop price.

No network, exchange, credential or order endpoint is used.
"""
from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from hybrid import HybridConfig, HybridSignal
from hybrid_backtest import _liquidation_price, run_hybrid_backtest
from quant_data import Candle

START = datetime(2026, 1, 1, 23, 40, tzinfo=timezone.utc)


def bars(prices: list[float], *, start: datetime = START, spread: float = 0.001) -> list[Candle]:
    rows = []
    for index, price in enumerate(prices):
        rows.append(Candle(
            timestamp=(start + timedelta(minutes=5 * index)).isoformat().replace('+00:00', 'Z'),
            open=price,
            high=price * (1.0 + spread),
            low=price * (1.0 - spread),
            close=price,
            volume=100.0,
        ))
    return rows


def make_signals(count: int, actions: dict[int, int], *, expires: int = 50,
                 stop_pct: float = 0.02, expiry_override: dict[int, int] | None = None) -> list[HybridSignal]:
    override = expiry_override or {}
    out = []
    for index in range(count):
        target = actions.get(index, 0)
        expiry = override.get(index, index + expires)
        out.append(HybridSignal(
            bar_index=index,
            timestamp=(START + timedelta(minutes=5 * index)).isoformat().replace('+00:00', 'Z'),
            target=target,
            strategy='MOMENTUM' if target else 'HOLD',
            stop_pct=stop_pct if target else 0.0,
            take_profit_pct=stop_pct * 2.0 if target else 0.0,
            expires_at=expiry if target else -1,
            confidence=0.6 if target else 0.0,
        ))
    return out


def config(**overrides) -> HybridConfig:
    base = dict(
        fee_bps_per_side=7.5,
        slippage_bps_per_side=7.5,
        spread_bps=2.0,
        risk_per_trade=0.02,
        max_daily_loss_pct=3.0,
        max_drawdown_stop_pct=0.30,
    )
    base.update(overrides)
    return HybridConfig(**base)


class AccountingTests(unittest.TestCase):
    def test_final_equity_equals_compounded_trade_returns(self):
        prices = [100, 100, 101, 102, 101, 100, 99, 100, 101, 102]
        rows = bars(prices)
        sigs = make_signals(len(rows), {1: 1, 5: 1}, stop_pct=0.002,
                            expiry_override={1: 3, 5: 7})
        result = run_hybrid_backtest(rows, sigs, config(), instrument='FUTURES')
        self.assertEqual(result['total_trades'], 2)
        compounded = 1.0
        for trade in result['trades']:
            compounded *= 1.0 + trade.net_pct / 100.0
        self.assertAlmostEqual(result['equity_curve'][-1], compounded, places=12)
        self.assertAlmostEqual(result['net_return_pct'], (compounded - 1.0) * 100.0, places=6)

    def test_trade_return_matches_effective_entry_and_exit_prices(self):
        rows = bars([100, 100, 105, 105])
        result = run_hybrid_backtest(rows, make_signals(4, {1: 1}, expiry_override={1: 3}),
                                     config(), instrument='FUTURES')
        trade = result['trades'][0]
        expected = (trade.exit_price / trade.entry_price - 1.0) * 100.0
        self.assertAlmostEqual(trade.net_pct, expected, places=6)

    def test_short_trade_return_uses_mirrored_ratio(self):
        rows = bars([100, 100, 95, 95])
        result = run_hybrid_backtest(rows, make_signals(4, {1: -1}, expiry_override={1: 3}),
                                     config(), instrument='FUTURES')
        trade = result['trades'][0]
        expected = (trade.entry_price / trade.exit_price - 1.0) * 100.0
        self.assertAlmostEqual(trade.net_pct, expected, places=6)
        self.assertGreater(trade.net_pct, 0.0)


class SignalConsumptionTests(unittest.TestCase):
    def test_one_signal_opens_only_one_position(self):
        rows = bars([100, 100, 100, 100, 100, 100])
        rows[3] = replace(rows[3], low=90.0)
        sigs = make_signals(len(rows), {1: 1})
        result = run_hybrid_backtest(rows, sigs, config(), instrument='FUTURES')
        self.assertEqual(result['total_trades'], 1)
        self.assertEqual(result['trades'][0].reason, 'stop_loss')
        self.assertEqual(result['turnover_events'], 2)

    def test_expired_signal_does_not_reenter(self):
        rows = bars([100, 100, 100, 100, 100, 100])
        sigs = make_signals(len(rows), {1: 1}, expiry_override={1: 1})
        result = run_hybrid_backtest(rows, sigs, config(), instrument='FUTURES')
        self.assertEqual(result['total_trades'], 1)
        self.assertEqual(result['trades'][0].reason, 'signal_exit')


class DrawdownKillSwitchTests(unittest.TestCase):
    def test_breach_realised_by_exit_arms_kill_switch_and_blocks_reentry(self):
        prices = [100, 100, 97, 94, 94, 94, 91, 91, 91, 91, 88, 88, 88, 88, 88]
        rows = bars(prices)
        sigs = make_signals(len(rows), {1: 1, 5: 1, 9: 1, 13: 1}, stop_pct=0.02)
        result = run_hybrid_backtest(
            rows, sigs, config(max_drawdown_stop_pct=0.05), instrument='FUTURES',
        )
        self.assertTrue(result['kill_switch_triggered'])
        self.assertEqual(result['total_trades'], 2)
        self.assertEqual(result['trades'][-1].reason, 'stop_loss')
        self.assertGreaterEqual(result['max_drawdown_pct'], 5.0)

    def test_kill_switch_stays_armed_for_the_rest_of_the_run(self):
        prices = [100, 100, 97, 94, 94, 94, 91, 91, 91, 91, 88, 88, 88, 88, 88, 88, 88]
        rows = bars(prices)
        sigs = make_signals(len(rows), {1: 1, 5: 1, 9: 1, 13: 1, 15: 1}, stop_pct=0.02)
        result = run_hybrid_backtest(
            rows, sigs, config(max_drawdown_stop_pct=0.05), instrument='FUTURES',
        )
        self.assertEqual(result['total_trades'], 2)
        self.assertTrue(result['kill_switch_triggered'])


class DailyLossTests(unittest.TestCase):
    def test_daily_loss_halts_rest_of_day_then_resets_next_day(self):
        prices = [100, 100, 96, 96, 96, 96, 96]
        rows = bars(prices)
        sigs = make_signals(
            len(rows), {1: 1, 3: 1, 4: 1},
            stop_pct=0.02, expiry_override={3: 3, 4: 4},
        )
        result = run_hybrid_backtest(
            rows, sigs,
            config(max_daily_loss_pct=3.0, max_drawdown_stop_pct=0.90),
            instrument='FUTURES',
        )
        self.assertEqual(result['daily_loss_halts'], 1)
        self.assertFalse(result['kill_switch_triggered'])
        reasons = [trade.reason for trade in result['trades']]
        self.assertEqual(reasons, ['stop_loss', 'signal_exit'])
        self.assertEqual(result['total_trades'], 2)


class GapFillTests(unittest.TestCase):
    def test_long_gap_through_stop_fills_at_open(self):
        rows = bars([100, 100, 90, 90])
        rows[2] = replace(rows[2], open=90.0, high=91.0, low=85.0, close=88.0)
        result = run_hybrid_backtest(rows, make_signals(4, {1: 1}), config(), instrument='FUTURES')
        trade = result['trades'][0]
        self.assertEqual(trade.reason, 'stop_loss')
        self.assertAlmostEqual(trade.exit_price, 90.0 * (1.0 - 0.0016), places=8)

    def test_short_gap_through_stop_fills_at_open(self):
        rows = bars([100, 100, 110, 110])
        rows[2] = replace(rows[2], open=110.0, high=115.0, low=109.0, close=112.0)
        result = run_hybrid_backtest(rows, make_signals(4, {1: -1}), config(), instrument='FUTURES')
        trade = result['trades'][0]
        self.assertEqual(trade.reason, 'stop_loss')
        self.assertAlmostEqual(trade.exit_price, 110.0 / (1.0 - 0.0016), places=8)


class LiquidationModelTests(unittest.TestCase):
    def test_one_x_long_liquidates_only_at_zero(self):
        self.assertEqual(_liquidation_price(100.0, 1, 1.0), 0.0)

    def test_one_x_short_liquidates_near_a_double(self):
        self.assertAlmostEqual(_liquidation_price(100.0, -1, 1.0), 200.0 / 1.005, places=9)


if __name__ == '__main__':
    unittest.main()
