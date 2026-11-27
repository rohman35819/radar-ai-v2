#!/usr/bin/env python3
"""Command 19/C — pre-registered Binance-only intraday hypotheses.

Research-only. No orders, ledger, worker, or paid service.
"""
from __future__ import annotations

import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path

from market_microstructure import observe_microstructure
from quant_data import Candle, Dataset, load_ohlcv
from volatility_intel import realized_vol_from_closes

ROOT = Path(__file__).parent
FIXTURES = ROOT / 'fixtures'
REGISTRY = ROOT / 'experiments' / 'binance_intraday_registry.json'
OUT = ROOT / 'output' / 'binance_intraday'
SYMBOLS = ('BTCUSDT', 'ETHUSDT')
COST = 0.0015


def vol_series(candles: list[Candle], end: int, period: int = 20) -> list[float | None]:
    values: list[float | None] = [None] * end
    closes = [bar.close for bar in candles[:end]]
    for index in range(period + 1, end + 1):
        if index <= len(closes):
            values[index - 1] = realized_vol_from_closes(closes[:index])
    return values


def liquidity_ok(candles: list[Candle], symbol: str, index: int) -> bool:
    if index < 60:
        return False
    return observe_microstructure(candles, symbol, index).liquidity_state == 'OK'


def volume_z(volumes: list[float], period: int) -> float | None:
    if len(volumes) < period:
        return None
    window = volumes[-period:]
    mean = math.fsum(window) / period
    var = math.fsum((value - mean) ** 2 for value in window) / period
    return (volumes[-1] - mean) / math.sqrt(var) if var > 0 else None


def entry_signal(strategy: str, candles: list[Candle], symbol: str, index: int, vols: list[float | None]) -> bool:
    if index < 80 or not liquidity_ok(candles, symbol, index):
        return False
    past = candles[:index]
    closes = [bar.close for bar in past]
    volumes = [bar.volume for bar in past]
    current = vols[index - 1]
    if current is None:
        return False
    history = [value for value in vols[max(0, index - 61):index - 1] if value is not None]
    if len(history) < 40:
        return False
    median = statistics.median(history)
    if strategy == 'I1':
        prior = statistics.fmean([value for value in history[-20:] if value is not None] or [median])
        sma = math.fsum(closes[-50:]) / 50
        return current > median * 1.5 and prior <= median and closes[-1] > sma
    vz = volume_z(volumes, 24)
    recent_regimes = [('HIGH' if value > median * 1.5 else 'LOW') for value in history[-3:]]
    return (vz is not None and vz >= 2.0 and 'LOW' in recent_regimes
            and recent_regimes[-1] == 'HIGH' and closes[-1] > closes[-2])


def exit_signal(strategy: str, candles: list[Candle], index: int, held: int, vols: list[float | None]) -> bool:
    if held >= 6:
        return True
    if strategy == 'I1':
        current = vols[index - 1]
        history = [value for value in vols[max(0, index - 61):index - 1] if value is not None]
        return current is not None and bool(history) and current < statistics.median(history)
    vz = volume_z([bar.volume for bar in candles[:index]], 24)
    return vz is not None and vz <= 0.0


