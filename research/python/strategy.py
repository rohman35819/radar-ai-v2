"""Explainable baseline strategies. Signal generation is separate from execution.

Every signal for bar i is computed from closes/information up to bar i-1 only.
Warm-up periods are explicit; no future candle is ever consulted.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

from quant_data import Candle

STRATEGIES = ('sma_crossover', 'trend_momentum', 'mean_reversion', 'regime_aware')


@dataclass(frozen=True)
class StrategyConfig:
    strategy_id: str = 'sma_crossover'
    fast: int = 5
    slow: int = 20
    fee_bps: float = 10.0
    slippage_bps: float = 5.0
    funding_bps_per_day: float = 0.0
    position_fraction: float = 1.0
    stop_loss_pct: float = 0.10
    max_drawdown_stop_pct: float = 0.30
    trend_period: int = 50
    momentum_period: int = 10
    zscore_period: int = 20
    entry_z: float = -1.0
    exit_z: float = 0.0
    rsi_period: int = 14
    rsi_entry: float = 35.0
    rsi_exit: float = 55.0

    def validate(self) -> None:
        if self.strategy_id not in STRATEGIES:
            raise ValueError(f"strategi tidak dikenal: {self.strategy_id}")
        if not 2 <= self.fast < self.slow:
            raise ValueError("Periode SMA wajib 2 <= fast < slow")
        for name in ('fee_bps', 'slippage_bps', 'funding_bps_per_day'):
            value = getattr(self, name)
            if not math.isfinite(value) or value < 0 or value > 10000:
                raise ValueError(f"{name} wajib 0..10000 bps")
        if not 0 < self.position_fraction <= 1:
            raise ValueError("position_fraction wajib (0, 1]")
        if not 0 < self.stop_loss_pct < 1:
            raise ValueError("stop_loss_pct wajib (0, 1)")
        if not 0 < self.max_drawdown_stop_pct <= 1:
            raise ValueError("max_drawdown_stop_pct wajib (0, 1]")
        for name in ('trend_period', 'momentum_period', 'zscore_period', 'rsi_period'):
            value = getattr(self, name)
            if not isinstance(value, int) or isinstance(value, bool) or value < 2:
                raise ValueError(f"{name} wajib integer >= 2")
        if not math.isfinite(self.entry_z) or not math.isfinite(self.exit_z) or self.entry_z >= self.exit_z:
            raise ValueError("entry_z harus lebih kecil dari exit_z")
        if not 0 < self.rsi_entry < self.rsi_exit < 100:
            raise ValueError("RSI threshold wajib 0 < entry < exit < 100")

    def to_dict(self) -> dict:
        return {
            'strategy_id': self.strategy_id,
            'fast': self.fast,
            'slow': self.slow,
            'fee_bps': self.fee_bps,
            'slippage_bps': self.slippage_bps,
            'funding_bps_per_day': self.funding_bps_per_day,
            'position_fraction': self.position_fraction,
            'stop_loss_pct': self.stop_loss_pct,
            'max_drawdown_stop_pct': self.max_drawdown_stop_pct,
            'trend_period': self.trend_period,
            'momentum_period': self.momentum_period,
            'zscore_period': self.zscore_period,
            'entry_z': self.entry_z,
            'exit_z': self.exit_z,
            'rsi_period': self.rsi_period,
            'rsi_entry': self.rsi_entry,
            'rsi_exit': self.rsi_exit,
        }


@dataclass(frozen=True)
class Signal:
    timestamp: str
    target_position: int
    computed_from: str | None
    reference_price: float | None = None

    def to_dict(self) -> dict:
        return {
            'timestamp': self.timestamp,
            'target_position': self.target_position,
            'computed_from': self.computed_from,
            'reference_price': self.reference_price,
        }


def sma_series(values: Sequence[float], period: int) -> list[float | None]:
    if period < 1:
        raise ValueError('period wajib >= 1')
    result: list[float | None] = [None] * len(values)
    rolling = 0.0
    for index, value in enumerate(values):
        rolling += value
        if index >= period:
            rolling -= values[index - period]
        if index >= period - 1:
            result[index] = rolling / period
    return result


def roc_series(values: Sequence[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    for index in range(period, len(values)):
        if values[index - period] > 0:
            result[index] = values[index] / values[index - period] - 1.0
    return result


def zscore_series(values: Sequence[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    for index in range(period - 1, len(values)):
        window = values[index - period + 1:index + 1]
        mean = math.fsum(window) / period
        variance = math.fsum((value - mean) ** 2 for value in window) / period
        if variance > 0:
            result[index] = (values[index] - mean) / math.sqrt(variance)
    return result


def rsi_series(values: Sequence[float], period: int) -> list[float | None]:
    """Simple rolling RSI (average gains / average losses over the window)."""
    result: list[float | None] = [None] * len(values)
    for index in range(period, len(values)):
        gains = []
        losses = []
        for offset in range(index - period + 1, index + 1):
            change = values[offset] - values[offset - 1]
            gains.append(max(0.0, change))
            losses.append(max(0.0, -change))
        avg_gain = math.fsum(gains) / period
        avg_loss = math.fsum(losses) / period
        if avg_loss == 0:
            result[index] = 100.0
        elif avg_gain >= 0 and avg_loss > 0:
            result[index] = 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)
    return result


def _warmup(index: int, required: int) -> bool:
    return index >= required


def generate_signals(candles: Sequence[Candle], config: StrategyConfig) -> list[Signal]:
    """Deterministic target positions; bar i reads only information at i-1.

    Indicator series are built once per call (linear in the number of bars).
    The previous version rebuilt the full series inside the bar loop, which was
    O(n^2) and made an M5 parameter sweep impractical.
    """
    config.validate()
    closes = [candle.close for candle in candles]
    strategy_id = config.strategy_id
    fast_series: list[float | None] | None = None
    slow_series: list[float | None] | None = None
    trend_series: list[float | None] | None = None
    roc_values: list[float | None] | None = None
    z_values: list[float | None] | None = None
    rsi_values: list[float | None] | None = None
    if strategy_id == 'sma_crossover':
        fast_series = sma_series(closes, config.fast)
        slow_series = sma_series(closes, config.slow)
    elif strategy_id == 'trend_momentum':
        trend_series = sma_series(closes, config.trend_period)
        roc_values = roc_series(closes, config.momentum_period)
    elif strategy_id == 'mean_reversion':
        z_values = zscore_series(closes, config.zscore_period)
    elif strategy_id == 'regime_aware':
        trend_series = sma_series(closes, config.trend_period)
        rsi_values = rsi_series(closes, config.rsi_period)
    output: list[Signal] = []
    position = 0
    for index, candle in enumerate(candles):
        target = 0
        previous = index - 1
        if index > 0:
            if strategy_id == 'sma_crossover':
                if _warmup(previous, config.slow - 1):
                    fast = fast_series[previous]  # type: ignore[index]
                    slow = slow_series[previous]  # type: ignore[index]
                    if fast is not None and slow is not None:
                        target = 1 if fast > slow else 0
            elif strategy_id == 'trend_momentum':
                if _warmup(previous, max(config.trend_period, config.momentum_period + 1) - 1):
                    trend = trend_series[previous]  # type: ignore[index]
                    roc = roc_values[previous]  # type: ignore[index]
                    if trend is not None and roc is not None:
                        target = 1 if closes[previous] > trend and roc > 0 else 0
            elif strategy_id == 'mean_reversion':
                if _warmup(previous, config.zscore_period - 1):
                    z = z_values[previous]  # type: ignore[index]
                    if z is not None:
                        if position == 0 and z <= config.entry_z:
                            target = 1
                        elif position == 1 and z >= config.exit_z:
                            target = 0
                        else:
                            target = position
            elif strategy_id == 'regime_aware':
                needed = max(config.trend_period, config.rsi_period + 1)
                if _warmup(previous, needed - 1):
                    trend = trend_series[previous]  # type: ignore[index]
                    rsi = rsi_values[previous]  # type: ignore[index]
                    if trend is not None and rsi is not None:
                        in_trend = closes[previous] > trend
                        if position == 0 and in_trend and rsi <= config.rsi_entry:
                            target = 1
                        elif position == 1 and (not in_trend or rsi >= config.rsi_exit):
                            target = 0
                        else:
                            target = position
        position = target
        output.append(Signal(
            timestamp=candle.timestamp,
            target_position=target,
            computed_from=candles[previous].timestamp if index > 0 else None,
            reference_price=closes[previous] if index > 0 else None,
        ))
    return output
