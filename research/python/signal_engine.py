"""Deterministic tiered trade-plan construction from a quantum scan candidate.

All levels are derived from observed closes and ATR. No prices are invented.
A rejected scan always yields an explicit NO_TRADE plan, never a trade.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from quantum_scan import AssetFeatures, ScanResult

ENTRY_BAND_ATR = 0.25
STOP_ATR = 1.5
TP_ATR = (1.5, 3.0, 4.5)


class SignalError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class TradePlan:
    schema_version: str
    decision: str
    symbol: str | None
    entry_low: float | None
    entry_high: float | None
    stop_loss: float | None
    tp1: float | None
    tp2: float | None
    tp3: float | None
    rr_tiers: tuple[float, ...]
    confidence: float
    reasons: tuple[str, ...]

    def to_dict(self) -> dict:
        return {
            'schema_version': self.schema_version, 'decision': self.decision,
            'symbol': self.symbol, 'entry_low': self.entry_low, 'entry_high': self.entry_high,
            'stop_loss': self.stop_loss, 'tp1': self.tp1, 'tp2': self.tp2, 'tp3': self.tp3,
            'rr_tiers': list(self.rr_tiers), 'confidence': self.confidence,
            'reasons': list(self.reasons),
        }


def no_trade(reasons: tuple[str, ...]) -> TradePlan:
    return TradePlan('trade-plan.v1', 'NO_TRADE', None, None, None, None,
                     None, None, None, (), 0.0, reasons)


def build_plan(scan: ScanResult, features: Mapping[str, AssetFeatures]) -> TradePlan:
    if scan.decision != 'SCAN_CANDIDATE' or not scan.selected_symbol:
        return no_trade(tuple(scan.reasons) or ('SCAN_NOT_ACCEPTED',))
    item = features.get(scan.selected_symbol)
    if item is None or item.atr <= 0 or item.close <= 0 or item.score <= 0:
        return no_trade(('INSUFFICIENT_OBSERVED_DATA',))
    if item.regime != 'LOW_VOL_UP':
        return no_trade(('REGIME_NOT_CONFIRMED',))
    entry = item.close
    band = ENTRY_BAND_ATR * item.atr
    stop = entry - STOP_ATR * item.atr
    levels = tuple(entry + multiple * item.atr for multiple in TP_ATR)
    if not (stop < entry < levels[0] < levels[1] < levels[2]):
        return no_trade(('INVALID_LEVEL_ORDER',))
    risk = entry - stop
    rr = tuple(round((level - entry) / risk, 4) for level in levels)
    confidence = round(min(0.95, max(0.0, item.score / (item.score + 1.0))), 6)
    reasons = tuple(item.reasons) + ('CROSS_ASSET_CONFIRMATION', 'LEVELS_FROM_ATR_AND_CLOSE')
    return TradePlan('trade-plan.v1', 'BUY_SETUP', item.symbol,
                     round(entry - band, 8), round(entry + band, 8), round(stop, 8),
                     *(round(level, 8) for level in levels), rr, confidence, reasons)
