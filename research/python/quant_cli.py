#!/usr/bin/env python3
"""Run the deterministic quant MVP vertical slice and emit a versioned JSON report."""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from backtest_engine import run_backtest
from quant_data import load_ohlcv
from report import REPORT_SCHEMA, RunMeta, build_report, write_report
from strategy import StrategyConfig, generate_signals
from validation import candidate_config, run_validation


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", help="CSV OHLCV: timestamp,open,high,low,close,volume")
    parser.add_argument("--source", default="synthetic-fixture", help="Identitas sumber data")
    parser.add_argument("--symbol", default="BTCUSDT", help="Simbol aset")
    parser.add_argument("--interval", default="1d", help="1m,5m,15m,1h,4h,1d")
    parser.add_argument("--retrieved-at", default=None, help="ISO-8601 UTC saat data diambil")
    parser.add_argument("--data-kind", default="synthetic", choices=("synthetic", "public_api"))
    parser.add_argument("--provenance", default=None,
                        help="Sidecar JSON dari fetch_ohlcv.py; auto-detect jika tidak diberikan")
    parser.add_argument("--report", default="research/python/output/example_report.json")
    parser.add_argument("--fast", type=int, default=5)
    parser.add_argument("--slow", type=int, default=20)
    parser.add_argument("--fee-bps", type=float, default=10.0)
    parser.add_argument("--slippage-bps", type=float, default=5.0)
    parser.add_argument("--funding-bps-per-day", type=float, default=0.0)
    parser.add_argument("--position-fraction", type=float, default=1.0)
    parser.add_argument("--stop-loss-pct", type=float, default=0.10)
    parser.add_argument("--max-drawdown-stop-pct", type=float, default=0.30)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = make_parser().parse_args(argv)
    csv_path = Path(args.csv)
    provenance_path = Path(args.provenance) if args.provenance else csv_path.with_suffix(".provenance.json")
    source, symbol = args.source, args.symbol
    interval, retrieved_at, data_kind = args.interval, args.retrieved_at, args.data_kind
    if provenance_path.exists():
        meta = json.loads(provenance_path.read_text(encoding="utf-8"))
        source = meta.get("source", source)
        symbol = meta.get("symbol", symbol)
        interval = meta.get("interval", interval)
        retrieved_at = meta.get("retrieved_at", retrieved_at)
        data_kind = meta.get("data_kind", data_kind)
        expected = meta.get("checksum_sha256")
        if expected and expected != hashlib.sha256(csv_path.read_bytes()).hexdigest():
            raise SystemExit("Provenance checksum tidak cocok dengan CSV; hentikan eksperimen")
    dataset = load_ohlcv(
        csv_path,
        source=source,
        symbol=symbol,
        interval=interval,
        retrieved_at=retrieved_at,
        data_kind=data_kind,
    )
    config = StrategyConfig(
        fast=args.fast,
        slow=args.slow,
        fee_bps=args.fee_bps,
        slippage_bps=args.slippage_bps,
        funding_bps_per_day=args.funding_bps_per_day,
        position_fraction=args.position_fraction,
        stop_loss_pct=args.stop_loss_pct,
        max_drawdown_stop_pct=args.max_drawdown_stop_pct,
    )
    validation = run_validation(dataset, config)
    selected_params = validation['selected_parameters']['params']
    selected_config = candidate_config(config, selected_params)
    signals = generate_signals(dataset.candles, selected_config)
    backtest = run_backtest(dataset, selected_config, signals)
    meta = RunMeta(generated_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    report = build_report(dataset, backtest, validation, meta, signals)
    path = write_report(Path(args.report), report)
    summary = {
        "report_schema": REPORT_SCHEMA,
        "report_path": str(path),
        "data_kind": dataset.provenance["data_kind"],
        "start": dataset.start,
        "end": dataset.end,
        "bars": len(dataset.candles),
        "selected_params": selected_params,
        "strategy_id": selected_config.strategy_id,
        "total_trades": backtest.metrics["total_trades"],
        "gross_return_pct": backtest.metrics["gross_return_pct"],
        "net_return_pct": backtest.metrics["net_return_pct"],
        "max_drawdown_pct": backtest.metrics["max_drawdown_pct"],
        "accepted_for_paper_candidate": validation["accepted_for_paper_candidate"],
        "live_trading": False,
        "withdrawal": False,
        "profit_claim": False,
    }
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
