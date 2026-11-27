"""Deterministic M5 backtest for hybrid long/flat/short signals.

Signals are executed at the NEXT bar open, never at the close that produced
them. SPOT cannot short. FUTURES allows long/short with a 1x research baseline,
funding, spread/slippage/fee and a simplified isolated liquidation model.
No order is sent anywhere.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Sequence

from hybrid import HybridConfig, HybridSignal, position_fraction
from quant_data import Candle

INSTRUMENTS = ('SPOT', 'FUTURES')
MAINTENANCE_MARGIN = 0.005


@dataclass(frozen=True)
class Trade:
    entry_time: str
    exit_time: str
    direction: int
    entry_price: float
    exit_price: float
    gross_pct: float
    net_pct: float
    bars: int
    reason: str

    def to_dict(self) -> dict:
        return {
            'entry_time': self.entry_time, 'exit_time': self.exit_time,
            'direction': self.direction, 'entry_price': round(self.entry_price, 8),
            'exit_price': round(self.exit_price, 8),
            'gross_pct': round(self.gross_pct, 6), 'net_pct': round(self.net_pct, 6),
            'bars': self.bars, 'reason': self.reason,
        }


def run_hybrid_backtest(
    candles: Sequence[Candle],
    signals: Sequence[HybridSignal],
    config: HybridConfig,
    *,
    instrument: Literal['SPOT', 'FUTURES'] = 'SPOT',
) -> dict:
    if instrument not in INSTRUMENTS:
        raise ValueError('instrument wajib SPOT atau FUTURES')
    config.validate()
    if len(signals) < len(candles):
        raise ValueError('Jumlah signal kurang dari jumlah candle')
    fee = config.fee_bps_per_side / 10000.0
    slip = config.slippage_bps_per_side / 10000.0
    spread = config.spread_bps / 10000.0
    funding_per_bar = config.funding_bps_per_day / 10000.0 * (300.0 / 86400.0)
    fraction_cap = config.max_position

    equity = 1.0
    gross = 1.0
    position = 0
    entry_price = 0.0
    entry_gross = 0.0
    entry_time = ''
    entry_index = 0
    mark_price = 0.0
    stop_pct = 0.0
    take_profit = 0.0
    current_fraction = fraction_cap
    trades: list[Trade] = []
    equity_curve: list[float] = []
    bar_returns: list[float] = []
    exposure_bars = 0
    turnover = 0
    liquidations = 0
    kill_active = False
    peak = 1.0
    active_target = 0
    active_expiry = -1

    def close_position(exit_price: float, exit_gross_price: float, time: str, index: int, reason: str):
        nonlocal equity, gross, position, entry_price, mark_price, turnover
        if position == 1:
            net = exit_price / entry_price - 1.0
            growth = exit_gross_price / entry_gross - 1.0
        else:
            net = entry_price / exit_price - 1.0
            growth = entry_gross / exit_gross_price - 1.0
        trades.append(Trade(entry_time, time, position, entry_price, exit_price,
                            growth * 100.0, net * 100.0, index - entry_index, reason))
        equity *= 1.0 + net * current_fraction
        gross *= 1.0 + growth * current_fraction
        position = 0
        mark_price = 0.0
        turnover += 1

    for index, candle in enumerate(candles):
        signal = signals[index]
        # 1) Intrabar risk exit for an existing position, before any new target.
        if position != 1 and position != -1:
            pass
        else:
            stop_price = entry_price * (1.0 - stop_pct) if position == 1 else entry_price * (1.0 + stop_pct)
            tp_price = entry_price * (1.0 + take_profit) if position == 1 else entry_price * (1.0 - take_profit)
            liquidation = entry_price * (1.0 - (1.0 / config.leverage - MAINTENANCE_MARGIN)) if position == 1 else entry_price * (1.0 + (1.0 / config.leverage - MAINTENANCE_MARGIN))
            reason = ''
            fill = 0.0
            gross_fill = 0.0
            if position == 1:
                adverse = max(stop_price, liquidation)
                if candle.low <= adverse:
                    reason = 'liquidation' if liquidation >= stop_price else 'stop_loss'
                    fill = adverse * (1.0 - slip - fee - spread / 2)
                    gross_fill = adverse
                elif candle.high >= tp_price:
                    reason = 'take_profit'
                    fill = tp_price * (1.0 - slip - fee - spread / 2)
                    gross_fill = tp_price
            else:
                adverse = min(stop_price, liquidation)
                if candle.high >= adverse:
                    reason = 'liquidation' if liquidation <= stop_price else 'stop_loss'
                    fill = adverse * (1.0 + slip + fee + spread / 2)
                    gross_fill = adverse
                elif candle.low <= tp_price:
                    reason = 'take_profit'
                    fill = tp_price * (1.0 + slip + fee + spread / 2)
                    gross_fill = tp_price
            if reason:
                if reason == 'liquidation' and instrument == 'FUTURES':
                    liquidations += 1
                    kill_active = True
                close_position(fill, gross_fill, candle.timestamp, index, reason)

        # 2) Execute the signal at this bar's OPEN (signal used only prior data).
        if signal.target != 0 and signal.strategy in ('MOMENTUM', 'SCALP'):
            active_target = signal.target
            active_expiry = signal.expires_at
        target = active_target if signal.bar_index <= active_expiry else 0
        if instrument == 'SPOT' and target == -1:
            target = 0
        if kill_active and target != 0:
            target = 0
        if target != position and target in (-1, 0, 1):
            if position != 0:
                exit_fill = candle.open * ((1.0 - slip - fee - spread / 2) if position == 1 else (1.0 + slip + fee + spread / 2))
                exit_gross = candle.open
                close_position(exit_fill, exit_gross, candle.timestamp, index, 'signal_exit')
            if target != 0:
                entry_raw = candle.open * ((1.0 + slip + fee + spread / 2) if target == 1 else (1.0 - slip - fee - spread / 2))
                gross_raw = candle.open
                position = target
                entry_price = entry_raw
                entry_gross = gross_raw
                entry_time = candle.timestamp
                entry_index = index
                mark_price = candle.close
                stop_pct = signal.stop_pct
                take_profit = signal.take_profit_pct
                current_fraction = min(fraction_cap, position_fraction(config, max(signal.stop_pct, 0.002)))
                turnover += 1

        # 3) Mark to market and funding.
        if position != 0:
            exposure_bars += 1
            price_return = (candle.close / mark_price - 1.0) * position
            equity *= 1.0 + price_return * current_fraction
            gross *= 1.0 + price_return * current_fraction
            mark_price = candle.close
            funding = -funding_per_bar * position
            equity *= 1.0 + funding * current_fraction
            gross *= 1.0 + funding * current_fraction

        bar_return = equity - 1.0 if index == 0 else equity / (equity_curve[-1] if equity_curve else 1.0) - 1.0
        bar_returns.append(bar_return)
        equity_curve.append(equity)

    # Path-dependent metrics from the FINAL equity curve (no pre-exit values).
    peak = 1.0
    max_drawdown = 0.0
    for value in equity_curve:
        peak = max(peak, value)
        max_drawdown = max(max_drawdown, (peak - value) / peak)
    wins = [t.net_pct for t in trades if t.net_pct > 0]
    losses = [t.net_pct for t in trades if t.net_pct < 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    profit_factor = round(gross_profit / gross_loss, 6) if gross_loss > 0 else None
    bars = len(candles) or 1
    mean_return = sum(bar_returns) / bars
    variance = sum((r - mean_return) ** 2 for r in bar_returns) / bars
    stdev = math.sqrt(variance)
    sharpe = round(mean_return / stdev * math.sqrt(365 * 288), 6) if stdev > 0 else None
    downside = math.sqrt(sum(min(r, 0.0) ** 2 for r in bar_returns) / bars)
    sortino = round(mean_return / downside * math.sqrt(365 * 288), 6) if downside > 0 else None
    buy_hold_gross = (candles[-1].close / candles[0].close - 1.0) * 100.0
    buy_hold_net = ((candles[-1].close * (1.0 - slip - fee)) / (candles[0].close * (1.0 + slip + fee)) - 1.0) * 100.0
    return {
        'instrument': instrument,
        'bars': len(candles),
        'net_return_pct': round((equity - 1.0) * 100.0, 6),
        'gross_return_pct': round((gross - 1.0) * 100.0, 6),
        'max_drawdown_pct': round(max_drawdown * 100.0, 6),
        'total_trades': len(trades),
        'win_rate_pct': round(len(wins) / len(trades) * 100.0, 6) if trades else 0.0,
        'profit_factor': profit_factor,
        'expectancy_pct_per_trade': round(sum(t.net_pct for t in trades) / len(trades), 6) if trades else 0.0,
        'sharpe': sharpe,
        'sortino': sortino,
        'exposure_pct': round(exposure_bars / bars * 100.0, 6),
        'turnover_events': turnover,
        'liquidations': liquidations,
        'buy_hold_gross_pct': round(buy_hold_gross, 6),
        'buy_hold_net_pct': round(buy_hold_net, 6),
        'no_trade_return_pct': 0.0,
        'kill_switch_triggered': kill_active,
        'equity_curve': tuple(equity_curve),
        'trades': tuple(trades),
    }


__all__ = ['INSTRUMENTS', 'Trade', 'run_hybrid_backtest']