def run_segment(dataset: Dataset, symbol: str, strategy: str, start: int, end: int) -> dict:
    candles = list(dataset.candles)
    vols = vol_series(candles, len(candles))
    equity = 1.0
    peak = 1.0
    max_dd = 0.0
    position = False
    entry = 0.0
    entry_index = 0
    trades: list[float] = []
    turnover = 0
    for index in range(start, end):
        if not position:
            if entry_signal(strategy, candles, symbol, index, vols):
                entry = candles[index].open * (1.0 + COST)
                position = True
                entry_index = index
                turnover += 1
        elif exit_signal(strategy, candles, index, index - entry_index, vols):
            exit_price = candles[index].open * (1.0 - COST)
            trades.append(exit_price / entry - 1.0)
            equity *= 1.0 + trades[-1]
            position = False
            turnover += 1
        marked = equity * (1.0 + (candles[index].close / entry - 1.0)) if position and entry else equity
        peak = max(peak, marked)
        max_dd = max(max_dd, (peak - marked) / peak)
    if position:
        exit_price = candles[end - 1].close * (1.0 - COST)
        trades.append(exit_price / entry - 1.0)
        equity *= 1.0 + trades[-1]
    wins = [value for value in trades if value > 0]
    losses = [value for value in trades if value < 0]
    profit = math.fsum(wins)
    loss = abs(math.fsum(losses))
    return {
        'net_return_pct': round((equity - 1.0) * 100.0, 6),
        'gross_return_pct': round(math.fsum(trades) * 100.0, 6),
        'max_drawdown_pct': round(max_dd * 100.0, 6),
        'trades': len(trades), 'turnover': turnover,
        'win_rate_pct': round(len(wins) / len(trades) * 100.0, 6) if trades else 0.0,
        'profit_factor': round(profit / loss, 6) if loss > 0 else None,
        'expectancy_pct': round(math.fsum(trades) / len(trades) * 100.0, 6) if trades else 0.0,
        'exposure_pct': round(turnover / max(1, end - start) * 100.0, 6),
    }


def main() -> int:
    registry = json.loads(REGISTRY.read_text(encoding='utf-8'))
    datasets = {symbol: load_ohlcv(FIXTURES / f'{symbol.lower()}_4h_binance.csv',
                                   source='public', symbol=symbol, interval='4h', data_kind='public_api')
                for symbol in SYMBOLS}
    total = len(datasets['BTCUSDT'].candles)
    split = int(total * 0.6)
    folds = []
    for start in (600, 700, 800, 900):
        end = min(start + 50, total)
        per_symbol = {symbol: {name: run_segment(datasets[symbol], symbol, name, start, end)
                               for name in ('I1', 'I2')} for symbol in SYMBOLS}
        folds.append({'start': start, 'end': end, 'symbols': per_symbol})
    summary = {}
    for name in ('I1', 'I2'):
        items = [fold['symbols'][symbol][name] for fold in folds for symbol in SYMBOLS]
        trades = sum(item['trades'] for item in items)
        positive = sum(1 for item in items if item['net_return_pct'] > 0)
        summary[name] = {
            'oos_trades': trades,
            'avg_net_pct': round(math.fsum(item['net_return_pct'] for item in items) / len(items), 6),
            'max_drawdown_pct': round(max(item['max_drawdown_pct'] for item in items), 6),
            'positive_folds': positive, 'total_folds': len(items),
            'accepted': (trades >= registry['criteria']['min_oos_trades']
                         and max(item['max_drawdown_pct'] for item in items) <= registry['criteria']['max_oos_drawdown_pct']
                         and positive * 2 > len(items)),
        }
    baselines = {}
    for symbol in SYMBOLS:
        first = datasets[symbol].candles[split].open * (1.0 + COST)
        last = datasets[symbol].candles[total - 1].close * (1.0 - COST)
        baselines[symbol] = {'no_trade_net_pct': 0.0,
                             'buy_hold_net_pct': round((last / first - 1.0) * 100.0, 6)}
    report = {
        'schema_version': 'binance-intraday-experiment.v1',
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'registry_version': registry['registry_version'],
        'criteria': registry['criteria'],
        'data_provenance': {symbol: dataset.provenance for symbol, dataset in datasets.items()},
        'split': {'in_sample_bars': split, 'oos_bars': total - split},
        'baselines': baselines, 'folds': folds, 'summary': summary,
        'limitations': ['4h OHLCV only; no historical order book or options data.',
                        'No live order, ledger or reconciliation; results are historical simulations.'],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / 'report.json'
    path.write_text(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'summary': summary, 'baselines': baselines, 'report': str(path)}, indent=2, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
