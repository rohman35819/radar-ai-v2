import tempfile
import unittest
from pathlib import Path

from backtest import Candle, load_candles, run_backtest, run_parameter_sweep


class BacktestTests(unittest.TestCase):
    def setUp(self):
        self.candles = [
            Candle(f"2026-01-{day:02d}T00:00:00Z", close)
            for day, close in enumerate(
                [10, 9, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
                start=1,
            )
        ]

    def test_backtest_returns_metrics_and_never_exceeds_defined_scope(self):
        result = run_backtest(self.candles, fast_period=3, slow_period=5, fee_bps=10, slippage_bps=5)
        self.assertEqual(result["strategy"], "SMA crossover long/flat")
        self.assertEqual(result["candles"], len(self.candles))
        self.assertGreaterEqual(result["entries"], 0)
        self.assertGreaterEqual(result["position_changes"], result["entries"])
        self.assertGreaterEqual(result["max_drawdown_pct"], 0)
        self.assertIn("bukan prediksi", result["disclaimer"])

    def test_costs_reduce_or_preserve_return(self):
        free = run_backtest(self.candles, 3, 5, 0, 0)
        costly = run_backtest(self.candles, 3, 5, 20, 10)
        self.assertLessEqual(costly["strategy_return_pct"], free["strategy_return_pct"])

    def test_rejects_bad_periods_and_short_history(self):
        with self.assertRaises(ValueError):
            run_backtest(self.candles, 5, 5)
        with self.assertRaises(ValueError):
            run_backtest(self.candles[:5], 3, 5)

    def test_backtest_orders_timestamps_by_instant_not_string(self):
        out_of_order = [
            Candle("2026-01-01T00:00:00Z", 10),
            Candle("2026-01-01T00:30:00+02:00", 11),
            Candle("2026-01-01T01:00:00Z", 12),
            Candle("2026-01-01T02:00:00Z", 13),
            Candle("2026-01-01T03:00:00Z", 14),
            Candle("2026-01-01T04:00:00Z", 15),
        ]
        with self.assertRaises(ValueError):
            run_backtest(out_of_order, 2, 3)
        missing_timezone = [Candle("2026-01-01T00:00:00", 10)] + self.candles[1:]
        with self.assertRaises(ValueError):
            run_backtest(missing_timezone, 3, 5)

    def test_parallel_parameter_sweep_matches_serial_and_preserves_order(self):
        parameters = [(2, 4), (3, 6), (4, 8)]
        serial = run_parameter_sweep(self.candles, parameters, fee_bps=12, slippage_bps=7, max_workers=1)
        parallel = run_parameter_sweep(self.candles, parameters, fee_bps=12, slippage_bps=7, max_workers=2)
        self.assertEqual(parallel, serial)
        self.assertEqual(
            [(row["fast_period"], row["slow_period"]) for row in parallel],
            parameters,
        )

    def test_parameter_sweep_rejects_unbounded_workers_and_invalid_periods(self):
        with self.assertRaises(ValueError):
            run_parameter_sweep(self.candles, [(2, 4)], max_workers=5)
        with self.assertRaises(ValueError):
            run_parameter_sweep(self.candles, [(4, 2)])
        with self.assertRaises(ValueError):
            run_parameter_sweep(self.candles, [(2, 100)])

    def test_large_history_backtest_uses_rolling_sma_path(self):
        candles = [
            Candle(f"2026-01-01T00:{index // 60:02d}:{index % 60:02d}Z", 100 + (index % 97) / 10)
            for index in range(10000)
        ]
        result = run_backtest(candles, fast_period=8, slow_period=55)
        self.assertEqual(result["candles"], 10000)
        self.assertGreaterEqual(result["max_drawdown_pct"], 0)

    def test_csv_requires_timezone_sorted_positive_close(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "candles.csv"
            path.write_text(
                "timestamp,close\n2026-01-01T00:00:00Z,10\n2026-01-02T00:00:00Z,11\n2026-01-03T00:00:00Z,12\n",
                encoding="utf-8",
            )
            self.assertEqual(len(load_candles(path)), 3)
            path.write_text(
                "timestamp,close\n2026-01-02T00:00:00Z,10\n2026-01-01T00:00:00Z,11\n",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                load_candles(path)
            path.write_text(
                "timestamp,close\n2026-01-01T00:00:00,10\n2026-01-02T00:00:00Z,11\n",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                load_candles(path)


if __name__ == "__main__":
    unittest.main()
