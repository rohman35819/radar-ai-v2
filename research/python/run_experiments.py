#!/usr/bin/env python3
"""Run pre-registered quant experiments and persist every result, including failures.

Criteria come from experiments/registry.json and are never changed here.
No exchange order, no live trading, no paid service.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from backtest_engine import run_backtest
from quant_data import freshness_report, load_ohlcv
from report import RunMeta, build_report, write_report
from strategy import StrategyConfig, generate_signals
from validation import candidate_config, run_validation

ROOT = Path(__file__).parent
DEFAULT_REGISTRY = ROOT / 'experiments' / 'registry.json'
DEFAULT_DATA = ROOT / 'fixtures'
DEFAULT_OUT = ROOT / 'output' / 'experiments'


def provenance_for(csv_path: Path) -> dict[str, Any]:
    sidecar = csv_path.with_suffix('.provenance.json')
    meta = json.loads(sidecar.read_text(encoding='utf-8')) if sidecar.exists() else {}
    return {
        'source': meta.get('source', str(csv_path)),
        'symbol': meta.get('symbol', csv_path.stem.upper()),
        'interval': meta.get('interval', '1d'),
        'retrieved_at': meta.get('retrieved_at'),
        'data_kind': meta.get('data_kind', 'public_api'),
    }


def run_one(
    experiment: Mapping[str, Any],
    symbol: str,
    registry: Mapping[str, Any],
    data_dir: Path,
    out_dir: Path,
) -> dict[str, Any]:
    suffix = registry.get('data', {}).get('file_suffix', '_1d_public')
    csv_path = data_dir / f'{symbol.lower()}{suffix}.csv'
    dataset = load_ohlcv(
        csv_path,
        source=provenance_for(csv_path)['source'],
        symbol=provenance_for(csv_path)['symbol'],
        interval=provenance_for(csv_path)['interval'],
        retrieved_at=provenance_for(csv_path)['retrieved_at'],
        data_kind=provenance_for(csv_path)['data_kind'],
    )
    criteria = registry['criteria']
    costs = registry.get('cost_assumptions', {})
    fee_bps = costs.get('fee_bps_per_side', criteria.get('costs_bps_per_side', 15.0) / 2)
    slippage_bps = costs.get('slippage_bps_per_side', criteria.get('costs_bps_per_side', 15.0) / 2)
    spread_bps = costs.get('spread_bps_per_side', 0.0)
    base = StrategyConfig(
        strategy_id=str(experiment['strategy']),
        fee_bps=fee_bps,
        slippage_bps=slippage_bps,
        spread_bps=spread_bps,
        funding_bps_per_day=criteria['funding_bps_per_day'],
        position_fraction=criteria['position_fraction'],
        stop_loss_pct=criteria['stop_loss_pct'],
        max_drawdown_stop_pct=criteria['max_drawdown_stop_pct'],
    )
    validation = run_validation(dataset, base, list(experiment['grid']))
    selected_params = validation['selected_parameters']['params']
    selected_config = candidate_config(base, selected_params)
    signals = generate_signals(dataset.candles, selected_config)
    backtest = run_backtest(dataset, selected_config, signals)
    meta = RunMeta(
        generated_at=datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        command=f"python3 research/python/run_experiments.py --registry {DEFAULT_REGISTRY.name}",
    )
    report = build_report(dataset, backtest, validation, meta, signals)
    tag = f"{experiment['id']}_{symbol.lower()}"
    report_path = write_report(out_dir / f'{tag}_report.json', report)

    accepted = validation['accepted_for_paper_candidate']
    summary: dict[str, Any] = {
        'experiment_schema': 'quant-experiment.v1',
        'id': experiment['id'],
        'strategy': experiment['strategy'],
        'symbol': symbol,
        'hypothesis': experiment.get('hypothesis', experiment.get('name', '')),
        'criteria_version': registry['criteria_version'],
        'criteria': criteria,
        'provenance': dataset.provenance,
        'quality': dataset.quality.to_dict(),
        'freshness': freshness_report(dataset, meta.generated_at),
        'cost_assumptions': costs,
        'selected_params': selected_params,
        'accepted_for_paper_candidate': accepted,
        'acceptance_reasons': validation['acceptance_reasons'],
        'full_sample_metrics': backtest.metrics,
        'out_of_sample_metrics': validation['out_of_sample_metrics'],
        'walk_forward': {
            'positive': validation['walk_forward_positive_folds'],
            'total': validation['walk_forward_total_folds'],
        },
        'benchmarks': {
            'buy_hold_net_pct': backtest.metrics['buy_hold_net_pct'],
            'no_trade_return_pct': backtest.metrics['no_trade_return_pct'],
        },
        'report_path': str(report_path.relative_to(Path.cwd()))
            if report_path.is_relative_to(Path.cwd()) else report_path.name,
        'decision': 'promote_candidate' if accepted else 'reject',
        'limitations': [
            'Historical backtest is not a guarantee of future profit.',
            'No exchange order, withdrawal, transfer, live trading or paid service is used.',
            'Costs are assumptions (fee + slippage per side); funding is zero for spot.',
            'Intrabar stop fills are simplified and may differ from real fills.',
            'One asset and one interval per experiment; results are not generalisable.',
        ],
    }
    (out_dir / f'{tag}_summary.json').write_text(
        json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False) + '\n', encoding='utf-8')
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registry', default=str(DEFAULT_REGISTRY))
    parser.add_argument('--data-dir', default=str(DEFAULT_DATA))
    parser.add_argument('--out-dir', default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)
    registry = json.loads(Path(args.registry).read_text(encoding='utf-8'))
    data_dir, out_dir = Path(args.data_dir), Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    summaries: list[dict[str, Any]] = []
    experiments = registry.get('experiments') or [registry['hypothesis']]
    for experiment in experiments:
        for symbol in experiment['symbols']:
            summary = run_one(experiment, symbol, registry, data_dir, out_dir)
            summaries.append(summary)
            print(json.dumps({
                'id': summary['id'], 'symbol': summary['symbol'],
                'selected': summary['selected_params'],
                'accepted': summary['accepted_for_paper_candidate'],
                'reasons': summary['acceptance_reasons'],
                'oos_net_pct': summary['out_of_sample_metrics']['net_return_pct'],
                'full_net_pct': summary['full_sample_metrics']['net_return_pct'],
                'walk_forward': summary['walk_forward'],
            }, sort_keys=True))
    (out_dir / 'summary.json').write_text(
        json.dumps({'registry_version': registry['registry_version'],
                    'criteria_version': registry['criteria_version'],
                    'results': summaries}, indent=2, sort_keys=True, ensure_ascii=False) + '\n',
        encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
