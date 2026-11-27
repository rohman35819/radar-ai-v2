"""Quantum scanning engine: regime, volatility, liquidity and cross-asset confirmation.

Research-only. Uses committed public OHLCV artifacts. No order, no live data claim,
no model training. Every feature is computed from closed bars only; the scan at
index i reads bars strictly before i, so nothing leaks from the future.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from datetime import datetime
from typing import Mapping, Sequence

from quant_data import Candle, Dataset, parse_timestamp

MIN_BARS = 60
MAX_AGE_MS = 7 * 24 * 3600 * 1000  # historical research window, not live readiness


class ScanError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class AssetFeatures:
    symbol: str
    as_of: str
    close: float
    atr: float
    realized_vol: float
    trend_strength: float
    volume_ratio: float
    regime: str
    score: float
    reasons: tuple[str, ...]

    def to_dict(self) -> dict:
        return {
            'symbol': self.symbol, 'as_of': self.as_of, 'close': self.close,
            'atr': self.atr, 'realized_vol': self.realized_vol,
            'trend_strength': self.trend_strength, 'volume_ratio': self.volume_ratio,
            'regime': self.regime, 'score': self.score, 'reasons': list(self.reasons),
        }


@dataclass(frozen=True)
class ScanResult:
    schema_version: str
    evaluated_at: str
    features: tuple[AssetFeatures, ...]
    selected_symbol: str | None
    decision: str
    reasons: tuple[str, ...]

    def to_dict(self) -> dict:
        return {
            'schema_version': self.schema_version,
            'evaluated_at': self.evaluated_at,
            'assets': [item.to_dict() for item in self.features],
            'selected_symbol': self.selected_symbol,
            'decision': self.decision,
            'reasons': list(self.reasons),
        }


def atr_at(candles: Sequence[Candle], end: int, period: int = 14) -> float | None:
    """ATR using bars [end-period, end); `end` is the first unclosed bar."""
    if end < period:
        return None
    true_ranges = []
    for index in range(end - period, end):
        current = candles[index]
        previous_close = candles[index - 1].close if index > 0 else current.open
        true_ranges.append(max(current.high - current.low,
                               abs(current.high - previous_close),
                               abs(current.low - previous_close)))
    return math.fsum(true_ranges) / period


def compute_features(dataset: Dataset, end: int, symbol: str) -> AssetFeatures:
    """Features for the closed bar at index end-1; no future bars are read."""
    candles = dataset.candles[:end]
    if len(candles) < MIN_BARS:
        raise ScanError('NOT_ENOUGH_DATA')
    closes = [candle.close for candle in candles]
    volumes = [candle.volume for candle in candles]
    last = candles[-1]
    atr = atr_at(candles, len(candles))
    if atr is None or atr <= 0:
        raise ScanError('INVALID_ATR')
    returns = [closes[index] / closes[index - 1] - 1.0 for index in range(len(closes) - 20, len(closes))]
    realized_vol = statistics.stdev(returns) * math.sqrt(365)
    sma = math.fsum(closes[-50:]) / 50
    trend = (closes[-1] - sma) / sma
    avg_volume = math.fsum(volumes[-20:]) / 20
    if avg_volume <= 0:
        raise ScanError('INVALID_VOLUME')
    volume_ratio = volumes[-1] / avg_volume
    vol_median = statistics.median([statistics.stdev(closes[i-20:i]) * math.sqrt(365)
                                    for i in range(len(closes) - 60, len(closes))])
    if realized_vol > vol_median * 1.5:
        regime = 'HIGH_VOL'
    elif trend > 0.02 and realized_vol <= vol_median:
        regime = 'LOW_VOL_UP'
    elif trend < -0.02:
        regime = 'LOW_VOL_DOWN'
    else:
        regime = 'FLAT'
    liquidity = min(volume_ratio, 2.0)
    score = (trend / max(realized_vol, 1e-9)) * liquidity
    reasons = (
        f'close={closes[-1]:.6f}', f'atr={atr:.6f}', f'vol={realized_vol:.6f}',
        f'trend={trend:.6f}', f'volume_ratio={volume_ratio:.4f}', f'regime={regime}',
    )
    return AssetFeatures(symbol, last.timestamp, closes[-1], atr, realized_vol,
                         trend, volume_ratio, regime, score, reasons)


def scan(
    datasets: Mapping[str, Dataset],
    evaluated_at: str,
    end_by_symbol: Mapping[str, int] | None = None,
    max_age_ms: int = MAX_AGE_MS,
) -> ScanResult:
    """Cross-asset confirmation: both BTC and ETH must be LOW_VOL_UP with positive score."""
    now = parse_timestamp(evaluated_at)
    if max_age_ms <= 0:
        raise ScanError('INVALID_AGE_LIMIT')
    features: list[AssetFeatures] = []
    for symbol, dataset in sorted(datasets.items()):
        if not dataset.quality.accepted:
            raise ScanError('DATA_QUALITY_REJECTED')
        end = len(dataset.candles) if end_by_symbol is None else end_by_symbol.get(symbol, len(dataset.candles))
        if end <= 0 or end > len(dataset.candles):
            raise ScanError('INVALID_SCAN_INDEX')
        last_time = parse_timestamp(dataset.candles[end - 1].timestamp)
        age_ms = (now - last_time).total_seconds() * 1000
        if age_ms < 0:
            raise ScanError('FUTURE_DATA')
        if age_ms > max_age_ms:
            raise ScanError('STALE_DATA')
        features.append(compute_features(dataset, end, symbol))
    by_symbol = {item.symbol: item for item in features}
    required = ('BTCUSDT', 'ETHUSDT')
    if not all(symbol in by_symbol for symbol in required):
        return ScanResult('quantum-scan.v1', evaluated_at, tuple(features), None, 'NO_TRADE',
                          ('MISSING_REQUIRED_ASSET',))
    if all(by_symbol[symbol].regime == 'LOW_VOL_UP' and by_symbol[symbol].score > 0 for symbol in required):
        selected = max((by_symbol[symbol] for symbol in required), key=lambda item: item.score)
        return ScanResult('quantum-scan.v1', evaluated_at, tuple(features), selected.symbol, 'SCAN_CANDIDATE',
                          ('CROSS_ASSET_CONFIRMATION',))
    return ScanResult('quantum-scan.v1', evaluated_at, tuple(features), None, 'NO_TRADE',
                      ('CROSS_ASSET_CONFIRMATION_FAILED',))
