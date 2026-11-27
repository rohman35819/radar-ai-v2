"""Volatility intelligence from realized OHLCV returns. Research-only.

Implied volatility is NOT computed: no valid options dataset exists in this
repository. Realized volatility is never presented as implied volatility.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Mapping, Sequence

from quant_data import Candle


class VolatilityError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class VolatilityState:
    schema_version: str
    symbol: str
    as_of: str
    realized_vol: float
    percentile: float
    regime: str
    shock: bool
    expansion: bool
    implied_volatility: None
    reasons: tuple[str, ...]

    def to_dict(self) -> dict:
        return {
            'schema_version': self.schema_version, 'symbol': self.symbol,
            'as_of': self.as_of, 'realized_vol': self.realized_vol,
            'percentile': self.percentile, 'regime': self.regime, 'shock': self.shock,
            'expansion': self.expansion, 'implied_volatility': self.implied_volatility,
            'reasons': list(self.reasons),
        }


def realized_vol_from_closes(closes: Sequence[float]) -> float:
    if len(closes) < 21:
        raise VolatilityError('NOT_ENOUGH_DATA')
    returns = [closes[index] / closes[index - 1] - 1.0 for index in range(len(closes) - 20, len(closes))]
    value = statistics.stdev(returns) * math.sqrt(365)
    if not math.isfinite(value) or value <= 0:
        raise VolatilityError('INVALID_VOLATILITY')
    return value


def observe_volatility(candles: Sequence[Candle], symbol: str, end: int) -> VolatilityState:
    bars = candles[:end]
    if len(bars) < 120:
        raise VolatilityError('NOT_ENOUGH_DATA')
    closes = [bar.close for bar in bars]
    current = realized_vol_from_closes(closes)
    history = [realized_vol_from_closes(closes[:index]) for index in range(100, len(closes) + 1)]
    percentile = sum(1 for value in history if value <= current) / len(history)
    median = statistics.median(history[-60:])
    if current > median * 1.5:
        regime = 'HIGH_VOL'
    elif current < median * 0.75:
        regime = 'LOW_VOL'
    else:
        regime = 'NORMAL_VOL'
    prior = history[-2] if len(history) > 1 else median
    expansion = current > prior * 1.15
    shock = current > median * 2.0
    reasons = (
        f'realized_vol={current:.6f}', f'percentile={percentile:.4f}',
        f'median={median:.6f}', 'IMPLIED_VOL_UNAVAILABLE',
    )
    return VolatilityState('volatility-state.v1', symbol, bars[-1].timestamp,
                           round(current, 8), round(percentile, 6), regime, shock,
                           expansion, None, reasons)


def compare_volatility(states: Mapping[str, VolatilityState]) -> dict:
    ranked = sorted(states.values(), key=lambda item: item.realized_vol)
    return {
        'schema_version': 'volatility-comparison.v1',
        'ranking_low_to_high': [item.symbol for item in ranked],
        'note': 'Realized volatility only; not implied volatility.',
    }
