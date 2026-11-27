#!/usr/bin/env python3
"""Independent, objective QA check of a quant report artifact.

Recomputes trade and drawdown metrics from the report's own ledger/equity curve
using a separate code path from backtest_engine.py, verifies dataset checksum
and safety flags. Does not re-run strategy selection and does not claim human QA.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from quant_data import load_ohlcv

TOLERANCE = 1e-3


def close(a: float | None, b: float | None, tol: float = TOLERANCE) -> bool:
    if a is None or b is None:
        return a is b
    return math.isclose(a, b, abs_tol=tol, rel_tol=tol)


def verify(report: dict[str, Any], csv_path: str | Path) -> dict[str, Any]:
    checks: dict[str, bool] = {}
    metrics = report["backtest"]["metrics"]
    trades = report["backtest"]["trades"]
    equity = report["backtest"]["equity_curve"]
    data = report["data"]

    checks["schema_version"] = report.get("report_schema") == "quant-report.v1"
    checks["paper_only_safety_flags"] = (
        report.get("paper_only") is True and report.get("live_trading") is False
        and report.get("withdrawal") is False and report.get("profit_claim") is False
    )
    raw = Path(csv_path).read_bytes()
    expected_hash = hashlib.sha256(raw).hexdigest()
    checks["dataset_checksum"] = data["checksum_sha256"] == expected_hash == data["provenance"]["checksum_sha256"]

    dataset = load_ohlcv(
        csv_path,
        source=data["provenance"]["source"],
        symbol=data["provenance"]["symbol"],
        interval=data["provenance"]["interval"],
        retrieved_at=data["provenance"].get("retrieved_at"),
        data_kind=data["provenance"]["data_kind"],
    )
    checks["dataset_range_and_rows"] = (
        dataset.start == data["provenance"]["start"]
        and dataset.end == data["provenance"]["end"]
        and len(dataset.candles) == data["provenance"]["rows"]
    )

    checks["trade_count_matches_ledger"] = (
        report["backtest"].get("trades_omitted", 0) == 0
        and len(trades) == metrics["total_trades"]
    )
    net = [trade["net_pct"] for trade in trades]
    wins = [value for value in net if value > 0]
    losses = [value for value in net if value < 0]
    expected_win_rate = (len(wins) / len(net) * 100.0) if net else 0.0
    checks["win_rate_recomputed"] = close(expected_win_rate, metrics["win_rate_pct"])
    expected_expectancy = (sum(net) / len(net)) if net else 0.0
    checks["expectancy_recomputed"] = close(expected_expectancy, metrics["expectancy_pct_per_trade"])
    profit = sum(wins)
    loss = abs(sum(losses))
    expected_pf = (profit / loss) if loss > 0 else None
    checks["profit_factor_recomputed"] = close(expected_pf, metrics["profit_factor"])

    peak = equity[0]
    max_dd = 0.0
    for value in equity:
        peak = max(peak, value)
        max_dd = max(max_dd, (peak - value) / peak)
    checks["max_drawdown_recomputed"] = close(max_dd * 100.0, metrics["max_drawdown_pct"])
    checks["net_not_above_gross"] = metrics["net_return_pct"] <= metrics["gross_return_pct"] + TOLERANCE
    checks["validation_shape"] = (
        isinstance(report["validation"]["accepted_for_paper_candidate"], bool)
        and isinstance(report["validation"]["acceptance_reasons"], list)
        and isinstance(report["validation"]["walk_forward_folds"], list)
    )
    checks["signals_within_contract"] = all(
        signal.get("target_position") in (0, 1)
        and signal.get("provenance_ref") == expected_hash
        for signal in report.get("signals", [])
    )
    failed = [name for name, passed in checks.items() if not passed]
    return {"passed": not failed, "checks": checks, "failed": failed,
            "note": "Automated independent recomputation; not human Divisi 05 sign-off."}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report")
    parser.add_argument("--csv", default="research/python/fixtures/synthetic_btcusdt_1d.csv")
    parser.add_argument("--output", default=None)
    args = parser.parse_args(argv)
    report = json.loads(Path(args.report).read_text(encoding="utf-8"))
    result = verify(report, args.csv)
    text = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    print(text)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
