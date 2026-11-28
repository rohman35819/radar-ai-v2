"""M5 data-quality, pagination and retry regression tests (offline, no network).

The guard must fail closed on missing, duplicate, out-of-order, invalid OHLCV,
zero/negative-volume, misaligned, incomplete or stale bars. Bars are never
repaired or synthesised. Retry tests use injected sleep/fetch callables, so the
suite is deterministic and never contacts Binance.
"""
from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse

from m5_data import (
    STEP_SECONDS,
    download_m5,
    kline_to_candle,
    load_artifact,
    write_artifact,
)
from m5_quality import (
    M5_SECONDS,
    assert_m5_ready,
    load_m5_ohlcv,
    validate_m5_dataset,
)
from quant_data import (
    Candle,
    DataQualityError,
    Dataset,
    QualityReport,
    load_ohlcv,
    parse_timestamp,
)

FIXTURE = Path(__file__).parent / "fixtures" / "m5" / "btcusdt_5m_public.csv"
SIDECAR = FIXTURE.with_suffix(".provenance.json")
NOW = datetime(2026, 1, 2, 0, 10, tzinfo=timezone.utc)
LATER = NOW + timedelta(minutes=15)


def m5_candles(count: int = 12, start: str = "2026-01-01T00:00:00Z",
               price: float = 100.0, volume: float = 10.0) -> list[Candle]:
    base = datetime.fromisoformat(start.replace("Z", "+00:00"))
    candles: list[Candle] = []
    for index in range(count):
        timestamp = (base + timedelta(minutes=5 * index)).isoformat().replace("+00:00", "Z")
        open_price = price + index * 0.1
        close_price = open_price + 0.05
        candles.append(Candle(
            timestamp=timestamp,
            open=open_price,
            high=max(open_price, close_price) + 0.2,
            low=min(open_price, close_price) - 0.2,
            close=close_price,
            volume=volume,
        ))
    return candles


def dataset_from(candles: list[Candle], retrieved_at: str = "2026-01-02T00:00:00Z") -> Dataset:
    quality = QualityReport(
        rows=len(candles),
        start=candles[0].timestamp,
        end=candles[-1].timestamp,
        interval="5m",
        duplicate_timestamps=0,
        missing_intervals=0,
        ohlcv_violations=0,
        accepted=True,
        issues=(),
    )
    return Dataset(
        candles=tuple(candles),
        provenance={
            "schema_version": "1.0.0",
            "source": "unit-test",
            "symbol": "BTCUSDT",
            "interval": "5m",
            "retrieved_at": retrieved_at,
            "data_kind": "synthetic",
            "start": candles[0].timestamp,
            "end": candles[-1].timestamp,
            "rows": len(candles),
            "checksum_sha256": "0" * 64,
        },
        quality=quality,
        checksum="0" * 64,
    )


def kline(index: int, *, open_ms: int | None = None, volume: str = "10") -> list[float | int | str]:
    start_ms = open_ms if open_ms is not None else int((NOW - timedelta(minutes=20)).timestamp() * 1000)
    opened = start_ms + index * STEP_SECONDS * 1000
    close = opened + STEP_SECONDS * 1000 - 1
    price = 100.0 + index
    return [opened, str(price), str(price + 2), str(price - 1), str(price + 1), volume, close]


