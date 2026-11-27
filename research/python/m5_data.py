"""M5 OHLCV ingestion for quantum research.

Free public Binance klines only; no API key, no orders, no paid service.
The last (still open) candle is never accepted as a final signal candle.
Every artifact is a deterministic CSV plus a provenance sidecar.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.parse import urlencode
from urllib.request import urlopen

from quant_data import Candle, DataQualityError, canonical_timestamp, load_ohlcv, parse_timestamp

INTERVAL = "5m"
STEP_SECONDS = 300
DEFAULT_BASE_URL = "https://data-api.binance.vision/api/v3/klines"
MAX_ROWS_PER_PAGE = 1000
MAX_PAGES = 20
MAX_STALE_BARS = 3

FetchJson = Callable[[str], list[list[Any]]]


def default_fetch_json(url: str) -> list[list[Any]]:
    with urlopen(url, timeout=20) as response:  # nosec B310 - fixed https host
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, list):
        raise DataQualityError("Respons klines bukan array")
    return payload


def build_url(
    symbol: str,
    base_url: str,
    start_ms: int | None = None,
    limit: int = MAX_ROWS_PER_PAGE,
    end_ms: int | None = None,
) -> str:
    params: dict[str, str | int] = {"symbol": symbol.upper(), "interval": INTERVAL, "limit": limit}
    if start_ms is not None:
        params["startTime"] = start_ms
    if end_ms is not None:
        params["endTime"] = end_ms
    return f"{base_url}?{urlencode(params)}"


def _closed_at_ms(raw: list[Any]) -> int:
    if len(raw) < 6:
        raise DataQualityError("Bar klines terlalu pendek")
    return int(raw[6])


def kline_to_candle(raw: list[Any], *, now: datetime, allow_open: bool = False) -> Candle | None:
    """Map one Binance kline. Return None when the candle is not closed yet."""
    if len(raw) < 6:
        raise DataQualityError("Bar klines terlalu pendek")
    open_ms = int(raw[0])
    close_ms = _closed_at_ms(raw)
    if close_ms <= open_ms:
        raise DataQualityError("closeTime klines tidak valid")
    if not allow_open and close_ms > int(now.timestamp() * 1000):
        return None
    try:
        return Candle(
            timestamp=canonical_timestamp(datetime.fromtimestamp(open_ms / 1000, tz=timezone.utc).isoformat()),
            open=float(raw[1]),
            high=float(raw[2]),
            low=float(raw[3]),
            close=float(raw[4]),
            volume=float(raw[5]),
        )
    except (TypeError, ValueError) as exc:
        raise DataQualityError(f"Nilai OHLCV tidak valid: {exc}") from None


@dataclass(frozen=True)
class DownloadReport:
    symbol: str
    interval: str
    rows: int
    start: str
    end: str
    retrieved_at: str
    skipped_open_candles: int
    source: str
    pages: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "interval": self.interval,
            "rows": self.rows,
            "start": self.start,
            "end": self.end,
            "retrieved_at": self.retrieved_at,
            "skipped_open_candles": self.skipped_open_candles,
            "source": self.source,
            "pages": self.pages,
        }


def download_m5(
    symbol: str = "BTCUSDT",
    *,
    pages: int = 5,
    base_url: str = DEFAULT_BASE_URL,
    fetch_json: FetchJson | None = None,
    now: datetime | None = None,
) -> tuple[list[Candle], DownloadReport]:
    """Download bounded M5 pages in ascending time order.

    Pagination walks forward from the oldest available kline so the resulting
    artifact is reproducible for a given (symbol, pages, retrieval window).
    """
    if not 1 <= pages <= MAX_PAGES:
        raise DataQualityError(f"pages wajib 1..{MAX_PAGES}")
    fetch = fetch_json or default_fetch_json
    moment = now or datetime.now(timezone.utc)
    retrieved_at = canonical_timestamp(moment.isoformat())
    candles: list[Candle] = []
    skipped_open = 0
    end_ms: int | None = None
    used_pages = 0
    for _ in range(pages):
        url = build_url(symbol, base_url, end_ms=end_ms)
        payload = fetch(url)
        if not payload:
            break
        used_pages += 1
        batch: list[Candle] = []
        for raw in payload:
            candle = kline_to_candle(raw, now=moment)
            if candle is None:
                skipped_open += 1
                continue
            batch.append(candle)
        if not batch:
            break
        candles.extend(batch)
        first_ms = int(parse_timestamp(batch[0].timestamp).timestamp() * 1000)
        previous_end = first_ms - 1
        if end_ms is not None and previous_end >= end_ms:
            break
        end_ms = previous_end
    if len(candles) < 3:
        raise DataQualityError("Tidak cukup candle tertutup untuk dataset M5")
    candles.sort(key=lambda item: item.timestamp)
    report = DownloadReport(
        symbol=symbol.upper(),
        interval=INTERVAL,
        rows=len(candles),
        start=candles[0].timestamp,
        end=candles[-1].timestamp,
        retrieved_at=retrieved_at,
        skipped_open_candles=skipped_open,
        source=base_url,
        pages=used_pages,
    )
    return candles, report


def write_artifact(candles: list[Candle], report: DownloadReport, out_dir: str | Path) -> Path:
    """Write deterministic CSV + provenance JSON. Existing artifacts are replaced."""
    folder = Path(out_dir)
    folder.mkdir(parents=True, exist_ok=True)
    csv_path = folder / f"{report.symbol.lower()}_1d_public.csv".replace("_1d_", "_5m_")
    lines = ["timestamp,open,high,low,close,volume"]
    for candle in candles:
        lines.append(
            f"{candle.timestamp},{candle.open},{candle.high},{candle.low},{candle.close},{candle.volume}"
        )
    csv_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    checksum = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    provenance = dict(report.to_dict())
    provenance.update({
        "schema_version": "1.0.0",
        "data_kind": "public_api",
        "checksum_sha256": checksum,
    })
    side_path = csv_path.with_suffix(".provenance.json")
    side_path.write_text(json.dumps(provenance, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return csv_path


def load_artifact(path: str | Path, *, max_stale_bars: int = MAX_STALE_BARS, now: datetime | None = None):
    """Load an M5 artifact and reject stale data relative to retrieval time."""
    file_path = Path(path)
    metadata = json.loads(file_path.with_suffix(".provenance.json").read_text(encoding="utf-8"))
    dataset = load_ohlcv(
        file_path,
        source=metadata["source"],
        symbol=metadata["symbol"],
        interval=INTERVAL,
        retrieved_at=metadata.get("retrieved_at"),
        data_kind=metadata.get("data_kind", "public_api"),
    )
    if dataset.checksum != metadata.get("checksum_sha256"):
        raise DataQualityError("Checksum provenance tidak cocok dengan CSV")
    reference = now or datetime.now(timezone.utc)
    last = parse_timestamp(dataset.end)
    if (reference - last).total_seconds() > max_stale_bars * STEP_SECONDS:
        raise DataQualityError("Dataset M5 terlalu basi untuk dipakai sebagai sinyal")
    return dataset, metadata


__all__ = [
    "INTERVAL",
    "STEP_SECONDS",
    "DEFAULT_BASE_URL",
    "DownloadReport",
    "build_url",
    "default_fetch_json",
    "download_m5",
    "kline_to_candle",
    "load_artifact",
    "write_artifact",
]
