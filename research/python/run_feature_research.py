#!/usr/bin/env python3
"""Command 19 Jalur B: run pre-registered feature hypotheses on 2023 fixtures.

Chronological split + walk-forward, costs 15 bps/side, no grid search.
Research-only: no orders, ledger, worker or live data claim.
"""
from __future__ import annotations

import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping, Sequence

from market_microstructure import observe_microstructure
from quant_data import Candle, Dataset, load_ohlcv
from volatility_intel import realized_vol_from_closes

ROOT = Path(__file__).parent
FIXTURES = ROOT / 'fixtures'
REGISTRY = ROOT / 'experiments' / 'feature_research_registry.json'
OUT = ROOT / 'output' / 'feature_research'
SYMBOLS = ('BTCUSDT', 'ETHUSDT')
COST = 0.0015  # 15 bps per side turn


class FeatureError(ValueError):
    pass


def zscore(values: Sequence[float], period: int) -> float | None:
    if len(values) < period:
        return None
    window = values[-period:]
    mean = math.fsum(window) / period
    var = math.fsum((value - mean) ** 2 for value in window) / period
    return (values[-1] - mean) / math.sqrt(var) if var > 0 else None


def volume_z(volumes: Sequence[float], period: int) -> float | None:
    return zscore(volumes, period)


def vol_regime(closes: Sequence[float]) -> str:
    if len(closes) < 120:
        return 'UNKNOWN'
    current = realized_vol_from_closes(closes)
    history = [realized_vol_from_closes(closes[:i]) for i in range(100, len(closes) + 1)]
    median = statistics.median(history[-60:])
    if current > median * 1.5:
        return 'HIGH_VOL'
    return 'LOW_VOL' if current < median * 0.75 else 'NORMAL_VOL'


def liquidity_ok(candles: Sequence[Candle], symbol: str, index: int) -> bool:
    if index < 60:
        return False
    return observe_microstructure(candles, symbol, index).liquidity_state == 'OK'


def entry_signal(strategy: str, candles: Sequence[Candle], symbol: str, index: int) -> bool:
    if index < 60:
        return False
    past = candles[:index]
    closes = [bar.close for bar in past]
    volumes = [bar.volume for bar in past]
    if not liquidity_ok(candles, symbol, index):
        return False
    if strategy == 'F1':
        score = zscore(closes, 10)
        return score is not None and score <= -1.2 and vol_regime(closes) in ('LOW_VOL', 'NORMAL_VOL')
    if strategy == 'F2':
        vz = volume_z(volumes, 20)
        return vz is not None and vz >= 2.0 and closes[-1] > closes[-2]
    raise FeatureError('UNKNOWN_STRATEGY')


def exit_signal(strategy: str, candles: Sequence[Candle], index: int, held: int) -> bool:
    if held >= 3:
        return True
    past = candles[:index]
    if strategy == 'F1':
        score = zscore([bar.close for bar in past], 10)
        return score is not None and score >= -0.2
    vz = volume_z([bar.volume for bar in past], 20)
    return vz is not None and vz <= 0.0


