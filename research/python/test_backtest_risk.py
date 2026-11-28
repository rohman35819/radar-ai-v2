"""Risk-control and execution-realism regression tests for the 1d engine.

These tests target defects that invalidate published metrics when present:

* the drawdown kill switch must arm even when the breach is realised by a
  signal exit or stop-loss, so a flat strategy cannot re-enter past its limit;
* signals must be causal: truncating future bars may not change past targets;
* a gap through the stop must fill at the open, never at the stop price.

No exchange client, credential or order endpoint is used.
"""
from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from backtest_engine import run_backtest
from quant_data import Candle, Dataset, QualityReport
from strategy import Signal, StrategyConfig, generate_signals

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def candle(index: int, open_: float, high: float, low: float, close: float) -> Candle:
    stamp = (START + timedelta(days=index)).isoformat().replace("+00:00", "Z")
    return Candle(timestamp=stamp, open=open_, high=high, low=low, close=close, volume=10.0)


def dataset(candles: list[Candle]) -> Dataset:
    quality = QualityReport(
        rows=len(candles),
        start=candles[0].timestamp,
        end=candles[-1].timestamp,
        interval="1d",
        duplicate_timestamps=0,
        missing_intervals=0,
        ohlcv_violations=0,
        accepted=True,
        issues=(),
    )
    return Dataset(
        candles=tuple(candles),
        provenance={
            "schema_version": "1.0.0",
            "source": "unit-test",
            "symbol": "BTCUSDT",
            "interval": "1d",
            "retrieved_at": "2026-01-08T00:00:00Z",
            "data_kind": "synthetic",
            "start": candles[0].timestamp,
            "end": candles[-1].timestamp,
            "rows": len(candles),
            "checksum_sha256": "0" * 64,
        },
        quality=quality,
        checksum="0" * 64,
    )


def config(**overrides) -> StrategyConfig:
    base = dict(
        strategy_id="sma_crossover",
        fee_bps=10.0,
        slippage_bps=5.0,
        stop_loss_pct=0.5,
        max_drawdown_stop_pct=0.05,
        position_fraction=1.0,
    )
    base.update(overrides)
    return StrategyConfig(**base)


def signal_row(target: int, index: int = 0) -> Signal:
    stamp = (START + timedelta(days=index)).isoformat().replace("+00:00", "Z")
    return Signal(timestamp=stamp, target_position=target, computed_from=None)


def crash_candles() -> list[Candle]:
    """Rise to 109, then gap to 80 so the exit realises a ~20% loss."""
    return [
        candle(0, 100.0, 100.5, 99.5, 100.0),
        candle(1, 100.0, 100.5, 99.5, 100.0),
        candle(2, 100.0, 104.0, 99.9, 103.0),
        candle(3, 103.0, 110.0, 102.0, 109.0),
        candle(4, 80.0, 82.0, 78.0, 79.0),
        candle(5, 79.0, 80.0, 78.0, 79.5),
        candle(6, 79.5, 80.0, 78.5, 79.0),
    ]


class KillSwitchTests(unittest.TestCase):
    def test_drawdown_breach_realised_on_exit_arms_the_kill_switch(self):
        """A losing exit must halt the strategy; re-entry may not be allowed."""
        candles = crash_candles()
        signals = [signal_row(target, index) for index, target in enumerate((0, 1, 1, 1, 0, 1, 1))]
        result = run_backtest(dataset(candles), config(), signals)

        self.assertGreaterEqual(result.metrics["max_drawdown_pct"], 5.0)
        self.assertTrue(
            result.metrics["kill_switch_triggered"],
            "kill switch did not arm although the exit realised a 20% drawdown",
        )
        self.assertEqual(
            result.metrics["total_trades"], 1,
            "strategy re-entered after breaching the drawdown limit",
        )

    def test_drawdown_breach_realised_by_stop_loss_arms_the_kill_switch(self):
        candles = crash_candles()
        signals = [signal_row(target, index) for index, target in enumerate((0, 1, 1, 1, 1, 1, 1))]
        result = run_backtest(
            dataset(candles),
            config(stop_loss_pct=0.10, max_drawdown_stop_pct=0.05),
            signals,
        )
        self.assertTrue(result.metrics["kill_switch_triggered"])
        self.assertEqual(result.metrics["total_trades"], 1)
        self.assertEqual(result.trades[0].reason, "stop_loss")


class CausalityTests(unittest.TestCase):
    def test_future_bars_do_not_change_past_signals(self):
        closes = [100.0 + 0.3 * index + 4.0 * ((index % 7) - 3) for index in range(240)]
        candles = [
            candle(index, value, value + 0.5, value - 0.5, value)
            for index, value in enumerate(closes)
        ]
        cfg = config(stop_loss_pct=0.1, max_drawdown_stop_pct=0.3)
        full = generate_signals(candles, cfg)
        prefix = generate_signals(candles[:150], cfg)
        self.assertEqual(
            [item.target_position for item in full[:150]],
            [item.target_position for item in prefix],
        )
        for index in range(1, len(full)):
            self.assertEqual(full[index].computed_from, candles[index - 1].timestamp)
            self.assertEqual(full[index].reference_price, candles[index - 1].close)


class FillRealismTests(unittest.TestCase):
    def test_gap_through_stop_fills_at_open_not_at_stop(self):
        candles = [
            candle(0, 100.0, 100.5, 99.5, 100.0),
            candle(1, 100.0, 100.5, 99.5, 100.0),
            candle(2, 100.0, 101.0, 99.9, 100.5),
            candle(3, 80.0, 82.0, 70.0, 75.0),
            candle(4, 75.0, 76.0, 74.0, 75.0),
        ]
        signals = [signal_row(target, index) for index, target in enumerate((0, 1, 1, 1, 1))]
        result = run_backtest(
            dataset(candles),
            config(stop_loss_pct=0.10, max_drawdown_stop_pct=0.90),
            signals,
        )
        self.assertEqual(result.metrics["total_trades"], 1)
        trade = result.trades[0]
        self.assertEqual(trade.reason, "stop_loss")
        self.assertAlmostEqual(trade.exit_price, 80.0 * (1.0 - 0.0015), places=9)


if __name__ == "__main__":
    unittest.main()
