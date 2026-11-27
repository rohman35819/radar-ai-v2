"""Institutional-style exposure controls for spot/perpetual instruments.

Options Greeks (delta/gamma/theta/vega) are NOT synthesized for spot/perp. Their
fields are null with an explicit reason until a valid options dataset exists.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Mapping, Sequence

from quant_data import Candle


class RiskError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Exposure:
    schema_version: str
    symbol: str
    position_fraction: float
    direction_exposure: float
    options_delta: None
    options_gamma: None
    options_theta: None
    options_vega: None
    greeks_reason: str
    size_fraction: float
    max_exposure: float
    reasons: tuple[str, ...]

    def to_dict(self) -> dict:
        return {
            'schema_version': self.schema_version, 'symbol': self.symbol,
            'position_fraction': self.position_fraction,
            'direction_exposure': self.direction_exposure,
            'options_delta': self.options_delta, 'options_gamma': self.options_gamma,
            'options_theta': self.options_theta, 'options_vega': self.options_vega,
            'greeks_reason': self.greeks_reason, 'size_fraction': self.size_fraction,
            'max_exposure': self.max_exposure, 'reasons': list(self.reasons),
        }


def size_by_risk(risk_fraction: float, stop_distance: float, max_exposure: float) -> float:
    if not 0 < risk_fraction < 1 or not 0 < stop_distance < 1 or not 0 < max_exposure <= 1:
        raise RiskError('INVALID_RISK_INPUT')
    return round(min(risk_fraction / stop_distance, max_exposure), 6)


def exposure_for(symbol: str, position: int, size_fraction: float, max_exposure: float) -> Exposure:
    if position not in (0, 1) or not 0 <= size_fraction <= max_exposure:
        raise RiskError('INVALID_EXPOSURE')
    return Exposure(
        'exposure-spotperp.v1', symbol, float(position), float(position * size_fraction),
        None, None, None, None, 'OPTIONS_GREEKS_DEFERRED_NO_VALID_OPTIONS_DATA',
        size_fraction, max_exposure,
        ('SPOT_PERP_DIRECTION_EXPOSURE_ONLY', 'NO_FAKE_GREEKS', 'NO_LIVE_ORDER'),
    )


def hedged_book(entries: Sequence[Exposure], returns_by_symbol: Mapping[str, Sequence[float]]) -> dict:
    """Portfolio-level exposure and correlation proxy from observed returns."""
    if not entries:
        return {'schema_version': 'hedged-book.v1', 'gross_exposure': 0.0,
                'net_exposure': 0.0, 'correlation_proxy': None, 'symbols': []}
    gross = math.fsum(abs(item.direction_exposure) for item in entries)
    net = math.fsum(item.direction_exposure for item in entries)
    correlation = None
    if len(entries) >= 2:
        series = [returns_by_symbol.get(item.symbol, []) for item in entries]
        if all(len(series) >= 20 for series in series) and len(series[0]) == len(series[1]):
            left, right = series[0], series[1]
            mean_left, mean_right = statistics.fmean(left), statistics.fmean(right)
            cov = math.fsum((a - mean_left) * (b - mean_right) for a, b in zip(left, right)) / len(left)
            var_left = math.fsum((a - mean_left) ** 2 for a in left) / len(left)
            var_right = math.fsum((b - mean_right) ** 2 for b in right) / len(right)
            if var_left > 0 and var_right > 0:
                correlation = round(cov / math.sqrt(var_left * var_right), 6)
    return {
        'schema_version': 'hedged-book.v1',
        'gross_exposure': round(gross, 6),
        'net_exposure': round(net, 6),
        'correlation_proxy': correlation,
        'symbols': [item.symbol for item in entries],
        'note': 'Spot/perp exposure aggregation; not options Greeks, not a hedge order.',
    }
