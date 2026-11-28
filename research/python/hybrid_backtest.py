"""Deterministic M5 backtest for hybrid long/flat/short signals.

Signals are executed at the NEXT bar open, never at the close that produced
them. SPOT cannot short. FUTURES allows long/short with a 1x research baseline,
funding, spread/slippage/fee and a simplified isolated liquidation model.
No order is sent anywhere.

Accounting invariant: equity follows raw close-to-close price moves, is charged
the entry cost once when a position opens and the exit cost once when it closes.
A closed trade's ``net_pct`` therefore equals ``(exit_effective / entry_effective
- 1) * 100`` for a long and the mirrored ratio for a short, and the final equity
equals the compounded trade returns for a constant position fraction. The
previous implementation marked to market *and* re-applied the full trade return
at exit, double counting the holding-period move.
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


def _liquidation_price(entry: float, direction: int, leverage: float) -> float:
    """Isolated-margin price where equity equals the maintenance margin.

    At 1x a long can only be liquidated at zero and a short near a 2x rise,
    which is the mathematically correct behaviour the previous linear
    approximation missed.
    """
    if direction == 1:
        return max(0.0, entry * (1.0 - 1.0 / leverage) / (1.0 - MAINTENANCE_MARGIN))
    return entry * (1.0 + 1.0 / leverage) / (1.0 + MAINTENANCE_MARGIN)


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
    if not candles:
        raise ValueError('Candle tidak boleh kosong')
    fee = config.fee_bps_per_side / 10000.0
    slip = config.slippage_bps_per_side / 10000.0
    spread = config.spread_bps / 10000.0
    cost_rate = fee + slip + spread / 2.0
    funding_per_bar = config.funding_bps_per_day / 10000.0 * (300.0 / 86400.0)

    equity = 1.0
    gross = 1.0
    position = 0
    entry_effective = 0.0
    entry_raw = 0.0
    entry_time = ''
    entry_index = 0
    mark_price = 0.0
    stop_pct = 0.0
    take_profit = 0.0
    current_fraction = config.max_position
    trades: list[Trade] = []
    equity_curve: list[float] = []
    bar_returns: list[float] = []
    exposure_bars = 0
    turnover = 0
    liquidations = 0
    kill_active = False
    daily_halts = 0
    peak = 1.0
    active_target = 0
    active_expiry = -1
    current_day = ''
    day_start_equity = 1.0
    daily_halt = False

    def apply_price_move(price: float) -> None:
        """Mark equity/gross from the last mark to ``price`` (signed)."""
        nonlocal equity, gross, mark_price
        if position == 0:
            return
        move = (price / mark_price - 1.0) * position
        equity *= 1.0 + move * current_fraction
        gross *= 1.0 + move * current_fraction
        mark_price = price

    def close_position(exit_raw: float, time: str, index: int, reason: str) -> None:
        nonlocal equity, gross, position, mark_price, turnover
        if position == 0:
            return
        apply_price_move(exit_raw)
        equity *= 1.0 - cost_rate * current_fraction
        if position == 1:
            effective_exit = exit_raw * (1.0 - cost_rate)
            net_pct = (effective_exit / entry_effective - 1.0) * 100.0
            gross_pct = (exit_raw / entry_raw - 1.0) * 100.0
        else:
            effective_exit = exit_raw / (1.0 - cost_rate)
            net_pct = (entry_effective / effective_exit - 1.0) * 100.0
            gross_pct = (entry_raw / exit_raw - 1.0) * 100.0
        trades.append(Trade(entry_time, time, position, entry_effective, effective_exit,
                            gross_pct, net_pct, index - entry_index, reason))
        position = 0
        mark_price = 0.0
        turnover += 1

    def consume_signal() -> None:
        nonlocal active_target, active_expiry
        active_target = 0
        active_expiry = -1

    for index, candle in enumerate(candles):
        signal = signals[index]
        day = candle.timestamp[:10]
        if day != current_day:
            current_day = day
            day_start_equity = equity
            daily_halt = False

        # 1) Intrabar risk exit for an existing position, before any new target.
        if position != 0:
            stop_price = entry_raw * (1.0 - stop_pct) if position == 1 else entry_raw * (1.0 + stop_pct)
            tp_price = entry_raw * (1.0 + take_profit) if position == 1 else entry_raw * (1.0 - take_profit)
            liquidation = _liquidation_price(entry_raw, position, config.leverage)
            reason = ''
            exit_raw = 0.0
            if position == 1:
                adverse = max(stop_price, liquidation)
                if candle.low <= adverse:
                    reason = 'liquidation' if liquidation >= stop_price else 'stop_loss'
                    exit_raw = min(candle.open, adverse)
                elif candle.high >= tp_price:
                    reason = 'take_profit'
                    exit_raw = tp_price
            else:
                adverse = min(stop_price, liquidation)
                if candle.high >= adverse:
                    reason = 'liquidation' if liquidation <= stop_price else 'stop_loss'
                    exit_raw = max(candle.open, adverse)
                elif candle.low <= tp_price:
                    reason = 'take_profit'
                    exit_raw = tp_price
            if reason:
                if reason == 'liquidation' and instrument == 'FUTURES':
                    liquidations += 1
                    kill_active = True
                close_position(exit_raw, candle.timestamp, index, reason)
                consume_signal()

        # 2) Execute the signal at this bar's OPEN (signal used only prior data).
        if signal.target != 0 and signal.strategy in ('MOMENTUM', 'SCALP'):
            active_target = signal.target
            active_expiry = signal.expires_at
        if signal.bar_index > active_expiry:
            consume_signal()
        target = active_target
        if instrument == 'SPOT' and target == -1:
            target = 0
        if (kill_active or daily_halt) and target != 0:
            target = 0
        if target != position:
            if position != 0:
                close_position(candle.open, candle.timestamp, index, 'signal_exit')
            if target != 0:
                new_fraction = min(
                    config.max_position,
                    position_fraction(config, max(signal.stop_pct, 0.002)),
                )
                current_fraction = new_fraction
                position = target
                entry_raw = candle.open
                entry_effective = (
                    candle.open / (1.0 - cost_rate) if target == 1
                    else candle.open * (1.0 - cost_rate)
                )
                equity *= 1.0 - cost_rate * current_fraction
                entry_time = candle.timestamp
                entry_index = index
                mark_price = candle.open
                stop_pct = signal.stop_pct
                take_profit = signal.take_profit_pct
                turnover += 1

        # 3) Mark to market and charge funding.
        if position != 0:
            apply_price_move(candle.close)
            funding = -funding_per_bar * position
            equity *= 1.0 + funding * current_fraction
            gross *= 1.0 + funding * current_fraction
            exposure_bars += 1

        # 4) Portfolio risk halts are evaluated on the marked equity even when the
        # breach was realised by an exit, so a flat strategy cannot re-enter past
        # its drawdown or daily-loss limit.
        peak = max(peak, equity)
        drawdown = (peak - equity) / peak
        day_loss_pct = (day_start_equity - equity) / max(day_start_equity, 1e-9) * 100.0
        if not kill_active and drawdown > config.max_drawdown_stop_pct:
            if position != 0:
                close_position(candle.close, candle.timestamp, index, 'drawdown_stop')
            kill_active = True
            consume_signal()
        elif not daily_halt and day_loss_pct >= config.max_daily_loss_pct:
            if position != 0:
                close_position(candle.close, candle.timestamp, index, 'daily_loss_stop')
            daily_halt = True
            daily_halts += 1
            consume_signal()

        bar_return = equity - 1.0 if index == 0 else equity / (equity_curve[-1] if equity_curve else 1.0) - 1.0
        bar_returns.append(bar_return)
        equity_curve.append(equity)

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
    buy_hold_net = (
        (candles[-1].close * (1.0 - cost_rate)) / (candles[0].close * (1.0 + cost_rate)) - 1.0
    ) * 100.0
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
        'daily_loss_halts': daily_halts,
        'buy_hold_gross_pct': round(buy_hold_gross, 6),
        'buy_hold_net_pct': round(buy_hold_net, 6),
        'no_trade_return_pct': 0.0,
        'kill_switch_triggered': kill_active,
        'max_drawdown_stop_pct': config.max_drawdown_stop_pct,
        'max_daily_loss_pct': config.max_daily_loss_pct,
        'equity_curve': tuple(equity_curve),
        'trades': tuple(trades),
    }


__all__ = ['INSTRUMENTS', 'Trade', 'run_hybrid_backtest']
