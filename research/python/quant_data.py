"""OHLCV quality guards and provenance for reproducible quant research.

No network, no exchange orders. Every dataset carries source identity, interval,
UTC range, row count and a checksum of the raw file. Malformed, duplicated,
gap-filled or stale input is rejected rather than silently repaired.
"""
from __future__ import annotations

import csv
import hashlib
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping

REQUIRED_COLUMNS = ("timestamp", "open", "high", "low", "close", "volume")
INTERVAL_SECONDS = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}


class DataQualityError(ValueError):
    """Raised when an input dataset cannot be trusted for research."""


@dataclass(frozen=True)
class Candle:
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: float

    def instant(self) -> datetime:
        return parse_timestamp(self.timestamp)


@dataclass(frozen=True)
class QualityReport:
    rows: int
    start: str
    end: str
    interval: str
    duplicate_timestamps: int
    missing_intervals: int
    ohlcv_violations: int
    accepted: bool
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
            "accepted": self.accepted,
            "issues": list(self.issues),
        }


@dataclass(frozen=True)
class Dataset:
    candles: tuple[Candle, ...]
    provenance: Mapping[str, Any]
    quality: QualityReport
    checksum: str

    @property
    def start(self) -> str:
        return self.quality.start

    @property
    def end(self) -> str:
        return self.quality.end


def parse_timestamp(raw: str) -> datetime:
    if not isinstance(raw, str) or not raw.strip():
        raise DataQualityError("Timestamp wajib berupa string ISO-8601")
    try:
        parsed = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
    except ValueError:
        raise DataQualityError(f"Timestamp tidak valid: {raw!r}") from None
    if parsed.tzinfo is None:
        raise DataQualityError("Timestamp wajib memiliki zona waktu")
    return parsed.astimezone(timezone.utc)


def canonical_timestamp(raw: str) -> str:
    return parse_timestamp(raw).isoformat().replace("+00:00", "Z")


def _number(value: Any, label: str, positive: bool) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise DataQualityError(f"{label} bukan angka") from None
    if not math.isfinite(parsed):
        raise DataQualityError(f"{label} tidak finite")
    if positive and parsed <= 0:
        raise DataQualityError(f"{label} harus lebih besar dari nol")
    if not positive and parsed < 0:
        raise DataQualityError(f"{label} tidak boleh negatif")
    return parsed


