#!/usr/bin/env python3
"""Independent, objective QA check of a quant report artifact.

Recomputes trade and drawdown metrics from the report's own ledger/equity curve
using a separate code path from the backtest engines, verifies dataset checksum
and safety flags. Does not re-run strategy selection and does not claim human QA.

Canonical unit: every ``*_pct`` metric and every ``Trade.net_pct`` /
``Trade.gross_pct`` is a percentage per trade (1.5 means 1.5%). The verifier
recomputes each trade return from its entry/exit prices, so a report that stores
fractions under a percent name fails instead of passing on a shared convention.
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


def mean_percent(values: list[float]) -> float:
    """Expectancy in percent per trade; 0.0 when there is no trade."""
    return sum(values) / len(values) if values else 0.0


def trade_return_pct(trade: dict[str, Any]) -> float:
    """Recompute one trade return in percent from its own prices."""
    entry = trade["entry_price"]
    exit_ = trade["exit_price"]
    direction = trade.get("direction", 1)
    if direction == 1:
        return (exit_ / entry - 1.0) * 100.0
    if direction == -1:
        return (entry / exit_ - 1.0) * 100.0
    raise ValueError("direction trade wajib 1 atau -1")


def _verify_metrics_block(metrics: dict[str, Any], prefix: str, checks: dict[str, bool]) -> None:
    trades = metrics.get("trades") or []
    equity = metrics.get("equity_curve") or []
    net = [trade["net_pct"] for trade in trades]
    checks[f"{prefix}_trade_count_matches_ledger"] = len(trades) == metrics.get("total_trades")
    checks[f"{prefix}_trade_returns_recomputed"] = all(
        close(trade_return_pct(trade), trade["net_pct"], tol=1e-4) for trade in trades
    )
    checks[f"{prefix}_expectancy_recomputed"] = close(
        mean_percent(net), metrics.get("expectancy_pct_per_trade"),
    )
    checks[f"{prefix}_expectancy_zero_without_trades"] = bool(trades) or metrics.get(
        "expectancy_pct_per_trade"
    ) == 0.0
    checks[f"{prefix}_win_rate_recomputed"] = close(
        (sum(1 for value in net if value > 0) / len(net) * 100.0) if net else 0.0,
        metrics.get("win_rate_pct"),
    )
    profit = sum(value for value in net if value > 0)
    loss = abs(sum(value for value in net if value < 0))
    expected_pf = (profit / loss) if loss > 0 else None
    checks[f"{prefix}_profit_factor_recomputed"] = close(expected_pf, metrics.get("profit_factor"))
    if equity:
        peak = equity[0]
        max_dd = 0.0
        for value in equity:
            peak = max(peak, value)
            max_dd = max(max_dd, (peak - value) / peak)
        checks[f"{prefix}_max_drawdown_recomputed"] = close(max_dd * 100.0, metrics.get("max_drawdown_pct"))
        checks[f"{prefix}_net_return_recomputed"] = close(
            (equity[-1] - 1.0) * 100.0, metrics.get("net_return_pct"),
        )
    else:
        checks[f"{prefix}_max_drawdown_recomputed"] = False
        checks[f"{prefix}_net_return_recomputed"] = False
    checks[f"{prefix}_net_not_above_gross"] = (
        metrics.get("net_return_pct", 0.0) <= metrics.get("gross_return_pct", 0.0) + TOLERANCE
    )


def verify(report: dict[str, Any], csv_path: str | Path) -> dict[str, Any]:
    checks: dict[str, bool] = {}
    metrics = report["backtest"]["metrics"]
    trades = report["backtest"]["trades"]
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
    checks["trade_returns_recomputed"] = all(
        close(trade_return_pct(trade), trade["net_pct"], tol=1e-4) for trade in trades
    )
    checks["win_rate_recomputed"] = close(
        (sum(1 for value in net if value > 0) / len(net) * 100.0) if net else 0.0,
        metrics["win_rate_pct"],
    )
    checks["expectancy_recomputed"] = close(mean_percent(net), metrics["expectancy_pct_per_trade"])
    checks["expectancy_zero_without_trades"] = bool(net) or metrics["expectancy_pct_per_trade"] == 0.0
    profit = sum(value for value in net if value > 0)
    loss = abs(sum(value for value in net if value < 0))
    expected_pf = (profit / loss) if loss > 0 else None
    checks["profit_factor_recomputed"] = close(expected_pf, metrics["profit_factor"])

    peak = report["backtest"]["equity_curve"][0]
    max_dd = 0.0
    for value in report["backtest"]["equity_curve"]:
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


def verify_m5(report: dict[str, Any]) -> dict[str, Any]:
    """Verify an ``m5-hybrid-experiment.v1`` report from its own ledger."""
    checks: dict[str, bool] = {}
    checks["schema_version"] = report.get("experiment_schema") == "m5-hybrid-experiment.v1"
    checks["paper_only_safety_flags"] = (
        report.get("paper_only") is True and report.get("live_trading") is False
        and report.get("withdrawal") is False and report.get("profit_claim") is False
    )
    validation = report.get("validation") or {}
    checks["validation_shape"] = (
        isinstance(validation.get("accepted_for_paper_candidate"), bool)
        and isinstance(validation.get("acceptance_reasons"), list)
        and isinstance(validation.get("walk_forward_folds"), list)
    )
    _verify_metrics_block(validation.get("out_of_sample_metrics") or {}, "oos", checks)
    for position, item in enumerate(validation.get("validation_results") or []):
        _verify_metrics_block(item.get("metrics") or {}, f"validation_{position}", checks)
    failed = [name for name, passed in checks.items() if not passed]
    return {"passed": not failed, "checks": checks, "failed": failed,
            "note": "Automated independent M5 recomputation; not human Divisi 05 sign-off."}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report")
    parser.add_argument("--csv", default="research/python/fixtures/synthetic_btcusdt_1d.csv")
    parser.add_argument("--output", default=None)
    args = parser.parse_args(argv)
    report = json.loads(Path(args.report).read_text(encoding="utf-8"))
    if report.get("experiment_schema") == "m5-hybrid-experiment.v1":
        result = verify_m5(report)
    else:
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
