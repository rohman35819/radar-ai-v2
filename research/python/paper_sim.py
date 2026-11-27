"""Isolated in-memory paper simulator for tiered trade plans.

Research-only. No ledger file, no database, no reconciliation runtime, no exchange
call, no order, no funds. All fills are simulated from committed OHLCV bars with
explicit fee/slippage/spread assumptions.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping, Sequence

from quant_data import Candle
from signal_engine import TradePlan

FEE_BPS = 5.0
SLIPPAGE_BPS = 5.0
SPREAD_BPS = 5.0
COST_RATE = (FEE_BPS + SLIPPAGE_BPS + SPREAD_BPS) / 10000.0
LIMITATIONS = ('IN_MEMORY_ONLY', 'NO_PERSISTENT_LEDGER', 'NO_RECONCILIATION_RUNTIME',
               'NOT_LIVE_TRADING', 'BACKTEST_RESULTS_ARE_NOT_FUTURE_GUARANTEES')


class SimError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class SimResult:
    schema_version: str
    equity_curve: tuple[float, ...]
    fills: tuple[Mapping[str, object], ...]
    net_return_pct: float
    max_drawdown_pct: float
    total_trades: int
    win_rate_pct: float
    profit_factor: float | None
    expectancy_pct: float
    exposure_pct: float
    kill_switch_triggered: bool
    limitations: tuple[str, ...]

    def to_dict(self) -> dict:
        return {
            'schema_version': self.schema_version,
            'equity_curve': [round(value, 8) for value in self.equity_curve],
            'fills': [dict(fill) for fill in self.fills],
            'net_return_pct': self.net_return_pct,
            'max_drawdown_pct': self.max_drawdown_pct,
            'total_trades': self.total_trades,
            'win_rate_pct': self.win_rate_pct,
            'profit_factor': self.profit_factor,
            'expectancy_pct': self.expectancy_pct,
            'exposure_pct': self.exposure_pct,
            'kill_switch_triggered': self.kill_switch_triggered,
            'limitations': list(self.limitations),
        }


def simulate(
    candles: Sequence[Candle],
    plan: TradePlan,
    *,
    start_index: int,
    equity: float = 1.0,
    risk_fraction: float = 0.01,
    max_exposure: float = 1.0,
    max_drawdown_pct: float = 25.0,
) -> SimResult:
    """Execute a plan at bar `start_index` open using only prior-bar information."""
    if plan.decision != 'BUY_SETUP' or plan.stop_loss is None or plan.tp1 is None:
        return SimResult('paper-sim.v1', (equity,), (), 0.0, 0.0, 0, 0.0, None, 0.0,
                         0.0, False, ('NO_TRADE_PLAN',) + LIMITATIONS)
    if not 0 <= start_index < len(candles) or risk_fraction <= 0 or max_exposure <= 0:
        raise SimError('INVALID_INPUT')
    entry = plan.entry_high or plan.tp1
    stop = plan.stop_loss
    risk_distance = (entry - stop) / entry
    if not 0 < risk_distance <= 0.5:
        raise SimError('INVALID_STOP_DISTANCE')
    fraction = min(risk_fraction / risk_distance, max_exposure)
    if fraction <= 0:
        raise SimError('NO_CAPACITY')

    curve = [equity]
    fills: list[dict] = []
    peak = equity
    max_dd = 0.0
    killed = False
    position = 0.0
    remaining = 0.0
    entry_price = 0.0
    tiers = (plan.tp1, plan.tp2, plan.tp3)
    tier_index = 0
    bars_in_position = 0

    def fill(kind: str, price: float, qty: float, index: int) -> float:
        nonlocal equity
        adverse = 1.0 + COST_RATE if kind == 'buy' else 1.0 - COST_RATE
        fill_price = price * adverse
        equity *= 1.0 + qty * (fill_price / entry_price - 1.0) if entry_price else 1.0
        pnl = qty * (fill_price / entry_price - 1.0) if kind == 'sell' and entry_price else 0.0
        fills.append({'bar': index, 'kind': kind, 'qty': round(qty, 8),
                      'price': round(fill_price, 8), 'cost_bps': 15.0, 'pnl': round(pnl, 8)})
        return fill_price

    for index in range(start_index, len(candles)):
        bar = candles[index]
        if position == 0 and not killed:
            entry_price = fill('buy', bar.open, fraction, index)
            position = fraction
            remaining = fraction
            tier_index = 0
        if position > 0:
            bars_in_position += 1
            if bar.low <= stop:
                fill('sell', min(bar.open, stop), remaining, index)
                position = 0.0
                remaining = 0.0
            else:
                while tier_index < len(tiers) and tiers[tier_index] is not None and bar.high >= float(tiers[tier_index]):
                    qty = fraction / 3.0
                    fill('sell', float(tiers[tier_index]), qty, index)
                    remaining -= qty
                    tier_index += 1
                    if remaining <= 1e-9:
                        position = 0.0
                        remaining = 0.0
                        break
        # Drawdown uses marked equity so an open adverse position is visible.
        marked = equity * (1.0 + position * (bar.close / entry_price - 1.0)) if position > 0 and entry_price else equity
        peak = max(peak, marked)
        dd = (peak - marked) / peak
        max_dd = max(max_dd, dd)
        if dd * 100.0 > max_drawdown_pct and position > 0:
            fill('sell', bar.close, remaining, index)
            position = 0.0
            remaining = 0.0
            killed = True
        curve.append(equity)

    trade_pnls = [value for value in (item.get('pnl') for item in fills) if isinstance(value, (int, float))]
    wins = [value for value in trade_pnls if value > 0]
    losses = [value for value in trade_pnls if value < 0]
    profit_factor = round(math.fsum(wins) / abs(math.fsum(losses)), 6) if losses and math.fsum(losses) != 0 else None
    return SimResult(
        'paper-sim.v1', tuple(curve), tuple(fills),
        round((equity - 1.0) * 100.0, 6), round(max_dd * 100.0, 6),
        len([item for item in fills if item['kind'] == 'buy']),
        round(len(wins) / len(trade_pnls) * 100.0, 6) if trade_pnls else 0.0,
        profit_factor,
        round(math.fsum(trade_pnls) / len(trade_pnls), 6) if trade_pnls else 0.0,
        round(bars_in_position / max(1, len(candles) - start_index) * 100.0, 6),
        killed,
        LIMITATIONS,
    )
