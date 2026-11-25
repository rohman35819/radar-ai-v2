#!/usr/bin/env python3
"""Deterministic, offline SMA-crossover research backtest. Never sends orders."""
from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Candle:
    timestamp: str
    close: float


def load_candles(path: str | Path) -> list[Candle]:
    candles: list[Candle] = []
    with Path(path).open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or not {"timestamp", "close"}.issubset(reader.fieldnames):
            raise ValueError("CSV wajib memiliki kolom timestamp,close")
        for line, row in enumerate(reader, start=2):
            stamp = (row.get("timestamp") or "").strip()
            try:
                parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    raise ValueError
                close = float(row.get("close", ""))
            except (TypeError, ValueError):
                raise ValueError(f"Baris {line}: timestamp ISO-8601 berzona waktu dan close numerik wajib") from None
            if not math.isfinite(close) or close <= 0:
                raise ValueError(f"Baris {line}: close harus finite dan lebih besar dari nol")
            if candles and parsed <= datetime.fromisoformat(candles[-1].timestamp.replace("Z", "+00:00")):
                raise ValueError(f"Baris {line}: timestamp harus naik secara ketat")
            candles.append(Candle(stamp, close))
    if len(candles) < 3:
        raise ValueError("Minimal 3 candle diperlukan")
    return candles


def _sma(values: list[float], end: int, period: int) -> float:
    return sum(values[end - period + 1:end + 1]) / period


def run_backtest(
    candles: Iterable[Candle],
    fast_period: int = 5,
    slow_period: int = 20,
    fee_bps: float = 10.0,
    slippage_bps: float = 5.0,
) -> dict[str, float | int | str]:
    rows = list(candles)
    if fast_period < 2 or slow_period <= fast_period:
        raise ValueError("Periode wajib memenuhi 2 <= fast_period < slow_period")
    if len(rows) <= slow_period:
        raise ValueError("Histori harus lebih panjang daripada slow_period")
    if any(not math.isfinite(c.close) or c.close <= 0 for c in rows):
        raise ValueError("Semua close harus finite dan lebih besar dari nol")
    parsed_times = []
    for candle in rows:
        try:
            parsed = datetime.fromisoformat(candle.timestamp.replace("Z", "+00:00"))
        except (AttributeError, TypeError, ValueError):
            raise ValueError("Timestamp harus ISO-8601 berzona waktu") from None
        if parsed.tzinfo is None:
            raise ValueError("Timestamp harus ISO-8601 berzona waktu")
        parsed_times.append(parsed)
    if any(current <= previous for previous, current in zip(parsed_times, parsed_times[1:])):
        raise ValueError("Timestamp harus naik secara ketat berdasarkan waktu UTC")
    if not all(math.isfinite(x) and 0 <= x <= 10000 for x in (fee_bps, slippage_bps)):
        raise ValueError("Fee/slippage harus antara 0 dan 10000 bps")

    closes = [c.close for c in rows]
    signals = [0] * len(closes)
    for index in range(slow_period - 1, len(closes)):
        signals[index] = int(_sma(closes, index, fast_period) > _sma(closes, index, slow_period))

    cost_rate = (fee_bps + slippage_bps) / 10000
    equity = 1.0
    peak = 1.0
    max_drawdown = 0.0
    entries = 0
    position_changes = 0
    for index in range(1, len(closes)):
        position = signals[index - 1]  # signal at prior close; no look-ahead
        previous_position = signals[index - 2] if index >= 2 else 0
        turnover = abs(position - previous_position)
        if turnover:
            position_changes += 1
            if previous_position == 0 and position == 1:
                entries += 1
        market_return = closes[index] / closes[index - 1] - 1
        net_return = position * market_return - turnover * cost_rate
        equity *= max(0.0, 1 + net_return)
        peak = max(peak, equity)
        max_drawdown = max(max_drawdown, (peak - equity) / peak)

    buy_hold = closes[-1] / closes[0]
    return {
        "strategy": "SMA crossover long/flat",
        "fast_period": fast_period,
        "slow_period": slow_period,
        "fee_bps_per_side": fee_bps,
        "slippage_bps_per_side": slippage_bps,
        "strategy_return_pct": round((equity - 1) * 100, 4),
        "buy_hold_return_pct": round((buy_hold - 1) * 100, 4),
        "max_drawdown_pct": round(max_drawdown * 100, 4),
        "entries": entries,
        "position_changes": position_changes,
        "candles": len(rows),
        "disclaimer": "Simulasi historis offline; bukan prediksi, saran investasi, atau eksekusi order.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", help="CSV berisi timestamp ISO-8601 berzona waktu dan close")
    parser.add_argument("--fast", type=int, default=5)
    parser.add_argument("--slow", type=int, default=20)
    parser.add_argument("--fee-bps", type=float, default=10.0)
    parser.add_argument("--slippage-bps", type=float, default=5.0)
    args = parser.parse_args()
    result = run_backtest(load_candles(args.csv), args.fast, args.slow, args.fee_bps, args.slippage_bps)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