def validate_candles(
    rows: list[Candle],
    interval: str,
    max_missing_intervals: int = 0,
) -> QualityReport:
    if interval not in INTERVAL_SECONDS:
        raise DataQualityError(f"Interval tidak didukung: {interval}")
    if len(rows) < 3:
        raise DataQualityError("Minimal 3 candle diperlukan")
    step = INTERVAL_SECONDS[interval]
    issues: list[str] = []
    duplicates = 0
    missing = 0
    violations = 0
    previous: datetime | None = None
    for index, candle in enumerate(rows, start=2):
        current = candle.instant()
        if previous is not None:
            delta = (current - previous).total_seconds()
            if delta == 0:
                duplicates += 1
            elif delta < 0:
                raise DataQualityError(f"Baris {index}: timestamp tidak naik")
            else:
                gaps = int(delta // step) - 1
                if gaps > 0:
                    missing += gaps
        previous = current
        if not (
            candle.high >= max(candle.open, candle.close, candle.low)
            and candle.low <= min(candle.open, candle.close, candle.high)
        ):
            violations += 1
    if duplicates:
        issues.append("duplicate_timestamps")
    if missing > max_missing_intervals:
        issues.append("missing_intervals_exceed_limit")
    if violations:
        issues.append("ohlcv_invariants_violated")
    return QualityReport(
        rows=len(rows),
        start=canonical_timestamp(rows[0].timestamp),
        end=canonical_timestamp(rows[-1].timestamp),
        interval=interval,
        duplicate_timestamps=duplicates,
        missing_intervals=missing,
        ohlcv_violations=violations,
        accepted=not issues,
        issues=tuple(issues),
    )


def load_ohlcv(
    path: str | Path,
    *,
    source: str,
    symbol: str,
    interval: str = "1d",
    retrieved_at: str | None = None,
    data_kind: str = "public_api",
    max_missing_intervals: int = 0,
) -> Dataset:
    """Load and validate a CSV with timestamp,open,high,low,close,volume."""
    file_path = Path(path)
    raw = file_path.read_bytes()
    checksum = hashlib.sha256(raw).hexdigest()
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(text.splitlines())
    if reader.fieldnames is None or not set(REQUIRED_COLUMNS).issubset(reader.fieldnames):
        raise DataQualityError("CSV wajib memiliki kolom timestamp,open,high,low,close,volume")
    candles: list[Candle] = []
    for line, row in enumerate(reader, start=2):
        try:
            candle = Candle(
                timestamp=canonical_timestamp(row["timestamp"]),
                open=_number(row["open"], f"Baris {line} open", True),
                high=_number(row["high"], f"Baris {line} high", True),
                low=_number(row["low"], f"Baris {line} low", True),
                close=_number(row["close"], f"Baris {line} close", True),
                volume=_number(row["volume"], f"Baris {line} volume", False),
            )
        except DataQualityError:
            raise
        candles.append(candle)
    quality = validate_candles(candles, interval, max_missing_intervals)
    if not quality.accepted:
        raise DataQualityError("Kualitas data ditolak: " + ", ".join(quality.issues))
    provenance = {
        "schema_version": "1.0.0",
        "source": source,
        "symbol": symbol,
        "interval": interval,
        "retrieved_at": canonical_timestamp(retrieved_at) if retrieved_at else None,
        "data_kind": data_kind,
        "start": quality.start,
        "end": quality.end,
        "rows": quality.rows,
        "checksum_sha256": checksum,
    }
    return Dataset(candles=tuple(candles), provenance=provenance, quality=quality, checksum=checksum)


def freshness_report(dataset: Dataset, now: str, max_lag_hours: float = 168.0) -> dict[str, Any]:
    """Report retrieval lag and data age without pretending history is live.

    Historical research windows are intentionally old; this helper records
    provenance ages and always marks live readiness false. It never repairs
    or fabricates timestamps.
    """
    now_dt = parse_timestamp(now)
    end_dt = parse_timestamp(dataset.end)
    retrieved = dataset.provenance.get('retrieved_at')
    retrieval_dt = parse_timestamp(retrieved) if retrieved else None
    return {
        'schema_version': '1.0.0',
        'retrieved_at': retrieved,
        'dataset_end': dataset.end,
        'evaluated_at': canonical_timestamp(now),
        'retrieval_after_end_hours': (
            round((retrieval_dt - end_dt).total_seconds() / 3600.0, 3) if retrieval_dt else None
        ),
        'age_hours_at_evaluation': round((now_dt - end_dt).total_seconds() / 3600.0, 3),
        'historical_research_only': (now_dt - end_dt).total_seconds() > max_lag_hours * 3600.0,
        'live_ready': False,
        'integrity_accepted': dataset.quality.accepted,
        'issues': list(dataset.quality.issues),
        'note': 'Freshness is recorded as provenance for historical research, not a claim of live market data.',
    }


def slice_dataset(dataset: Dataset, start: int, end: int) -> Dataset:
    """Contiguous, non-overlapping slice; provenance is preserved."""
    if not 0 <= start < end <= len(dataset.candles):
        raise DataQualityError("Rentang slice tidak valid")
    rows = list(dataset.candles[start:end])
    quality = validate_candles(rows, dataset.quality.interval)
    if not quality.accepted:
        raise DataQualityError("Slice memiliki masalah kualitas: " + ", ".join(quality.issues))
    provenance = dict(dataset.provenance)
    provenance["segment"] = {"start_index": start, "end_index": end}
    return Dataset(candles=tuple(rows), provenance=provenance, quality=quality, checksum=dataset.checksum)
