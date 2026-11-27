"""Market microstructure proxies from public OHLCV. Research-only.

Actual bid/ask quotes and order-book depth are NOT available in these artifacts.
Every spread/imbalance value here is explicitly a PROXY derived from candles and
volume, never presented as observed exchange microstructure.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Mapping, Sequence

from quant_data import Candle


class MicrostructureError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Microstructure:
    schema_version: str
    symbol: str
    as_of: str
    spread_proxy_bps: float
    spread_state: str
    liquidity_state: str
    close_position: float
    imbalance_proxy: float
    volume_ratio: float
    actual_order_book: bool
    reasons: tuple[str, ...]

    def to_dict(self) -> dict:
        return {
            'schema_version': self.schema_version, 'symbol': self.symbol,
            'as_of': self.as_of, 'spread_proxy_bps': self.spread_proxy_bps,
            'spread_state': self.spread_state, 'liquidity_state': self.liquidity_state,
            'close_position': self.close_position, 'imbalance_proxy': self.imbalance_proxy,
            'volume_ratio': self.volume_ratio, 'actual_order_book': self.actual_order_book,
            'reasons': list(self.reasons),
        }


def observe_microstructure(candles: Sequence[Candle], symbol: str, end: int) -> Microstructure:
    """Compute proxies using closed bars strictly before `end`."""
    bars = candles[:end]
    if len(bars) < 60:
        raise MicrostructureError('NOT_ENOUGH_DATA')
    last = bars[-1]
    span = last.high - last.low
    if span <= 0 or last.close <= 0:
        raise MicrostructureError('INVALID_BAR')
    range_bps = span / last.close * 10000.0
    recent = [(bar.high - bar.low) / bar.close * 10000.0 for bar in bars[-20:]]
    median_range = statistics.median(recent)
    if median_range <= 0:
        raise MicrostructureError('INVALID_RANGE')
    spread_state = 'WIDENING' if range_bps > median_range * 1.25 else (
        'NARROWING' if range_bps < median_range * 0.75 else 'STABLE')
    p90 = sorted((bar.high - bar.low) / bar.close * 10000.0 for bar in bars[-60:])[53]
    volumes = [bar.volume for bar in bars[-20:]]
    avg_volume = math.fsum(volumes) / 20
    if avg_volume <= 0:
        raise MicrostructureError('INVALID_VOLUME')
    volume_ratio = last.volume / avg_volume
    poor = range_bps > p90 or volume_ratio < 0.5
    close_position = (last.close - last.low) / span
    imbalance = close_position - 0.5
    reasons = (
        f'ohlcv_range_proxy={range_bps:.4f}bps', f'median_range={median_range:.4f}bps',
        f'volume_ratio={volume_ratio:.4f}', f'close_position={close_position:.4f}',
        'NO_ACTUAL_BID_ASK_OR_DEPTH',
    )
    return Microstructure('microstructure-proxy.v1', symbol, last.timestamp,
                          round(range_bps, 6), spread_state,
                          'POOR' if poor else 'OK', round(close_position, 6),
                          round(imbalance, 6), round(volume_ratio, 6), False, reasons)


def compare_liquidity(items: Mapping[str, Microstructure]) -> dict:
    """Rank by lower spread proxy and higher volume; no claim of actual depth."""
    ranked = sorted(items.values(), key=lambda item: (item.spread_proxy_bps, -item.volume_ratio))
    return {
        'schema_version': 'liquidity-comparison.v1',
        'best': ranked[0].symbol if ranked else None,
        'ranking': [item.symbol for item in ranked],
        'actual_order_book': False,
        'note': 'Proxy ranking from OHLCV range/volume; not order-book depth.',
    }
