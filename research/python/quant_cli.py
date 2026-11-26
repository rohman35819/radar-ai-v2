#!/usr/bin/env python3
"""Run the deterministic quant MVP vertical slice and emit a versioned JSON report."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from backtest_engine import run_backtest
from quant_data import load_ohlcv
from report import REPORT_SCHEMA, RunMeta, build_report, write_report
from strategy import StrategyConfig, generate_signals
from validation import run_validation


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", help="CSV OHLCV: timestamp,open,high,low,close,volume")
    parser.add_argument("--source", default="synthetic-fixture", help="Identitas sumber data")
    parser.add_argument("--symbol", default="BTCUSDT", help="Simbol aset")
    parser.add_argument("--interval", default="1d", help="1m,5m,15m,1h,4h,1d")
    parser.add_argument("--retrieved-at", default=None, help="ISO-8601 UTC saat data diambil")
    parser.add_argument("--data-kind", default="synthetic", choices=("synthetic", "public_api"))
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
    dataset = load_ohlcv(
        args.csv,
        source=args.source,
        symbol=args.symbol,
        interval=args.interval,
        retrieved_at=args.retrieved_at,
        data_kind=args.data_kind,
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
    signals = generate_signals(dataset.candles, config)
    backtest = run_backtest(dataset, config, signals)
    validation = run_validation(dataset, config)
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
