"""One explainable baseline strategy: SMA crossover, long/flat.

Signal generation is deliberately separated from execution. A signal for bar i
is computed from closes up to bar i-1 only; no future candle is ever consulted.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

from quant_data import Candle


@dataclass(frozen=True)
class StrategyConfig:
    fast: int = 5
    slow: int = 20
    fee_bps: float = 10.0
    slippage_bps: float = 5.0
    funding_bps_per_day: float = 0.0
    position_fraction: float = 1.0
    stop_loss_pct: float = 0.10
    max_drawdown_stop_pct: float = 0.30

    def validate(self) -> None:
        if not (isinstance(self.fast, int) and isinstance(self.slow, int)):
            raise ValueError("fast/slow wajib integer")
        if not 2 <= self.fast < self.slow:
            raise ValueError("Periode wajib 2 <= fast < slow")
        for name in ("fee_bps", "slippage_bps", "funding_bps_per_day"):
            value = getattr(self, name)
            if not math.isfinite(value) or value < 0 or value > 10000:
                raise ValueError(f"{name} wajib 0..10000 bps")
        if not 0 < self.position_fraction <= 1:
            raise ValueError("position_fraction wajib (0, 1]")
        if not 0 < self.stop_loss_pct < 1:
            raise ValueError("stop_loss_pct wajib (0, 1)")
        if not 0 < self.max_drawdown_stop_pct <= 1:
            raise ValueError("max_drawdown_stop_pct wajib (0, 1]")

    def to_dict(self) -> dict:
        return {
            "fast": self.fast,
            "slow": self.slow,
            "fee_bps": self.fee_bps,
            "slippage_bps": self.slippage_bps,
            "funding_bps_per_day": self.funding_bps_per_day,
            "position_fraction": self.position_fraction,
            "stop_loss_pct": self.stop_loss_pct,
            "max_drawdown_stop_pct": self.max_drawdown_stop_pct,
        }


@dataclass(frozen=True)
class Signal:
    timestamp: str
    target_position: int
    computed_from: str | None
    reference_price: float | None = None

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "target_position": self.target_position,
            "computed_from": self.computed_from,
            "reference_price": self.reference_price,
        }


def sma_series(values: Sequence[float], period: int) -> list[float | None]:
    """O(n) rolling mean with explicit warm-up (None before enough history)."""
    if period < 1:
        raise ValueError("period wajib >= 1")
    result: list[float | None] = [None] * len(values)
    rolling = 0.0
    for index, value in enumerate(values):
        rolling += value
        if index >= period:
            rolling -= values[index - period]
        if index >= period - 1:
            result[index] = rolling / period
    return result


def generate_signals(candles: Sequence[Candle], config: StrategyConfig) -> list[Signal]:
    """Deterministic long/flat signal. Bar i uses only info available at i-1."""
    config.validate()
    closes = [candle.close for candle in candles]
    fast = sma_series(closes, config.fast)
    slow = sma_series(closes, config.slow)
    signals: list[Signal] = []
    for index, candle in enumerate(candles):
        if index == 0 or slow[index - 1] is None or fast[index - 1] is None:
            signals.append(Signal(candle.timestamp, 0, None, None))
            continue
        previous = index - 1
        target = 1 if (fast[previous] or 0) > (slow[previous] or 0) else 0
        signals.append(Signal(candle.timestamp, target, candles[previous].timestamp, closes[previous]))
    return signals