class RealFixtureTests(unittest.TestCase):
    def test_real_btcusdt_m5_fixture_is_clean_and_reproducible(self):
        provenance = json.loads(SIDECAR.read_text(encoding="utf-8"))
        dataset, metadata = load_artifact(FIXTURE, now=parse_timestamp(provenance["retrieved_at"]))
        self.assertEqual(dataset.checksum, provenance["checksum_sha256"])
        self.assertEqual(len(dataset.candles), 9999)
        self.assertEqual(dataset.start, "2026-10-23T13:30:00Z")
        self.assertEqual(dataset.end, "2026-11-27T06:40:00Z")
        quality = metadata["quality"]
        self.assertEqual(quality["rows"], 9999)
        self.assertEqual(quality["duplicate_timestamps"], 0)
        self.assertEqual(quality["missing_intervals"], 0)
        self.assertEqual(quality["ohlcv_violations"], 0)
        self.assertEqual(quality["misaligned_timestamps"], 0)
        self.assertEqual(quality["zero_volume_candles"], 0)
        self.assertEqual(quality["negative_volume_candles"], 0)
        self.assertTrue(quality["structurally_accepted"])
        self.assertTrue(quality["live_ready"])

    def test_every_fixture_timestamp_is_on_the_five_minute_utc_grid(self):
        provenance = json.loads(SIDECAR.read_text(encoding="utf-8"))
        dataset, _ = load_artifact(FIXTURE, now=parse_timestamp(provenance["retrieved_at"]))
        for candle in dataset.candles:
            instant = candle.instant()
            self.assertEqual(instant.second, 0)
            self.assertEqual(instant.microsecond, 0)
            self.assertEqual(instant.minute % 5, 0)
            self.assertEqual(int(instant.timestamp()) % M5_SECONDS, 0)

    def test_historical_fixture_is_stale_at_a_later_reference_time(self):
        provenance = json.loads(SIDECAR.read_text(encoding="utf-8"))
        dataset = load_ohlcv(
            FIXTURE, source=provenance["source"], symbol=provenance["symbol"],
            interval="5m", retrieved_at=provenance["retrieved_at"],
            data_kind=provenance["data_kind"],
        )
        report = validate_m5_dataset(dataset, now="2026-11-28T00:00:00Z")
        self.assertTrue(report.stale)
        self.assertTrue(report.structurally_accepted)
        self.assertFalse(report.live_ready)
        with self.assertRaises(DataQualityError):
            load_artifact(FIXTURE, now=parse_timestamp("2026-11-28T00:00:00Z"))


class PolicyTests(unittest.TestCase):
    def test_missing_candle_is_rejected(self):
        candles = m5_candles(6)
        del candles[3]
        report = validate_m5_dataset(dataset_from(candles))
        self.assertEqual(report.missing_intervals, 1)
        self.assertFalse(report.structurally_accepted)
        self.assertIn("missing_intervals_exceed_limit", report.issues)
        with self.assertRaises(DataQualityError):
            assert_m5_ready(report)

    def test_duplicate_candle_is_rejected(self):
        candles = m5_candles(5)
        candles.insert(2, candles[2])
        report = validate_m5_dataset(dataset_from(candles))
        self.assertEqual(report.duplicate_timestamps, 1)
        self.assertFalse(report.structurally_accepted)
        self.assertIn("duplicate_timestamps", report.issues)

    def test_out_of_order_timestamps_are_rejected(self):
        candles = m5_candles(5)
        candles[2], candles[3] = candles[3], candles[2]
        with self.assertRaises(DataQualityError):
            validate_m5_dataset(dataset_from(candles))

    def test_invalid_ohlc_relationship_is_rejected(self):
        candles = m5_candles(5)
        candles[2] = replace(candles[2], high=99.0, low=98.0, open=100.0, close=100.0)
        report = validate_m5_dataset(dataset_from(candles))
        self.assertEqual(report.ohlcv_violations, 1)
        self.assertFalse(report.structurally_accepted)
        self.assertIn("ohlcv_invariants_violated", report.issues)

    def test_zero_volume_is_accepted_by_generic_guard_but_rejected_for_m5(self):
        candles = m5_candles(3, volume=0.0)
        header = "timestamp,open,high,low,close,volume\n"
        body = "".join(
            f"{candle.timestamp},{candle.open},{candle.high},{candle.low},{candle.close},{candle.volume}\n"
            for candle in candles
        )
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "zero_volume.csv"
            path.write_text(header + body, encoding="utf-8")
            generic = load_ohlcv(
                path, source="unit-test", symbol="BTCUSDT", interval="5m",
                retrieved_at="2026-01-02T00:00:00Z",
            )
            self.assertTrue(generic.quality.accepted)
            _, report = load_m5_ohlcv(
                path, source="unit-test", symbol="BTCUSDT",
                retrieved_at="2026-01-02T00:00:00Z",
            )
            self.assertEqual(report.zero_volume_candles, 3)
            self.assertFalse(report.structurally_accepted)
            self.assertIn("zero_volume_candles", report.issues)

    def test_negative_volume_is_rejected(self):
        candles = m5_candles(5)
        candles[2] = replace(candles[2], volume=-1.0)
        with self.assertRaises(DataQualityError):
            load_ohlcv(
                _write_csv(candles, "negative.csv"),
                source="unit-test", symbol="BTCUSDT", interval="5m",
            )

    def test_misaligned_five_minute_timestamp_is_rejected(self):
        candles = m5_candles(5)
        candles[2] = replace(candles[2], timestamp="2026-01-01T00:11:00Z")
        report = validate_m5_dataset(dataset_from(candles))
        self.assertEqual(report.misaligned_timestamps, 1)
        self.assertFalse(report.structurally_accepted)
        self.assertIn("misaligned_timestamps", report.issues)

    def test_retrieval_before_dataset_end_is_rejected(self):
        candles = m5_candles(12)
        report = validate_m5_dataset(
            dataset_from(candles, retrieved_at="2026-01-01T00:30:00Z"),
        )
        self.assertTrue(report.retrieval_before_end)
        self.assertFalse(report.structurally_accepted)
        self.assertIn("retrieval_before_dataset_end", report.issues)

    def test_stale_future_and_fresh_classification_is_fail_closed(self):
        candles = m5_candles(12)
        dataset = dataset_from(candles, retrieved_at="2026-01-01T00:56:00Z")
        fresh = validate_m5_dataset(dataset, now="2026-01-01T01:00:00Z", max_lag_minutes=15)
        self.assertTrue(fresh.live_ready)
        stale = validate_m5_dataset(dataset, now="2026-01-01T02:00:00Z", max_lag_minutes=15)
        self.assertTrue(stale.stale)
        self.assertTrue(stale.structurally_accepted)
        self.assertFalse(stale.live_ready)
        future = validate_m5_dataset(dataset, now="2026-01-01T00:45:00Z", max_lag_minutes=15)
        self.assertTrue(future.future_data)
        self.assertFalse(future.live_ready)
        assert_m5_ready(stale)
        with self.assertRaises(DataQualityError):
            assert_m5_ready(stale, require_live=True)


