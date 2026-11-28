"""M5 OHLCV ingestion for quantum research.

Free public Binance klines only; no API key, no orders, no paid service.
The last (still open) candle is never accepted as a final signal candle.
Every artifact is a deterministic CSV plus a provenance sidecar.

Before any strategy can use the bars, the dataset passes the fail-closed
``m5_quality`` policy: 5-minute UTC grid, no duplicates, no gaps, valid OHLCV,
no zero/incomplete candles and a retrieval time that is not before the data.
Bars are never repaired or fabricated; a rejected dataset raises
``DataQualityError`` and is not written or returned.

Pagination retries transient HTTP 418/429/5xx and network errors with bounded
exponential backoff (honouring ``Retry-After``), waits between pages to respect
the public rate limit, and records the number of retries in provenance.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from m5_quality import assert_m5_ready, validate_m5_dataset
from quant_data import (
    Candle,
    DataQualityError,
    Dataset,
    canonical_timestamp,
    load_ohlcv,
    parse_timestamp,
    validate_candles,
)

INTERVAL = "5m"
STEP_SECONDS = 300
DEFAULT_BASE_URL = "https://data-api.binance.vision/api/v3/klines"
MAX_ROWS_PER_PAGE = 1000
MAX_PAGES = 20
MAX_STALE_BARS = 3
MAX_ATTEMPTS = 4
DEFAULT_BACKOFF_SECONDS = 0.5
DEFAULT_MAX_BACKOFF_SECONDS = 8.0
DEFAULT_PAGE_DELAY_SECONDS = 0.2
RETRYABLE_HTTP_STATUS = frozenset({418, 429, 500, 502, 503, 504})

FetchJson = Callable[[str], list[list[Any]]]
Sleeper = Callable[[float], None]


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


def _retry_after_seconds(exc: HTTPError) -> float | None:
    headers = getattr(exc, "headers", None)
    if headers is None:
        return None
    raw = headers.get("Retry-After")
    if raw is None:
        return None
    try:
        seconds = float(raw)
    except (TypeError, ValueError):
        return None
    if not 0.0 <= seconds <= 60.0:
        return None
    return seconds


def _fetch_page(
    fetch: FetchJson,
    url: str,
    *,
    max_attempts: int,
    backoff_seconds: float,
    max_backoff_seconds: float,
    sleep: Sleeper,
) -> tuple[list[list[Any]], int]:
    """Fetch one page with bounded retry. Returns (payload, retries_used)."""
    last_error = ""
    for attempt in range(1, max_attempts + 1):
        try:
            return fetch(url), attempt - 1
        except HTTPError as exc:
            last_error = f"HTTP {exc.code}"
            if exc.code not in RETRYABLE_HTTP_STATUS or attempt == max_attempts:
                break
            delay = _retry_after_seconds(exc)
            if delay is None:
                delay = min(backoff_seconds * 2 ** (attempt - 1), max_backoff_seconds)
            sleep(delay)
        except (URLError, TimeoutError, OSError) as exc:
            last_error = f"jaringan {exc.__class__.__name__}"
            if attempt == max_attempts:
                break
            sleep(min(backoff_seconds * 2 ** (attempt - 1), max_backoff_seconds))
    raise DataQualityError(
        f"Fetch klines gagal setelah {max_attempts} percobaan: {last_error or 'tidak diketahui'}"
    )


def _dataset_from(
    candles: list[Candle],
    *,
    symbol: str,
    source: str,
    retrieved_at: str,
) -> Dataset:
    quality = validate_candles(candles, INTERVAL)
    payload = "\n".join(
        f"{item.timestamp},{item.open},{item.high},{item.low},{item.close},{item.volume}"
        for item in candles
    ).encode("utf-8")
    provenance = {
        "schema_version": "1.0.0",
        "source": source,
        "symbol": symbol.upper(),
        "interval": INTERVAL,
        "retrieved_at": retrieved_at,
        "data_kind": "public_api",
        "start": quality.start,
        "end": quality.end,
        "rows": quality.rows,
        "checksum_sha256": hashlib.sha256(payload).hexdigest(),
    }
    return Dataset(
        candles=tuple(candles),
        provenance=provenance,
        quality=quality,
        checksum=provenance["checksum_sha256"],
    )


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
    retries: int = 0
    quality: Mapping[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "symbol": self.symbol,
            "interval": self.interval,
            "rows": self.rows,
            "start": self.start,
            "end": self.end,
            "retrieved_at": self.retrieved_at,
            "skipped_open_candles": self.skipped_open_candles,
            "source": self.source,
            "pages": self.pages,
            "retries": self.retries,
        }
        if self.quality is not None:
            payload["quality"] = dict(self.quality)
        return payload


def download_m5(
    symbol: str = "BTCUSDT",
    *,
    pages: int = 5,
    base_url: str = DEFAULT_BASE_URL,
    fetch_json: FetchJson | None = None,
    now: datetime | None = None,
    max_attempts: int = MAX_ATTEMPTS,
    backoff_seconds: float = DEFAULT_BACKOFF_SECONDS,
    max_backoff_seconds: float = DEFAULT_MAX_BACKOFF_SECONDS,
    page_delay_seconds: float = DEFAULT_PAGE_DELAY_SECONDS,
    sleep: Sleeper = time.sleep,
) -> tuple[list[Candle], DownloadReport]:
    """Download bounded M5 pages in ascending time order.

    Pagination walks backward from the newest closed candle using the oldest
    returned open time minus one millisecond, so consecutive pages cannot
    overlap. The assembled series is validated before it is returned; a gap,
    duplicate, misaligned, zero-volume or incomplete bar rejects the whole
    download instead of being silently repaired.
    """
    if not 1 <= pages <= MAX_PAGES:
        raise DataQualityError(f"pages wajib 1..{MAX_PAGES}")
    if not 1 <= max_attempts <= 8:
        raise DataQualityError("max_attempts wajib 1..8")
    for label, value in (
        ("backoff_seconds", backoff_seconds),
        ("max_backoff_seconds", max_backoff_seconds),
        ("page_delay_seconds", page_delay_seconds),
    ):
        if value < 0 or value != value or value == float("inf"):
            raise DataQualityError(f"{label} wajib finite dan >= 0")
    fetch = fetch_json or default_fetch_json
    moment = now or datetime.now(timezone.utc)
    retrieved_at = canonical_timestamp(moment.isoformat())
    candles: list[Candle] = []
    skipped_open = 0
    end_ms: int | None = None
    used_pages = 0
    retries = 0
    for page_index in range(pages):
        if page_index and page_delay_seconds:
            sleep(page_delay_seconds)
        url = build_url(symbol, base_url, end_ms=end_ms)
        payload, page_retries = _fetch_page(
            fetch, url,
            max_attempts=max_attempts,
            backoff_seconds=backoff_seconds,
            max_backoff_seconds=max_backoff_seconds,
            sleep=sleep,
        )
        retries += page_retries
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
    quality = validate_m5_dataset(
        _dataset_from(candles, symbol=symbol, source=base_url, retrieved_at=retrieved_at),
        now=retrieved_at,
    )
    assert_m5_ready(quality)
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
        retries=retries,
        quality=quality.to_dict(),
    )
    return candles, report


def write_artifact(candles: list[Candle], report: DownloadReport, out_dir: str | Path) -> Path:
    """Write deterministic CSV + provenance JSON. Existing artifacts are replaced.

    The quality policy is re-run before writing, so an invalid series cannot be
    persisted as a usable artifact even if the caller built the report by hand.
    """
    quality = validate_m5_dataset(
        _dataset_from(candles, symbol=report.symbol, source=report.source,
                      retrieved_at=report.retrieved_at),
        now=report.retrieved_at,
    )
    assert_m5_ready(quality)
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
        "quality": quality.to_dict(),
    })
    side_path = csv_path.with_suffix(".provenance.json")
    side_path.write_text(json.dumps(provenance, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return csv_path


def load_artifact(path: str | Path, *, max_stale_bars: int = MAX_STALE_BARS, now: datetime | None = None):
    """Load an M5 artifact and reject stale or structurally invalid data.

    ``live_ready`` therefore means "on the 5-minute UTC grid, gap-free and fresh
    relative to the supplied retrieval/reference time". It is a data-quality
    label only; it never enables a live order or exchange action.
    """
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
    quality = validate_m5_dataset(
        dataset,
        now=canonical_timestamp(reference.isoformat()),
        max_lag_minutes=max_stale_bars * (STEP_SECONDS / 60.0),
    )
    assert_m5_ready(quality, require_live=True)
    enriched = dict(metadata)
    enriched["quality"] = quality.to_dict()
    return dataset, enriched


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