def run_segment(dataset: Dataset, symbol: str, strategy: str, start: int, end: int) -> dict:
    candles = dataset.candles
    equity = 1.0
    peak = 1.0
    max_dd = 0.0
    position = False
    entry_price = 0.0
    entry_index = 0
    trades: list[float] = []
    turnover = 0
    for index in range(start, end):
        if not position:
            if entry_signal(strategy, candles, symbol, index):
                entry_price = candles[index].open * (1.0 + COST)
                position = True
                entry_index = index
                turnover += 1
        elif exit_signal(strategy, candles, index, index - entry_index):
            exit_price = candles[index].open * (1.0 - COST)
            trades.append(exit_price / entry_price - 1.0)
            equity *= 1.0 + trades[-1]
            position = False
            turnover += 1
        marked = equity * (1.0 + (candles[index].close / entry_price - 1.0)) if position and entry_price else equity
        peak = max(peak, marked)
        max_dd = max(max_dd, (peak - marked) / peak)
    if position:
        exit_price = candles[end - 1].close * (1.0 - COST)
        trades.append(exit_price / entry_price - 1.0)
        equity *= 1.0 + trades[-1]
    wins = sum(1 for value in trades if value > 0)
    losses = [value for value in trades if value < 0]
    profit = math.fsum(value for value in trades if value > 0)
    loss = abs(math.fsum(losses))
    return {
        'strategy': strategy, 'start': candles[start].timestamp, 'end': candles[end - 1].timestamp,
        'gross_return_pct': round(math.fsum(trades) * 100.0, 6),
        'net_return_pct': round((equity - 1.0) * 100.0, 6),
        'max_drawdown_pct': round(max_dd * 100.0, 6),
        'trades': len(trades), 'win_rate_pct': round(wins / len(trades) * 100.0, 6) if trades else 0.0,
        'profit_factor': round(profit / loss, 6) if loss > 0 else None,
        'expectancy_pct': round(math.fsum(trades) / len(trades) * 100.0, 6) if trades else 0.0,
        'turnover_events': turnover,
        'exposure_pct': round(turnover / max(1, end - start) * 100.0, 6),
    }


def buy_hold(dataset: Dataset, start: int, end: int) -> dict:
    first = dataset.candles[start].open * (1.0 + COST)
    last = dataset.candles[end - 1].close * (1.0 - COST)
    return {'net_return_pct': round((last / first - 1.0) * 100.0, 6)}


def main() -> int:
    registry = json.loads(REGISTRY.read_text(encoding='utf-8'))
    datasets = {symbol: load_ohlcv(FIXTURES / f'{symbol.lower()}_1d_2023.csv',
                                   source='public', symbol=symbol, interval='1d',
                                   data_kind='public_api') for symbol in SYMBOLS}
    total = len(datasets['BTCUSDT'].candles)
    split = int(total * 0.6)
    oos_start = split
    folds = []
    for start in (220, 250, 280, 310):
        end = min(start + 40, total)
        per_symbol = {}
        for symbol in SYMBOLS:
            per_symbol[symbol] = {
                'F1': run_segment(datasets[symbol], symbol, 'F1', start, end),
                'F2': run_segment(datasets[symbol], symbol, 'F2', start, end),
            }
        folds.append({'start_index': start, 'end_index': end, 'symbols': per_symbol})
    summary = {}
    for strategy in ('F1', 'F2'):
        items = [fold['symbols'][symbol][strategy] for fold in folds for symbol in SYMBOLS]
        trades = sum(item['trades'] for item in items)
        positive = sum(1 for item in items if item['net_return_pct'] > 0)
        summary[strategy] = {
            'oos_trades': trades,
            'oos_net_pct': round(math.fsum(item['net_return_pct'] for item in items) / len(items), 6),
            'max_drawdown_pct': round(max(item['max_drawdown_pct'] for item in items), 6),
            'positive_folds': positive, 'total_folds': len(items),
            'accepted': (trades >= registry['criteria']['min_oos_trades']
                         and max(item['max_drawdown_pct'] for item in items) <= registry['criteria']['max_oos_drawdown_pct']
                         and positive * 2 > len(items)),
        }
    report = {
        'schema_version': 'feature-research.v1',
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'registry_version': registry['registry_version'],
        'criteria': registry['criteria'],
        'data_provenance': {symbol: dataset.provenance for symbol, dataset in datasets.items()},
        'split': {'in_sample_bars': split, 'oos_bars': total - split},
        'baselines': {symbol: {
            'no_trade_net_pct': 0.0,
            'buy_hold': buy_hold(datasets[symbol], oos_start, total),
        } for symbol in SYMBOLS},
        'folds': folds,
        'summary': summary,
        'limitations': [
            'Order-book depth/actual spread unavailable; liquidity is an OHLCV proxy.',
            'No options data; no Greeks or implied volatility used.',
            'No live order, ledger, reconciliation or worker; results are historical simulations.',
        ],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / 'report.json'
    path.write_text(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'summary': summary, 'baselines': report['baselines'], 'report': str(path)}, indent=2, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
