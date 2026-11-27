#!/usr/bin/env python3
"""Run pre-registered M5 hybrid experiments and persist reproducible reports."""
from __future__ import annotations

import argparse
import json
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from hybrid import HybridConfig, generate_signals
from hybrid_validation import run_validation
from m5_data import load_artifact
from quant_data import parse_timestamp

ROOT = Path(__file__).parent
DEFAULT_REGISTRY = ROOT / 'experiments' / 'hybrid_registry.json'
DEFAULT_OUT = ROOT / 'output' / 'hybrid_m5'


def jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    if hasattr(value, 'to_dict'):
        return jsonable(value.to_dict())
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registry', default=str(DEFAULT_REGISTRY))
    parser.add_argument('--out-dir', default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)
    registry = json.loads(Path(args.registry).read_text(encoding='utf-8'))
    criteria = registry['criteria']
    artifact = ROOT.parent.parent / registry['data']['artifact']
    dataset, provenance = load_artifact(artifact, now=parse_timestamp(provenance_retrieved_at(artifact)))
    if dataset.checksum != registry['data']['checksum_sha256']:
        raise ValueError('Checksum dataset tidak cocok dengan registry pra-registrasi')
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    summaries = []
    for experiment in registry['experiments']:
        configs = [
            replace(
                HybridConfig(**config),
                fee_bps_per_side=criteria['fee_bps_per_side'],
                slippage_bps_per_side=criteria['slippage_bps_per_side'],
                spread_bps=criteria['spread_bps'],
                funding_bps_per_day=(
                    criteria['funding_bps_per_day_futures'] if experiment['instrument'] == 'FUTURES' else 0.0
                ),
            )
            for config in experiment['configs']
        ]
        validation = run_validation(dataset.candles, configs, experiment['instrument'])
        selected = HybridConfig(**validation['selected_config'])
        signals = generate_signals(
            dataset.candles, selected, allow_short=experiment['instrument'] == 'FUTURES'
        )
        strategy_counts: dict[str, int] = {}
        for signal in signals:
            strategy_counts[signal.strategy] = strategy_counts.get(signal.strategy, 0) + 1
        report = {
            'experiment_schema': 'm5-hybrid-experiment.v1',
            'id': experiment['id'],
            'instrument': experiment['instrument'],
            'hypothesis': experiment['hypothesis'],
            'registered_at': registry['registered_at'],
            'generated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            'criteria_version': registry['criteria_version'],
            'dataset': provenance,
            'strategy_counts': strategy_counts,
            'validation': jsonable(validation),
        }
        report_path = out_dir / f"{experiment['id']}_report.json"
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + '\n', encoding='utf-8')
        summary = {
            'id': experiment['id'],
            'instrument': experiment['instrument'],
            'accepted': validation['accepted_for_paper_candidate'],
            'reasons': validation['acceptance_reasons'],
            'selected_mode': selected.mode,
            'oos_net_pct': validation['out_of_sample_metrics']['net_return_pct'],
            'oos_dd_pct': validation['out_of_sample_metrics']['max_drawdown_pct'],
            'walk_forward': f"{validation['walk_forward_positive']}/{validation['walk_forward_total']}",
            'report': str(report_path),
        }
        summaries.append(summary)
        print(json.dumps(summary, sort_keys=True))
    (out_dir / 'summary.json').write_text(
        json.dumps({'registry_version': registry['registry_version'], 'results': summaries},
                   indent=2, sort_keys=True, ensure_ascii=False) + '\n', encoding='utf-8')
    return 0


def provenance_retrieved_at(path: Path) -> str:
    metadata = json.loads(path.with_suffix('.provenance.json').read_text(encoding='utf-8'))
    return metadata['retrieved_at']


if __name__ == '__main__':
    raise SystemExit(main())
