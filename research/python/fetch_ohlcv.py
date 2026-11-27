#!/usr/bin/env python3
"""Optional free public Binance klines adapter. No API key, no orders.

External market endpoints are unreachable from some research sessions; this
module is therefore also usable with an injected fetch_json callable so the
mapping and validation logic is testable offline with synthetic responses.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from quant_data import REQUIRED_COLUMNS, canonical_timestamp

BASE_URL = "https://data-api.binance.vision/api/v3/klines"
FetchJson = Callable[[str], Any]


def build_url(
    symbol: str,
    interval: str,
    limit: int,
    start_time: int | None = None,
    base_url: str = BASE_URL,
) -> str:
    params: dict[str, str | int] = {"symbol": symbol.upper(), "interval": interval, "limit": limit}
    if start_time is not None:
        params["startTime"] = start_time
    return base_url + "?" + urllib.parse.urlencode(params)


def parse_klines(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list) or not payload:
        raise ValueError("Response klines harus array tidak kosong")
    rows: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, list) or len(item) < 6:
            raise ValueError("Setiap kline harus memiliki minimal 6 field")
        try:
            timestamp = canonical_timestamp(datetime.fromtimestamp(item[0] / 1000, timezone.utc).isoformat())
            row = {
                "timestamp": timestamp,
                "open": float(item[1]),
                "high": float(item[2]),
                "low": float(item[3]),
                "close": float(item[4]),
                "volume": float(item[5]),
                "close_time_ms": int(item[6]) if len(item) > 6 else None,
            }
        except (TypeError, ValueError, OverflowError):
            raise ValueError("Field kline tidak valid") from None
        if not all(isinstance(row[field], float) and row[field] > 0 for field in ("open", "high", "low", "close")):
            raise ValueError("Harga OHLC harus finite dan positif")
        if row["volume"] < 0:
            raise ValueError("Volume tidak boleh negatif")
        if row["high"] < max(row["open"], row["close"], row["low"]):
            raise ValueError("High melanggar invariant OHLC")
        if row["low"] > min(row["open"], row["close"], row["high"]):
            raise ValueError("Low melanggar invariant OHLC")
        rows.append(row)
    for previous, current in zip(rows, rows[1:]):
        if current["timestamp"] <= previous["timestamp"]:
            raise ValueError("Timestamp kline harus naik")
    return rows


def drop_incomplete(rows: Sequence[Mapping[str, Any]], now_ms: int | None = None) -> list[dict[str, Any]]:
    current = int(time.time() * 1000) if now_ms is None else now_ms
    return [
        {"timestamp": row["timestamp"], "open": row["open"], "high": row["high"],
         "low": row["low"], "close": row["close"], "volume": row["volume"]}
        for row in rows
        if row.get("close_time_ms") is None or row["close_time_ms"] < current
    ]


def write_csv(rows: Sequence[Mapping[str, Any]], path: str | Path) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(REQUIRED_COLUMNS), lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row[field] for field in REQUIRED_COLUMNS})
    return target


def default_fetch(url: str) -> Any:
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "radar-ai-quant-research"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--interval", default="1d")
    parser.add_argument("--limit", type=int, default=365)
    parser.add_argument("--start-time", default=None,
                        help="ISO-8601 UTC start time or epoch milliseconds (free public history)")
    parser.add_argument("--base-url", default=BASE_URL,
                        help="Free public klines endpoint (default: data-api.binance.vision)")
    parser.add_argument("--output", default="research/python/fixtures/btcusdt_1d_public.csv")
    args = parser.parse_args(argv)
    if not 1 <= args.limit <= 1000:
        raise SystemExit("--limit wajib 1..1000")
    start_time = None
    if args.start_time is not None:
        raw = args.start_time.strip()
        if raw.isdigit():
            start_time = int(raw)
        else:
            try:
                parsed_start = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                if parsed_start.tzinfo is None:
                    raise ValueError("timezone required")
                start_time = int(parsed_start.timestamp() * 1000)
            except ValueError:
                raise SystemExit("--start-time wajib ISO-8601 berzona waktu atau epoch ms") from None
    url = build_url(args.symbol, args.interval, args.limit,
                    start_time=start_time, base_url=args.base_url)
    rows = drop_incomplete(parse_klines(default_fetch(url)))
    if len(rows) < 3:
        raise SystemExit("Data publik tidak cukup untuk backtest")
    path = write_csv(rows, args.output)
    provenance = {
        "schema_version": "1.0.0",
        "source": url,
        "symbol": args.symbol.upper(),
        "interval": args.interval,
        "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "data_kind": "public_api",
        "rows": len(rows),
        "start": rows[0]["timestamp"],
        "end": rows[-1]["timestamp"],
        "checksum_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "output": str(path),
    }
    sidecar = path.with_suffix(".provenance.json")
    sidecar.write_text(json.dumps(provenance, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({**provenance, "provenance": str(sidecar)}, indent=2, sort_keys=True, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
