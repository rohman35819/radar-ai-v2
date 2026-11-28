#!/usr/bin/env python3
"""Benchmark the O(n) signal generator against the previous O(n^2) version.

Usage: python3 bench_signals.py
Prints wall-clock seconds and the growth ratio between input sizes. Timing is
device-dependent; the deterministic call-count test in
``test_strategy_equivalence.py`` is the primary complexity proof.
"""
from __future__ import annotations

import time

from quant_data import Candle
from strategy import StrategyConfig, generate_signals
from test_strategy_equivalence import reference_signals

SIZES = (500, 1000, 2000, 4000)


def candles(count: int) -> list[Candle]:
    return [
        Candle(
            timestamp=f'2026-01-{1 + index // 288:02d}T{(index % 288) // 12:02d}:{(index % 12) * 5:02d}:00Z',
            open=100.0 + index * 0.01,
            high=100.5 + index * 0.01,
            low=99.5 + index * 0.01,
            close=100.0 + index * 0.01 + (index % 7) * 0.03,
            volume=10.0,
        )
        for index in range(count)
    ]


def timed(function, rows, config) -> float:
    start = time.perf_counter()
    function(rows, config)
    return time.perf_counter() - start


def main() -> int:
    config = StrategyConfig(strategy_id='sma_crossover')
    print(f"{'bars':>6} {'old_s':>10} {'new_s':>10} {'speedup':>9}")
    previous_old = previous_new = None
    for size in SIZES:
        rows = candles(size)
        old = timed(reference_signals, rows, config)
        new = timed(generate_signals, rows, config)
        speedup = old / new if new > 0 else float('inf')
        print(f'{size:>6} {old:>10.4f} {new:>10.4f} {speedup:>9.1f}x')
        if previous_old and previous_new:
            print(f'       growth old {old / previous_old:.2f}x, new {new / previous_new:.2f}x')
        previous_old, previous_new = old, new
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
