"""Deterministic tests for the hybrid M5 strategy engine."""
from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from hybrid import (
    HybridConfig,
    Regime,
    atr,
    detect_regime,
    ema,
    generate_signals,
    position_fraction,
    rsi,
    select_strategy,
    vwap,
)
from quant_data import Candle

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def dataset(count: int = 160, *, trend: float = 0.0) -> list[Candle]:
    rows = []
    price = 100.0
    for i in range(count):
        close = price + trend * i + (i % 7) - 3
        rows.append(Candle(
            timestamp=(START + timedelta(minutes=5 * i)).isoformat().replace("+00:00", "Z"),
            open=price,
            high=max(price, close) + 1,
            low=min(price, close) - 1,
            close=close,
            volume=100 + i,
        ))
        price = close
    return rows


class HybridTests(unittest.TestCase):
    def test_config_bounds(self):
        HybridConfig().validate()
        with self.assertRaises(ValueError):
            replace(HybridConfig(), leverage=2.0).validate()
        with self.assertRaises(ValueError):
            replace(HybridConfig(), ema_fast=21, ema_slow=9).validate()
        with self.assertRaises(ValueError):
            replace(HybridConfig(), risk_per_trade=0.5).validate()

    def test_indicators_are_deterministic(self):
        rows = dataset()
        closes = [c.close for c in rows]
        self.assertEqual(ema(closes, 9), ema(closes, 9))
        self.assertEqual(rsi(closes, 14), rsi(closes, 14))
        self.assertEqual(vwap(rows, 48), vwap(rows, 48))
        self.assertEqual(atr(rows, 14), atr(rows, 14))

    def test_selector_states(self):
        self.assertEqual(select_strategy(Regime('UP', 'NORMAL'), False, True), 'MOMENTUM')
        self.assertEqual(select_strategy(Regime('FLAT', 'LOW'), True, False), 'SCALP')
        self.assertEqual(select_strategy(Regime('UP', 'NORMAL'), False, False), 'HOLD')
        self.assertEqual(select_strategy(Regime('UP', 'HIGH'), True, True), 'NO_TRADE')

    def test_signals_are_causal_and_bounded(self):
        rows = dataset()
        signals = generate_signals(rows, HybridConfig(), allow_short=True)
        self.assertEqual(len(signals), len(rows))
        self.assertTrue(all(s.target in (-1, 0, 1) for s in signals))
        self.assertTrue(all(s.expires_at > s.bar_index for s in signals))
        future_changed = list(rows)
        future_changed[-1] = replace(future_changed[-1], close=9999.0)
        replay = generate_signals(future_changed, HybridConfig(), allow_short=True)
        self.assertEqual([s.to_dict() for s in signals[:-1]], [s.to_dict() for s in replay[:-1]])

    def test_spot_never_shorts(self):
        rows = dataset(trend=-0.5)
        signals = generate_signals(rows, HybridConfig(), allow_short=False)
        self.assertTrue(all(s.target >= 0 for s in signals))

    def test_regime_uses_prior_bar_only(self):
        rows = dataset(80, trend=0.5)
        config = HybridConfig()
        closes = [c.close for c in rows]
        fast, slow, atr_values = (
            [None] * len(rows), [None] * len(rows), atr(rows, config.atr_period)
        )
        from hybrid import ema
        fast, slow = ema(closes, config.ema_fast), ema(closes, config.ema_slow)
        before = detect_regime(rows, 70, config, fast, slow, atr_values)
        changed = list(rows)
        changed[70] = replace(changed[70], close=1.0)
        after = detect_regime(changed, 70, config, fast, slow, atr_values)
        self.assertEqual(before, after)

    def test_position_fraction_is_bounded(self):
        config = HybridConfig()
        self.assertEqual(position_fraction(config, 0.005), config.max_position)
        self.assertLess(position_fraction(config, 0.02), config.max_position)
        self.assertEqual(position_fraction(config, 0.0), 0.0)


if __name__ == '__main__':
    unittest.main()
