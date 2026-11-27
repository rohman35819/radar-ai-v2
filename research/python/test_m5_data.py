"""Deterministic M5 data-quality tests: no network, no paid service."""
from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from m5_data import (
    STEP_SECONDS,
    build_url,
    download_m5,
    kline_to_candle,
    load_artifact,
    write_artifact,
)
from quant_data import DataQualityError

NOW = datetime(2026, 1, 2, 0, 10, tzinfo=timezone.utc)


def kline(index: int, *, open_candle: bool = False) -> list[float | int | str]:
    open_ms = int((NOW - timedelta(minutes=20)).timestamp() * 1000) + index * STEP_SECONDS * 1000
    close_ms = open_ms + STEP_SECONDS * 1000 - 1
    if open_candle:
        close_ms = int(NOW.timestamp() * 1000) + 60_000
    price = 100.0 + index
    return [open_ms, str(price), str(price + 2), str(price - 1), str(price + 1), "10", close_ms]


class M5DataTests(unittest.TestCase):
    def test_build_url_is_public_and_bounded(self):
        url = build_url("btcusdt", "https://example.invalid/klines", 1000)
        query = parse_qs(urlparse(url).query)
        self.assertEqual(query["symbol"], ["BTCUSDT"])
        self.assertEqual(query["interval"], ["5m"])
        self.assertEqual(query["limit"], ["1000"])
        self.assertEqual(query["startTime"], ["1000"])

    def test_open_candle_is_rejected_as_final(self):
        self.assertIsNone(kline_to_candle(kline(3, open_candle=True), now=NOW))
        closed = kline_to_candle(kline(3), now=NOW)
        self.assertIsNotNone(closed)
        self.assertEqual(closed.close, 104.0)

    def test_pagination_is_ascending_and_bounded(self):
        def fetch(url: str):
            end = int(parse_qs(urlparse(url).query).get("endTime", ["0"])[0])
            if end == 0:
                return [kline(i) for i in range(3, 6)]
            return [kline(i) for i in range(0, 3)]

        candles, report = download_m5("BTCUSDT", pages=2, fetch_json=fetch, now=NOW + timedelta(minutes=30))
        self.assertEqual(len(candles), 6)
        self.assertEqual(report.pages, 2)
        self.assertEqual(report.skipped_open_candles, 0)
        self.assertEqual([c.timestamp for c in candles], sorted(c.timestamp for c in candles))

    def test_artifact_roundtrip_checksum_and_freshness(self):
        candles, report = download_m5(
            "BTCUSDT",
            pages=1,
            fetch_json=lambda _url: [kline(i) for i in range(4)],
            now=NOW,
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = write_artifact(candles, report, tmp)
            meta = json.loads(path.with_suffix(".provenance.json").read_text())
            self.assertEqual(meta["rows"], 4)
            self.assertEqual(meta["interval"], "5m")
            dataset, loaded = load_artifact(path, now=NOW)
            self.assertEqual(len(dataset.candles), 4)
            self.assertEqual(loaded["checksum_sha256"], dataset.checksum)
            with self.assertRaises(DataQualityError):
                load_artifact(path, now=NOW + timedelta(hours=2))

    def test_duplicate_and_gap_are_rejected_on_load(self):
        candles, report = download_m5(
            "BTCUSDT",
            pages=1,
            fetch_json=lambda _url: [kline(i) for i in range(4)],
            now=NOW,
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = write_artifact(candles, report, tmp)
            raw = path.read_text().splitlines()
            raw.append(raw[-1])  # duplicate last timestamp
            path.write_text("\n".join(raw) + "\n")
            with self.assertRaises(DataQualityError):
                load_artifact(path, now=NOW)
            raw = path.read_text().splitlines()[:-1]
            broken = raw[:-1] + [raw[-1].replace("T00:05", "T01:05", 1)]
            path.write_text("\n".join(broken) + "\n")
            with self.assertRaises(DataQualityError):
                load_artifact(path, now=NOW)


if __name__ == "__main__":
    unittest.main()