def _write_csv(candles: list[Candle], name: str) -> Path:
    folder = Path(tempfile.mkdtemp())
    path = folder / name
    lines = ["timestamp,open,high,low,close,volume"]
    lines.extend(
        f"{candle.timestamp},{candle.open},{candle.high},{candle.low},{candle.close},{candle.volume}"
        for candle in candles
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


class ArtifactWiringTests(unittest.TestCase):
    def make_artifact(self, folder: str):
        candles, report = download_m5(
            "BTCUSDT", pages=1, fetch_json=lambda _url: [kline(i) for i in range(4)], now=NOW,
            sleep=lambda _seconds: None,
        )
        return write_artifact(candles, report, folder)

    def rewrite(self, path: Path, mutate) -> None:
        meta = json.loads(path.with_suffix(".provenance.json").read_text(encoding="utf-8"))
        lines = mutate(path.read_text(encoding="utf-8").splitlines())
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        meta["checksum_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        path.with_suffix(".provenance.json").write_text(
            json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8",
        )

    def test_provenance_contains_quality_and_retry_fields(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.make_artifact(folder)
            meta = json.loads(path.with_suffix(".provenance.json").read_text(encoding="utf-8"))
            self.assertEqual(meta["quality"]["duplicate_timestamps"], 0)
            self.assertEqual(meta["quality"]["missing_intervals"], 0)
            self.assertIn("retries", meta)
            dataset, enriched = load_artifact(path, now=NOW)
            self.assertEqual(enriched["quality"]["rows"], len(dataset.candles))

    def test_load_rejects_missing_candle_with_valid_checksum(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.make_artifact(folder)
            self.rewrite(path, lambda lines: lines[:2] + lines[3:])
            with self.assertRaises(DataQualityError):
                load_artifact(path, now=NOW)

    def test_load_rejects_duplicate_candle_with_valid_checksum(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.make_artifact(folder)
            self.rewrite(path, lambda lines: lines + [lines[-1]])
            with self.assertRaises(DataQualityError):
                load_artifact(path, now=NOW)

    def test_load_rejects_zero_volume_candle_with_valid_checksum(self):
        with tempfile.TemporaryDirectory() as folder:
            path = self.make_artifact(folder)
            def zero(lines):
                fields = lines[2].split(",")
                fields[5] = "0"
                lines[2] = ",".join(fields)
                return lines
            self.rewrite(path, zero)
            with self.assertRaises(DataQualityError):
                load_artifact(path, now=NOW)


class DownloadRetryTests(unittest.TestCase):
    def test_transient_http_error_is_retried_then_succeeds(self):
        calls = {"n": 0}
        sleeps: list[float] = []

        def fetch(_url):
            calls["n"] += 1
            if calls["n"] == 1:
                raise HTTPError("https://example.invalid", 503, "busy", {"Retry-After": "2"}, None)
            return [kline(i) for i in range(4)]

        candles, report = download_m5(
            "BTCUSDT", pages=1, fetch_json=fetch, now=NOW, sleep=sleeps.append,
        )
        self.assertEqual(len(candles), 4)
        self.assertEqual(report.retries, 1)
        self.assertEqual(sleeps, [2.0])

    def test_network_error_is_retried_with_bounded_backoff(self):
        calls = {"n": 0}
        sleeps: list[float] = []

        def fetch(_url):
            calls["n"] += 1
            if calls["n"] < 3:
                raise URLError("temporary")
            return [kline(i) for i in range(4)]

        _, report = download_m5(
            "BTCUSDT", pages=1, fetch_json=fetch, now=NOW, sleep=sleeps.append,
            backoff_seconds=0.5, max_backoff_seconds=0.5,
        )
        self.assertEqual(report.retries, 2)
        self.assertEqual(sleeps, [0.5, 0.5])

    def test_persistent_failure_raises_after_bounded_attempts(self):
        calls = {"n": 0}

        def fetch(_url):
            calls["n"] += 1
            raise URLError("offline")

        with self.assertRaises(DataQualityError):
            download_m5(
                "BTCUSDT", pages=1, fetch_json=fetch, now=NOW,
                sleep=lambda _seconds: None, max_attempts=3,
            )
        self.assertEqual(calls["n"], 3)

    def test_non_retryable_http_error_fails_immediately(self):
        calls = {"n": 0}

        def fetch(_url):
            calls["n"] += 1
            raise HTTPError("https://example.invalid", 400, "bad request", None, None)

        with self.assertRaises(DataQualityError):
            download_m5("BTCUSDT", pages=1, fetch_json=fetch, now=NOW,
                        sleep=lambda _seconds: None)
        self.assertEqual(calls["n"], 1)

    def test_page_delay_is_applied_between_pages(self):
        sleeps: list[float] = []

        def fetch(url):
            end = int(parse_qs(urlparse(url).query).get("endTime", ["0"])[0])
            return [kline(i) for i in (range(3, 6) if end == 0 else range(0, 3))]

        download_m5(
            "BTCUSDT", pages=2, fetch_json=fetch, now=NOW,
            sleep=sleeps.append, page_delay_seconds=0.25,
        )
        self.assertEqual(sleeps, [0.25])


class PaginationIntegrityTests(unittest.TestCase):
    def test_duplicate_across_pages_is_rejected(self):
        def fetch(url):
            end = int(parse_qs(urlparse(url).query).get("endTime", ["0"])[0])
            return [kline(i) for i in (range(2, 5) if end == 0 else range(0, 3))]

        with self.assertRaises(DataQualityError) as caught:
            download_m5("BTCUSDT", pages=2, fetch_json=fetch, now=LATER,
                        sleep=lambda _seconds: None)
        self.assertIn("duplicate", str(caught.exception).lower())

    def test_gap_across_pages_is_rejected(self):
        def fetch(url):
            end = int(parse_qs(urlparse(url).query).get("endTime", ["0"])[0])
            return [kline(i) for i in (range(3, 6) if end == 0 else range(0, 2))]

        with self.assertRaises(DataQualityError) as caught:
            download_m5("BTCUSDT", pages=2, fetch_json=fetch, now=LATER,
                        sleep=lambda _seconds: None)
        self.assertIn("missing", str(caught.exception).lower())

    def test_contiguous_pages_have_no_duplicates_or_gaps(self):
        def fetch(url):
            end = int(parse_qs(urlparse(url).query).get("endTime", ["0"])[0])
            return [kline(i) for i in (range(3, 6) if end == 0 else range(0, 3))]

        candles, report = download_m5(
            "BTCUSDT", pages=2, fetch_json=fetch, now=NOW,
            sleep=lambda _seconds: None,
        )
        timestamps = [candle.timestamp for candle in candles]
        self.assertEqual(len(timestamps), len(set(timestamps)))
        self.assertEqual(report.rows, len(candles))
        self.assertEqual(report.quality["missing_intervals"], 0)

    def test_open_candle_is_never_used(self):
        open_candle = kline(0, open_ms=int(NOW.timestamp() * 1000) - 60_000)
        self.assertIsNone(kline_to_candle(open_candle, now=NOW))


if __name__ == "__main__":
    unittest.main()
