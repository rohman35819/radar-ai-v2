#!/usr/bin/env python3
"""Deterministic, offline SMA-crossover research backtest. Never sends orders."""
from __future__ import annotations

import argparse
import csv
import json
import math
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Sequence


MAX_SWEEP_WORKERS = 4
_SWEEP_CONTEXT: tuple[list["Candle"], float, float] | None = None


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


def _sma_series(values: list[float], period: int) -> list[float | None]:
    """Calculate every SMA in O(n) time with O(n) output memory."""
    averages: list[float | None] = [None] * len(values)
    rolling_sum = 0.0
    for index, value in enumerate(values):
        rolling_sum += value
        if index >= period:
            rolling_sum -= values[index - period]
        if index >= period - 1:
            averages[index] = rolling_sum / period
    return averages


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
    fast_averages = _sma_series(closes, fast_period)
    slow_averages = _sma_series(closes, slow_period)
    signals = [0] * len(closes)
    for index in range(slow_period - 1, len(closes)):
        fast_average = fast_averages[index]
        slow_average = slow_averages[index]
        if fast_average is not None and slow_average is not None:
            signals[index] = int(fast_average > slow_average)

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


def _initialize_sweep_worker(candles: list[Candle], fee_bps: float, slippage_bps: float) -> None:
    global _SWEEP_CONTEXT
    _SWEEP_CONTEXT = (candles, fee_bps, slippage_bps)


def _run_sweep_job(periods: tuple[int, int]) -> dict[str, float | int | str]:
    if _SWEEP_CONTEXT is None:
        raise RuntimeError("Sweep worker belum diinisialisasi")
    candles, fee_bps, slippage_bps = _SWEEP_CONTEXT
    return run_backtest(candles, periods[0], periods[1], fee_bps, slippage_bps)


def run_parameter_sweep(
    candles: Iterable[Candle],
    parameter_sets: Sequence[tuple[int, int]],
    fee_bps: float = 10.0,
    slippage_bps: float = 5.0,
    max_workers: int = 1,
) -> list[dict[str, float | int | str]]:
    """Run deterministic (fast, slow) parameter sets in a bounded process pool.

    Results always follow input order. The default is serial; parallel execution is
    explicit and capped to limit memory duplication for large historical datasets.
    """
    if not isinstance(max_workers, int) or isinstance(max_workers, bool) or not 1 <= max_workers <= MAX_SWEEP_WORKERS:
        raise ValueError(f"max_workers harus antara 1 dan {MAX_SWEEP_WORKERS}")
    rows = list(candles)
    parameters = list(parameter_sets)
    if not parameters:
        return []
    if not all(
        isinstance(pair, tuple) and len(pair) == 2 and
        all(isinstance(value, int) and not isinstance(value, bool) for value in pair) and
        2 <= pair[0] < pair[1] < len(rows)
        for pair in parameters
    ):
        raise ValueError("Setiap parameter harus tuple integer dengan 2 <= fast < slow < jumlah candle")
    if not all(math.isfinite(value) and 0 <= value <= 10000 for value in (fee_bps, slippage_bps)):
        raise ValueError("Fee/slippage harus antara 0 dan 10000 bps")
    if max_workers == 1 or len(parameters) == 1:
        return [run_backtest(rows, fast, slow, fee_bps, slippage_bps) for fast, slow in parameters]
    with ProcessPoolExecutor(
        max_workers=min(max_workers, len(parameters)),
        initializer=_initialize_sweep_worker,
        initargs=(rows, fee_bps, slippage_bps),
    ) as pool:
        # executor.map preserves input order despite parallel completion order.
        return list(pool.map(_run_sweep_job, parameters))


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
