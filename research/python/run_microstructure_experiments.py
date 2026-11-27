#!/usr/bin/env python3
"""Run pre-registered microstructure/volatility hypotheses on committed fixtures.

Research-only. No new data, no orders, no ledger, no worker.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping

from quant_data import Dataset, load_ohlcv
from quantum_scan import AssetFeatures, compute_features, scan
from signal_engine import build_plan
from paper_sim import simulate

ROOT = Path(__file__).parent
FIXTURES = ROOT / 'fixtures'
REGISTRY = ROOT / 'experiments' / 'microstructure_registry.json'
OUT = ROOT / 'output' / 'microstructure_experiments'
FOLDS = (250, 270, 290, 310, 330)
REQUIRED = ('BTCUSDT', 'ETHUSDT')


def load_data() -> Mapping[str, Dataset]:
    return {symbol: load_ohlcv(FIXTURES / f'{symbol.lower()}_1d_public.csv',
                               source='public-fixture', symbol=symbol, interval='1d',
                               data_kind='public_api') for symbol in REQUIRED}


def baseline_selection(datasets: Mapping[str, Dataset], end: int, evaluated_at: str) -> str | None:
    """Prior cross-asset logic: LOW_VOL_UP + positive score, select by score only."""
    items = [compute_features(datasets[s], end, s) for s in REQUIRED]
    if all(item.regime == 'LOW_VOL_UP' and item.score > 0 for item in items):
        return max(items, key=lambda item: item.score).symbol
    return None


def low_vol_selection(features: Mapping[str, AssetFeatures]) -> str | None:
    eligible = [item for item in features.values()
                if item.regime == 'LOW_VOL_UP' and item.score > 0
                and item.volatility and item.volatility.get('regime') != 'HIGH_VOL']
    if not eligible:
        return None
    return min(eligible, key=lambda item: item.volatility['percentile']).symbol


def evaluate(symbol: str | None, datasets: Mapping[str, Dataset], end: int) -> dict:
    if not symbol:
        return {'decision': 'NO_TRADE', 'net_pct': 0.0, 'drawdown_pct': 0.0, 'trades': 0}
    plan = build_plan_from_symbol(symbol, datasets, end)
    sim = simulate(datasets[symbol].candles, plan, start_index=end)
    return {'decision': plan.decision, 'net_pct': sim.net_return_pct,
            'drawdown_pct': sim.max_drawdown_pct, 'trades': sim.total_trades}


def build_plan_from_symbol(symbol: str, datasets: Mapping[str, Dataset], end: int):
    from signal_engine import TradePlan
    features = compute_features(datasets[symbol], end, symbol, enrich=True)
    if features.volatility is None or features.microstructure is None:
        return TradePlan('trade-plan.v1', 'NO_TRADE', None, None, None, None,
                         None, None, None, (), 0.0, ('INSUFFICIENT_DATA',))
    entry = features.close
    atr = features.atr
    stop = entry - 1.5 * atr
    return TradePlan('trade-plan.v1', 'BUY_SETUP', symbol,
                     round(entry - 0.25 * atr, 8), round(entry + 0.25 * atr, 8), round(stop, 8),
                     round(entry + 1.5 * atr, 8), round(entry + 3.0 * atr, 8),
                     round(entry + 4.5 * atr, 8), (1.0, 2.0, 3.0),
                     round(min(0.95, features.score / (features.score + 1.0)), 6),
                     tuple(features.reasons))


def main() -> int:
    registry = json.loads(REGISTRY.read_text(encoding='utf-8'))
    datasets = load_data()
    OUT.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    for end in FOLDS:
        ts = datasets['BTCUSDT'].candles[end - 1].timestamp
        result = scan(datasets, ts, end_by_symbol={symbol: end for symbol in REQUIRED},
                      max_age_ms=365 * 24 * 3600 * 1000)
        features = {item.symbol: item for item in result.features}
        baseline = baseline_selection(datasets, end, ts)
        lowvol = low_vol_selection(features)
        rows.append({
            'fold': len(rows) + 1, 'end_index': end, 'evaluated_at': ts,
            'scan_decision': result.decision, 'scan_reasons': list(result.reasons),
            'baseline_symbol': baseline, 'baseline': evaluate(baseline, datasets, end),
            'h1_symbol': result.selected_symbol, 'h1': evaluate(result.selected_symbol, datasets, end),
            'h2_symbol': lowvol, 'h2': evaluate(lowvol, datasets, end),
        })
    criteria = registry['criteria']
    summary = {}
    for key in ('baseline', 'h1', 'h2'):
        values = [row[key] for row in rows]
        trades = sum(item['trades'] for item in values)
        positive = sum(1 for item in values if item['net_pct'] > 0)
        summary[key] = {
            'oos_trades': trades,
            'oos_net_pct': round(sum(item['net_pct'] for item in values), 6),
            'max_drawdown_pct': round(max(item['drawdown_pct'] for item in values), 6),
            'positive_folds': positive, 'total_folds': len(values),
            'accepted': (trades >= criteria['min_oos_trades']
                         and max(item['drawdown_pct'] for item in values) <= criteria['max_oos_drawdown_pct']
                         and positive * 2 > len(values)),
        }
    report = {
        'schema_version': 'microstructure-experiment.v1',
        'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'registry_version': registry['registry_version'],
        'data_provenance': {symbol: dataset.provenance for symbol, dataset in datasets.items()},
        'criteria': criteria,
        'folds': rows,
        'summary': summary,
        'limitations': [
            'Spread/depth/order-book imbalance are OHLCV proxies, not observed quotes.',
            'No options data; delta/gamma/theta/vega and implied volatility remain deferred.',
            'No live orders, ledger or reconciliation; results are historical simulations.',
        ],
    }
    path = OUT / 'report.json'
    path.write_text(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'summary': summary, 'report': str(path)}, indent=2, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
