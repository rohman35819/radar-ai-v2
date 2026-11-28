"""Hybrid regime-aware strategy engine for M5 research.

Pure deterministic module: no network, no orders, no persistence. Every signal
for bar i is computed from information up to bar i-1 only. Instrument risk is
separate: SPOT cannot short; FUTURES supports long/short with 1x research
baseline and no real leverage.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Sequence

from quant_data import Candle

StrategyName = Literal['SCALP', 'MOMENTUM', 'HOLD', 'NO_TRADE']
Instrument = Literal['SPOT', 'FUTURES']


@dataclass(frozen=True)
class HybridConfig:
    ema_fast: int = 9
    ema_slow: int = 21
    rsi_period: int = 14
    rsi_oversold: float = 32.0
    rsi_overbought: float = 68.0
    vwap_period: int = 48
    atr_period: int = 14
    breakout_lookback: int = 24
    scalp_atr_mult: float = 1.2
    momentum_atr_mult: float = 1.8
    risk_per_trade: float = 0.005
    max_position: float = 1.0
    max_daily_loss_pct: float = 3.0
    max_drawdown_stop_pct: float = 0.30
    signal_expiry_bars: int = 6
    cooldown_bars: int = 2
    fee_bps_per_side: float = 7.5
    slippage_bps_per_side: float = 7.5
    spread_bps: float = 2.0
    funding_bps_per_day: float = 0.0
    leverage: float = 1.0
    mode: Literal['HYBRID', 'SCALP', 'MOMENTUM'] = 'HYBRID'

    def validate(self) -> None:
        if not 2 <= self.ema_fast < self.ema_slow <= 200:
            raise ValueError('ema period wajib 2 <= fast < slow <= 200')
        if not 2 <= self.rsi_period <= 200 or not 2 <= self.atr_period <= 200:
            raise ValueError('rsi/atr period wajib 2..200')
        if not 2 <= self.vwap_period <= 500 or not 2 <= self.breakout_lookback <= 500:
            raise ValueError('vwap/breakout period wajib 2..500')
        if not 0 < self.rsi_oversold < self.rsi_overbought < 100:
            raise ValueError('RSI threshold wajib 0 < oversold < overbought < 100')
        if not 0.2 <= self.scalp_atr_mult <= self.momentum_atr_mult <= 6:
            raise ValueError('ATR multiplier wajib 0.2 <= scalp <= momentum <= 6')
        if not 0 < self.risk_per_trade <= 0.02 or not 0 < self.max_position <= 1:
            raise ValueError('risk/position di luar batas')
        if not 0.1 <= self.max_daily_loss_pct <= 10:
            raise ValueError('max_daily_loss_pct wajib 0.1..10')
        if not 0.0 < self.max_drawdown_stop_pct <= 1.0:
            raise ValueError('max_drawdown_stop_pct wajib (0, 1]')
        if not 1 <= self.signal_expiry_bars <= 100 or not 0 <= self.cooldown_bars <= 20:
            raise ValueError('expiry/cooldout di luar batas')
        for name in ('fee_bps_per_side', 'slippage_bps_per_side', 'spread_bps', 'funding_bps_per_day'):
            value = getattr(self, name)
            if not math.isfinite(value) or value < 0 or value > 10000:
                raise ValueError(f'{name} wajib 0..10000 bps')
        if self.leverage != 1.0:
            raise ValueError('research baseline hanya mendukung leverage 1x')
        if self.mode not in ('HYBRID', 'SCALP', 'MOMENTUM'):
            raise ValueError('mode wajib HYBRID, SCALP, atau MOMENTUM')

    def to_dict(self) -> dict:
        return {key: getattr(self, key) for key in self.__dataclass_fields__}


@dataclass(frozen=True)
class Regime:
    trend: Literal['UP', 'DOWN', 'FLAT']
    volatility: Literal['LOW', 'NORMAL', 'HIGH']

    def to_dict(self) -> dict:
        return {'trend': self.trend, 'volatility': self.volatility}


@dataclass(frozen=True)
class HybridSignal:
    bar_index: int
    timestamp: str
    target: int  # -1, 0, 1
    strategy: StrategyName
    stop_pct: float
    take_profit_pct: float
    expires_at: int
    confidence: float

    def to_dict(self) -> dict:
        return {
            'bar_index': self.bar_index, 'timestamp': self.timestamp, 'target': self.target,
            'strategy': self.strategy, 'stop_pct': round(self.stop_pct, 6),
            'take_profit_pct': round(self.take_profit_pct, 6),
            'expires_at': self.expires_at, 'confidence': round(self.confidence, 6),
        }


def ema(values: Sequence[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) < period:
        return out
    multiplier = 2.0 / (period + 1)
    seed = sum(values[:period]) / period
    out[period - 1] = seed
    for i in range(period, len(values)):
        out[i] = values[i] * multiplier + out[i - 1] * (1 - multiplier)  # type: ignore[operator]
    return out


def rsi(values: Sequence[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    gains = 0.0
    losses = 0.0
    for i in range(1, len(values)):
        change = values[i] - values[i - 1]
        gain, loss = max(change, 0.0), max(-change, 0.0)
        if i <= period:
            gains += gain
            losses += loss
            if i == period:
                avg_gain, avg_loss = gains / period, losses / period
                out[i] = 100.0 if avg_loss == 0 else 100.0 - 100.0 / (1 + avg_gain / avg_loss)
        else:
            gains = gains - gains / period + gain
            losses = losses - losses / period + loss
            if i >= period:
                avg_gain, avg_loss = gains / period, losses / period
                out[i] = 100.0 if avg_loss == 0 else 100.0 - 100.0 / (1 + avg_gain / avg_loss)
    return out


def vwap(candles: Sequence[Candle], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(candles)
    pv = 0.0
    volume = 0.0
    for i, candle in enumerate(candles):
        typical = (candle.high + candle.low + candle.close) / 3
        pv += typical * candle.volume
        volume += candle.volume
        if i >= period:
            first = candles[i - period]
            first_typical = (first.high + first.low + first.close) / 3
            pv -= first_typical * first.volume
            volume -= first.volume
        if i >= period - 1 and volume > 0:
            out[i] = pv / volume
    return out


def atr(candles: Sequence[Candle], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(candles)
    if len(candles) < period + 1:
        return out
    trs = [
        max(c.high - c.low, abs(c.high - candles[i - 1].close), abs(c.low - candles[i - 1].close))
        for i, c in enumerate(candles) if i > 0
    ]
    seed = sum(trs[:period]) / period
    out[period] = seed
    for i in range(period + 1, len(candles)):
        out[i] = (seed * (period - 1) + trs[i - 1]) / period
        seed = out[i]  # type: ignore[assignment]
    return out


def detect_regime(
    candles: Sequence[Candle], index: int, config: HybridConfig,
    fast: Sequence[float | None], slow: Sequence[float | None], atr_series: Sequence[float | None],
) -> Regime:
    """Read only bars strictly before `index`."""
    prior = index - 1
    if prior < config.ema_slow or fast[prior] is None or slow[prior] is None or atr_series[prior] is None:
        return Regime('FLAT', 'LOW')
    spread = abs(fast[prior] - slow[prior]) / max(slow[prior], 1e-9)  # type: ignore[operator]
    atr_pct = atr_series[prior] / max(candles[prior].close, 1e-9)  # type: ignore[operator]
    trend = 'UP' if fast[prior] > slow[prior] and spread > 0.0005 else (
        'DOWN' if fast[prior] < slow[prior] and spread > 0.0005 else 'FLAT'
    )
    volatility = 'HIGH' if atr_pct > 0.006 else ('LOW' if atr_pct < 0.0015 else 'NORMAL')
    return Regime(trend, volatility)


def select_strategy(regime: Regime, scalp_active: bool, momentum_active: bool) -> StrategyName:
    if regime.volatility == 'HIGH':
        return 'NO_TRADE'
    if regime.trend != 'FLAT' and momentum_active:
        return 'MOMENTUM'
    if regime.trend == 'FLAT' and scalp_active:
        return 'SCALP'
    return 'HOLD'


def position_fraction(config: HybridConfig, stop_pct: float) -> float:
    if stop_pct <= 0:
        return 0.0
    return min(config.max_position, config.risk_per_trade / stop_pct)


def generate_signals(
    candles: Sequence[Candle],
    config: HybridConfig,
    *,
    allow_short: bool,
) -> list[HybridSignal]:
    """Generate one signal per bar using only prior closed information."""
    config.validate()
    closes = [c.close for c in candles]
    fast = ema(closes, config.ema_fast)
    slow = ema(closes, config.ema_slow)
    rsi_values = rsi(closes, config.rsi_period)
    vwap_values = vwap(candles, config.vwap_period)
    atr_values = atr(candles, config.atr_period)
    signals: list[HybridSignal] = []
    last_trade = -10**9
    for i, candle in enumerate(candles):
        prior = i - 1
        target = 0
        strategy: StrategyName = 'HOLD'
        stop_pct = 0.0
        confidence = 0.0
        if prior >= config.ema_slow and atr_values[prior] is not None:
            regime = detect_regime(candles, i, config, fast, slow, atr_values)
            atr_pct = atr_values[prior] / max(candles[prior].close, 1e-9)  # type: ignore[operator]
            scalp_long = (
                rsi_values[prior] is not None and vwap_values[prior] is not None
                and rsi_values[prior] <= config.rsi_oversold  # type: ignore[operator]
                and candles[prior].close < vwap_values[prior] - config.scalp_atr_mult * atr_values[prior]  # type: ignore[operator]
            )
            scalp_short = (
                rsi_values[prior] is not None and vwap_values[prior] is not None
                and rsi_values[prior] >= config.rsi_overbought  # type: ignore[operator]
                and candles[prior].close > vwap_values[prior] + config.scalp_atr_mult * atr_values[prior]  # type: ignore[operator]
            )
            lookback = candles[max(0, prior - config.breakout_lookback):prior + 1]
            highest = max(c.high for c in lookback)
            lowest = min(c.low for c in lookback)
            momentum_long = (
                regime.trend == 'UP' and candles[prior].close >= highest
                and closes[prior] > fast[prior] > slow[prior]  # type: ignore[operator]
            )
            momentum_short = (
                regime.trend == 'DOWN' and candles[prior].close <= lowest
                and closes[prior] < fast[prior] < slow[prior]  # type: ignore[operator]
            )
            chosen = select_strategy(regime, scalp_long or scalp_short, momentum_long or momentum_short)
            if config.mode == 'SCALP':
                chosen = 'SCALP' if (scalp_long or scalp_short) else 'HOLD'
            elif config.mode == 'MOMENTUM':
                chosen = 'MOMENTUM' if (momentum_long or momentum_short) else 'HOLD'
            strategy = chosen
            if chosen == 'MOMENTUM':
                target = 1 if momentum_long else (-1 if momentum_short and allow_short else 0)
                stop_pct = max(0.002, config.momentum_atr_mult * atr_pct)
                confidence = 0.6
            elif chosen == 'SCALP':
                target = 1 if scalp_long else (-1 if scalp_short and allow_short else 0)
                stop_pct = max(0.002, config.scalp_atr_mult * atr_pct)
                confidence = 0.5
        if target != 0 and i - last_trade < config.cooldown_bars:
            target = 0
            strategy = 'HOLD'
        if target != 0:
            last_trade = i
        signals.append(HybridSignal(
            bar_index=i,
            timestamp=candle.timestamp,
            target=target,
            strategy=strategy,
            stop_pct=stop_pct,
            take_profit_pct=stop_pct * 2.0,
            expires_at=i + config.signal_expiry_bars,
            confidence=confidence,
        ))
    return signals


__all__ = [
    'HybridConfig', 'HybridSignal', 'Instrument', 'Regime', 'StrategyName',
    'atr', 'detect_regime', 'ema', 'generate_signals', 'position_fraction',
    'rsi', 'select_strategy', 'vwap',
]
