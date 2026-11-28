"""Independent M5 data-quality policy for RADAR Quantum.

This is a validation layer for research and shadow readiness. It does not
fetch data, place orders, or modify the trading engine. It wraps the generic
``quant_data`` guard and adds M5-specific, fail-closed checks that the daily
guard does not enforce:

* timestamps must sit exactly on the 5-minute UTC grid;
* zero-volume candles are rejected for the BTC/USDT M5 research feed;
* the provenance retrieval time must not precede the dataset end;
* live readiness requires a fresh dataset, while historical windows remain
  structurally valid but are never labelled live-ready.

The policy is deliberately separate from ``quant_data.py`` so the M5 engine can
adopt it without weakening the existing daily-data contract.
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from quant_data import (
    Candle,
    DataQualityError,
    Dataset,
    load_ohlcv,
    parse_timestamp,
    validate_candles,
)

M5_INTERVAL = "5m"
M5_SECONDS = 300


@dataclass(frozen=True)
class M5QualityReport:
    rows: int
    start: str
    end: str
    interval: str
    duplicate_timestamps: int
    missing_intervals: int
    ohlcv_violations: int
    misaligned_timestamps: int
    zero_volume_candles: int
    negative_volume_candles: int
    retrieval_before_end: bool
    stale: bool
    future_data: bool
    age_minutes: float | None
    structurally_accepted: bool
    live_ready: bool
    issues: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "rows": self.rows,
            "start": self.start,
            "end": self.end,
            "interval": self.interval,
            "duplicate_timestamps": self.duplicate_timestamps,
            "missing_intervals": self.missing_intervals,
            "ohlcv_violations": self.ohlcv_violations,
            "misaligned_timestamps": self.misaligned_timestamps,
            "zero_volume_candles": self.zero_volume_candles,
            "negative_volume_candles": self.negative_volume_candles,
            "retrieval_before_end": self.retrieval_before_end,
            "stale": self.stale,
            "future_data": self.future_data,
            "age_minutes": self.age_minutes,
            "structurally_accepted": self.structurally_accepted,
            "live_ready": self.live_ready,
            "issues": list(self.issues),
        }


def _finite_nonnegative(value: Any, label: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise DataQualityError(f"{label} bukan angka") from None
    if not math.isfinite(parsed) or parsed < 0:
        raise DataQualityError(f"{label} wajib finite dan >= 0")
    return parsed


def validate_m5_dataset(
    dataset: Dataset,
    *,
    now: str | None = None,
    max_lag_minutes: float = 15.0,
    require_nonzero_volume: bool = True,
    max_missing_intervals: int = 0,
) -> M5QualityReport:
    """Validate one M5 dataset without repairing or fabricating bars.

    ``structurally_accepted`` covers integrity (grid, gaps, duplicates, OHLC,
    volume, provenance ordering). ``live_ready`` is stricter: it also requires
    ``now`` and a fresh dataset, and is therefore false for historical windows.
    """
    if dataset.quality.interval != M5_INTERVAL:
        raise DataQualityError(
            f"Dataset M5 wajib berinterval {M5_INTERVAL}, bukan {dataset.quality.interval!r}"
        )
    lag_limit = _finite_nonnegative(max_lag_minutes, "max_lag_minutes")
    if not isinstance(max_missing_intervals, int) or isinstance(max_missing_intervals, bool) \
            or max_missing_intervals < 0:
        raise DataQualityError("max_missing_intervals wajib integer >= 0")

    candles = list(dataset.candles)
    base = validate_candles(candles, M5_INTERVAL, max_missing_intervals=max_missing_intervals)

    misaligned = sum(
        1 for candle in candles
        if int(candle.instant().timestamp()) % M5_SECONDS != 0
    )
    zero_volume = sum(1 for candle in candles if candle.volume == 0)
    negative_volume = sum(1 for candle in candles if candle.volume < 0)

    issues: list[str] = list(base.issues)
    if misaligned:
        issues.append("misaligned_timestamps")
    if require_nonzero_volume and zero_volume:
        issues.append("zero_volume_candles")
    if negative_volume:
        issues.append("negative_volume_candles")

    retrieved = dataset.provenance.get("retrieved_at")
    retrieval_before_end = False
    if retrieved:
        retrieval_before_end = parse_timestamp(str(retrieved)) < parse_timestamp(dataset.end)
        if retrieval_before_end:
            issues.append("retrieval_before_dataset_end")

    stale = False
    future_data = False
    age_minutes: float | None = None
    if now is not None:
        age_minutes = round(
            (parse_timestamp(now) - parse_timestamp(dataset.end)).total_seconds() / 60.0,
            6,
        )
        stale = age_minutes > lag_limit
        # One minute of tolerance avoids rejecting a just-closed bar on clock skew.
        future_data = age_minutes < -1.0
        if stale:
            issues.append("stale_data")
        if future_data:
            issues.append("future_data")

    structural_issues = tuple(
        issue for issue in issues if issue not in {"stale_data", "future_data"}
    )
    structurally_accepted = not structural_issues
    live_ready = structurally_accepted and now is not None and not stale and not future_data

    return M5QualityReport(
        rows=base.rows,
        start=base.start,
        end=base.end,
        interval=base.interval,
        duplicate_timestamps=base.duplicate_timestamps,
        missing_intervals=base.missing_intervals,
        ohlcv_violations=base.ohlcv_violations,
        misaligned_timestamps=misaligned,
        zero_volume_candles=zero_volume,
        negative_volume_candles=negative_volume,
        retrieval_before_end=retrieval_before_end,
        stale=stale,
        future_data=future_data,
        age_minutes=age_minutes,
        structurally_accepted=structurally_accepted,
        live_ready=live_ready,
        issues=tuple(issues),
    )


def assert_m5_ready(report: M5QualityReport, *, require_live: bool = False) -> None:
    """Raise on rejected M5 data; optionally require a fresh live-ready feed."""
    if not report.structurally_accepted:
        raise DataQualityError("Kualitas M5 ditolak: " + ", ".join(report.issues))
    if require_live and not report.live_ready:
        reasons = [issue for issue in report.issues if issue in {"stale_data", "future_data"}]
        if not reasons:
            reasons = ["freshness_not_evaluated"]
        raise DataQualityError("M5 belum live-ready: " + ", ".join(reasons))


def load_m5_ohlcv(
    path: str | Path,
    *,
    source: str,
    symbol: str = "BTCUSDT",
    retrieved_at: str | None = None,
    data_kind: str = "public_api",
    now: str | None = None,
    max_lag_minutes: float = 15.0,
    max_missing_intervals: int = 0,
    require_nonzero_volume: bool = True,
) -> tuple[Dataset, M5QualityReport]:
    """Load a CSV through the generic guard, then apply the M5 policy."""
    dataset = load_ohlcv(
        path,
        source=source,
        symbol=symbol,
        interval=M5_INTERVAL,
        retrieved_at=retrieved_at,
        data_kind=data_kind,
        max_missing_intervals=max_missing_intervals,
    )
    report = validate_m5_dataset(
        dataset,
        now=now,
        max_lag_minutes=max_lag_minutes,
        require_nonzero_volume=require_nonzero_volume,
        max_missing_intervals=max_missing_intervals,
    )
    return dataset, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", required=True)
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--source", default="local-csv")
    parser.add_argument("--retrieved-at", default=None)
    parser.add_argument("--now", default=None)
    parser.add_argument("--max-lag-minutes", type=float, default=15.0)
    parser.add_argument("--allow-zero-volume", action="store_true")
    args = parser.parse_args(argv)

    dataset, report = load_m5_ohlcv(
        args.csv,
        source=args.source,
        symbol=args.symbol,
        retrieved_at=args.retrieved_at,
        now=args.now,
        max_lag_minutes=args.max_lag_minutes,
        require_nonzero_volume=not args.allow_zero_volume,
    )
    payload = {
        "symbol": dataset.provenance.get("symbol"),
        "checksum_sha256": dataset.checksum,
        "quality": report.to_dict(),
    }
    print(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False))
    if not report.structurally_accepted:
        return 1
    if args.now is not None and not report.live_ready:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
