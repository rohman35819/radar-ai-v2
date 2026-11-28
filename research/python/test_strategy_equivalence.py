"""Equivalence and complexity proof for the linear-time signal generator.

The reference implementation below is the previous per-bar version: it rebuilds
the full indicator series inside the loop (O(n^2)). The optimised version must
return bit-identical signals for every strategy and fixture, and it must call
each series builder a constant number of times regardless of input length.
"""
from __future__ import annotations

import unittest
from pathlib import Path
from unittest import mock

import strategy
from quant_data import Candle, load_ohlcv
from strategy import StrategyConfig, generate_signals

ROOT = Path(__file__).parent
DAILY = ROOT / 'fixtures' / 'btcusdt_1d_public.csv'
M5 = ROOT / 'fixtures' / 'm5' / 'btcusdt_5m_public.csv'


def reference_signals(candles, config):
    """Previous O(n^2) implementation, kept verbatim as the oracle."""
    config.validate()
    closes = [candle.close for candle in candles]
    output = []
    position = 0
    for index, candle in enumerate(candles):
        target = 0
        previous = index - 1
        if index > 0:
            if config.strategy_id == 'sma_crossover':
                if strategy._warmup(previous, config.slow - 1):
                    fast = strategy.sma_series(closes, config.fast)[previous]
                    slow = strategy.sma_series(closes, config.slow)[previous]
                    if fast is not None and slow is not None:
                        target = 1 if fast > slow else 0
            elif config.strategy_id == 'trend_momentum':
                if strategy._warmup(previous, max(config.trend_period, config.momentum_period + 1) - 1):
                    trend = strategy.sma_series(closes, config.trend_period)[previous]
                    roc = strategy.roc_series(closes, config.momentum_period)[previous]
                    if trend is not None and roc is not None:
                        target = 1 if closes[previous] > trend and roc > 0 else 0
            elif config.strategy_id == 'mean_reversion':
                if strategy._warmup(previous, config.zscore_period - 1):
                    z = strategy.zscore_series(closes, config.zscore_period)[previous]
                    if z is not None:
                        if position == 0 and z <= config.entry_z:
                            target = 1
                        elif position == 1 and z >= config.exit_z:
                            target = 0
                        else:
                            target = position
            elif config.strategy_id == 'regime_aware':
                needed = max(config.trend_period, config.rsi_period + 1)
                if strategy._warmup(previous, needed - 1):
                    trend = strategy.sma_series(closes, config.trend_period)[previous]
                    rsi = strategy.rsi_series(closes, config.rsi_period)[previous]
                    if trend is not None and rsi is not None:
                        in_trend = closes[previous] > trend
                        if position == 0 and in_trend and rsi <= config.rsi_entry:
                            target = 1
                        elif position == 1 and (not in_trend or rsi >= config.rsi_exit):
                            target = 0
                        else:
                            target = position
        position = target
        output.append(strategy.Signal(
            timestamp=candle.timestamp,
            target_position=target,
            computed_from=candles[previous].timestamp if index > 0 else None,
            reference_price=closes[previous] if index > 0 else None,
        ))
    return output


def payload(signals):
    return [(item.target_position, item.timestamp, item.computed_from, item.reference_price)
            for item in signals]


def load(path: Path, interval: str, limit: int) -> list[Candle]:
    dataset = load_ohlcv(
        path, source='fixture', symbol='BTCUSDT', interval=interval,
        retrieved_at='2026-11-27T00:00:00Z',
    )
    return list(dataset.candles)[:limit]


class EquivalenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.daily = load(DAILY, '1d', 364)
        cls.m5 = load(M5, '5m', 600)

    def test_all_strategies_match_reference_on_daily_fixture(self):
        configs = [
            StrategyConfig(strategy_id='sma_crossover'),
            StrategyConfig(strategy_id='sma_crossover', fast=8, slow=34),
            StrategyConfig(strategy_id='trend_momentum'),
            StrategyConfig(strategy_id='mean_reversion'),
            StrategyConfig(strategy_id='regime_aware'),
            StrategyConfig(strategy_id='regime_aware', trend_period=20, rsi_period=7),
        ]
        for config in configs:
            with self.subTest(config=config.to_dict()):
                self.assertEqual(
                    payload(generate_signals(self.daily, config)),
                    payload(reference_signals(self.daily, config)),
                )

    def test_all_strategies_match_reference_on_m5_fixture(self):
        for strategy_id in strategy.STRATEGIES:
            config = StrategyConfig(strategy_id=strategy_id)
            with self.subTest(strategy=strategy_id):
                self.assertEqual(
                    payload(generate_signals(self.m5, config)),
                    payload(reference_signals(self.m5, config)),
                )

    def test_reference_is_deterministic_across_runs(self):
        config = StrategyConfig(strategy_id='regime_aware')
        first = payload(reference_signals(self.daily, config))
        second = payload(reference_signals(self.daily, config))
        self.assertEqual(first, second)


class ComplexityTests(unittest.TestCase):
    def candles(self, count: int) -> list[Candle]:
        return [
            Candle(
                timestamp=f'2026-01-{1 + index // 288:02d}T{(index % 288) // 12:02d}:{(index % 12) * 5:02d}:00Z',
                open=100.0 + index * 0.01,
                high=100.5 + index * 0.01,
                low=99.5 + index * 0.01,
                close=100.0 + index * 0.01,
                volume=10.0,
            )
            for index in range(count)
        ]

    def count_calls(self, function, config, count: int) -> int:
        rows = self.candles(count)
        original = strategy.sma_series
        calls = {'n': 0}

        def wrapped(*args, **kwargs):
            calls['n'] += 1
            return original(*args, **kwargs)

        with mock.patch.object(strategy, 'sma_series', side_effect=wrapped):
            function(rows, config)
        return calls['n']

    def test_optimised_builder_calls_are_constant(self):
        for strategy_id in strategy.STRATEGIES:
            config = StrategyConfig(strategy_id=strategy_id)
            with self.subTest(strategy=strategy_id):
                small = self.count_calls(generate_signals, config, 120)
                large = self.count_calls(generate_signals, config, 1200)
                self.assertEqual(small, large)
                self.assertLessEqual(large, 2)

    def test_reference_builder_calls_grow_with_input(self):
        config = StrategyConfig(strategy_id='sma_crossover')
        small = self.count_calls(reference_signals, config, 120)
        large = self.count_calls(reference_signals, config, 1200)
        self.assertGreater(large, small * 5)


if __name__ == '__main__':
    unittest.main()
