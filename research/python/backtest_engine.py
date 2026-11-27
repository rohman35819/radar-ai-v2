"""Research backtest engine with explicit costs and no look-ahead.

Signal for bar i comes from bar i-1 (see strategy.py); execution occurs at
bar i open with fee + slippage. Funding is charged only while a position is
held. A kill switch stops re-entry after a drawdown breach. No exchange call.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from typing import Any, Sequence

from quant_data import INTERVAL_SECONDS, Dataset
from strategy import Signal, StrategyConfig

SCHEMA_VERSION = "1.0.0"


@dataclass(frozen=True)
class Trade:
    entry_time: str
    exit_time: str
    entry_price: float
    exit_price: float
    gross_pct: float
    net_pct: float
    funding_pct: float
    bars_held: int
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "entry_time": self.entry_time,
            "exit_time": self.exit_time,
            "entry_price": round(self.entry_price, 8),
            "exit_price": round(self.exit_price, 8),
            "gross_pct": round(self.gross_pct, 6),
            "net_pct": round(self.net_pct, 6),
            "funding_pct": round(self.funding_pct, 6),
            "bars_held": self.bars_held,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class BacktestResult:
    config: StrategyConfig
    metrics: dict[str, Any]
    trades: tuple[Trade, ...]
    equity_curve: tuple[float, ...]

    def to_dict(self, include_trades: bool = True, max_trades: int = 200) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "schema_version": SCHEMA_VERSION,
            "engine": "sma_crossover_long_flat_v1",
            "config": self.config.to_dict(),
            "metrics": dict(self.metrics),
            "equity_curve": [round(value, 8) for value in self.equity_curve],
        }
        if include_trades:
            payload["trades"] = [trade.to_dict() for trade in self.trades[:max_trades]]
            payload["trades_omitted"] = max(0, len(self.trades) - max_trades)
        return payload


def _ratio(values: Sequence[float], bars_per_year: float, kind: str) -> float | None:
    if len(values) < 30:
        return None
    mean = statistics.fmean(values)
    if kind == "sharpe":
        deviation = statistics.stdev(values)
    else:
        downside = [value for value in values if value < 0]
        if len(downside) < 2:
            return None
        deviation = math.sqrt(statistics.fmean([value * value for value in downside]))
    if deviation <= 0 or not math.isfinite(deviation):
        return None
    return round(mean / deviation * math.sqrt(bars_per_year), 6)


def run_backtest(dataset: Dataset, config: StrategyConfig, signals: Sequence[Signal]) -> BacktestResult:
    """Execute signals on one contiguous dataset segment."""
    config.validate()
    rows = dataset.candles
    if len(signals) != len(rows):
        raise ValueError("Jumlah signal harus sama dengan jumlah candle")
    interval = dataset.quality.interval
    if interval not in INTERVAL_SECONDS:
        raise ValueError("Interval dataset tidak didukung")
    step_seconds = INTERVAL_SECONDS[interval]
    bars_per_year = (365 * 24 * 3600) / step_seconds

    fee = config.fee_bps / 10000.0
    slip = config.slippage_bps / 10000.0
    funding_per_bar = config.funding_bps_per_day / 10000.0 * (step_seconds / 86400.0)
    fraction = config.position_fraction

    equity = 1.0
    gross_equity = 1.0
    peak = 1.0
    max_drawdown = 0.0
    position = 0
    mark_price: float | None = None
    entry_price = 0.0
    entry_time = ""
    entry_index = 0
    trade_funding = 0.0
    cooldown = False
    kill_active = False
    trades: list[Trade] = []
    equity_curve: list[float] = []
    bar_returns: list[float] = []
    bars_in_position = 0
    position_changes = 0

    for index, candle in enumerate(rows):
        target = int(signals[index].target_position) if signals[index].target_position in (0, 1) else 0

        if position == 1:
            stop_price = entry_price * (1.0 - config.stop_loss_pct)
            if candle.low <= stop_price:
                fill = min(candle.open, stop_price) * (1.0 - slip - fee)
                net = fill / entry_price - 1.0
                gross = min(candle.open, stop_price) / entry_price - 1.0
                trades.append(Trade(entry_time, candle.timestamp, entry_price, fill, gross, net, trade_funding,
                                    index - entry_index, "stop_loss"))
                equity *= 1.0 + net * fraction
                gross_equity *= 1.0 + gross * fraction
                position = 0
                mark_price = None
                trade_funding = 0.0
                cooldown = True
                position_changes += 1

        if target != position and not cooldown and not kill_active:
            if target == 1:
                entry_price = candle.open * (1.0 + slip + fee)
                entry_time = candle.timestamp
                entry_index = index
                trade_funding = 0.0
                position = 1
                mark_price = candle.close
            else:
                fill = candle.open * (1.0 - slip - fee)
                net = fill / entry_price - 1.0
                gross = candle.open / entry_price - 1.0
                trades.append(Trade(entry_time, candle.timestamp, entry_price, fill, gross, net, trade_funding,
                                    index - entry_index, "signal_exit"))
                equity *= 1.0 + net * fraction
                gross_equity *= 1.0 + gross * fraction
                position = 0
                mark_price = None
                trade_funding = 0.0
            position_changes += 1
        cooldown = False

        if position == 1:
            if mark_price is None:
                mark_price = candle.close
            price_return = candle.close / mark_price - 1.0
            equity *= 1.0 + price_return * fraction
            gross_equity *= 1.0 + price_return * fraction
            mark_price = candle.close
            funding_pct = -funding_per_bar * fraction
            trade_funding += funding_pct
            equity *= 1.0 + funding_pct
            bars_in_position += 1
        peak = max(peak, equity)
        drawdown = (peak - equity) / peak

        # Apply the kill switch BEFORE recording this bar, so the equity curve,
        # per-bar returns and reported drawdown describe the same final equity.
        if kill_active is False and drawdown > config.max_drawdown_stop_pct and position == 1:
            fill = candle.close * (1.0 - slip - fee)
            net = fill / entry_price - 1.0
            gross = candle.close / entry_price - 1.0
            trades.append(Trade(entry_time, candle.timestamp, entry_price, fill, gross, net, trade_funding,
                                index - entry_index + 1, "drawdown_stop"))
            equity *= 1.0 + net * fraction
            gross_equity *= 1.0 + gross * fraction
            position = 0
            mark_price = None
            kill_active = True
            peak = max(peak, equity)
            drawdown = (peak - equity) / peak

        max_drawdown = max(max_drawdown, drawdown)
        bar_return = equity - 1.0 if index == 0 else equity / (equity_curve[-1] if equity_curve else 1.0) - 1.0
        bar_returns.append(bar_return)
        equity_curve.append(equity)

    net_return = (equity - 1.0) * 100.0
    gross_return = (gross_equity - 1.0) * 100.0
    wins = [trade.net_pct for trade in trades if trade.net_pct > 0]
    losses = [trade.net_pct for trade in trades if trade.net_pct < 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    profit_factor = round(gross_profit / gross_loss, 6) if gross_loss > 0 else None
    buy_hold_gross = (rows[-1].close / rows[0].close - 1.0) * 100.0
    buy_hold_net = ((rows[-1].close * (1.0 - slip - fee)) / (rows[0].close * (1.0 + slip + fee)) - 1.0) * 100.0

    metrics: dict[str, Any] = {
        "start": rows[0].timestamp,
        "end": rows[-1].timestamp,
        "bars": len(rows),
        "interval": interval,
        "gross_return_pct": round(gross_return, 6),
        "net_return_pct": round(net_return, 6),
        "max_drawdown_pct": round(max_drawdown * 100.0, 6),
        "total_trades": len(trades),
        "win_rate_pct": round(len(wins) / len(trades) * 100.0, 6) if trades else 0.0,
        "profit_factor": profit_factor,
        "expectancy_pct_per_trade": round(statistics.fmean([t.net_pct for t in trades]), 6) if trades else 0.0,
        "exposure_pct": round(bars_in_position / len(rows) * 100.0, 6),
        "position_changes": position_changes,
        "turnover_events": position_changes,
        "sharpe": _ratio(bar_returns, bars_per_year, "sharpe"),
        "sortino": _ratio(bar_returns, bars_per_year, "sortino"),
        "buy_hold_gross_pct": round(buy_hold_gross, 6),
        "buy_hold_net_pct": round(buy_hold_net, 6),
        "no_trade_return_pct": 0.0,
        "kill_switch_triggered": kill_active,
        "fee_bps_per_side": config.fee_bps,
        "slippage_bps_per_side": config.slippage_bps,
        "funding_bps_per_day": config.funding_bps_per_day,
        "position_fraction": fraction,
        "stop_loss_pct": config.stop_loss_pct,
        "max_drawdown_stop_pct": config.max_drawdown_stop_pct,
        "cost_bps_per_turn": config.fee_bps + config.slippage_bps,
    }
    return BacktestResult(config=config, metrics=metrics, trades=tuple(trades), equity_curve=tuple(equity_curve))
