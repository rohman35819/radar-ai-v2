"""Deterministic unit tests for the quant MVP vertical slice (offline, no network)."""
from __future__ import annotations

import csv
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from backtest_engine import run_backtest
from fetch_ohlcv import build_url, drop_incomplete, parse_klines
from make_fixture import generate
from quant_data import DataQualityError, load_ohlcv, slice_dataset
from report import REPORT_SCHEMA, RunMeta, build_report, write_report
from strategy import StrategyConfig, generate_signals
from validation import run_validation, split_three, walk_forward

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_btcusdt_1d.csv"


class QuantMvpTests(unittest.TestCase):
    def setUp(self):
        self.dataset = load_ohlcv(
            FIXTURE, source="synthetic-fixture", symbol="BTCUSDT", interval="1d",
            retrieved_at="2026-11-27T00:00:00Z", data_kind="synthetic",
        )
        self.config = StrategyConfig(fast=5, slow=20, fee_bps=10, slippage_bps=5)

    def test_fixture_passes_quality_guard_and_keeps_provenance(self):
        self.assertTrue(self.dataset.quality.accepted)
        self.assertEqual(self.dataset.quality.rows, 360)
        self.assertEqual(self.dataset.provenance["data_kind"], "synthetic")
        self.assertEqual(len(self.dataset.checksum), 64)
        self.assertEqual(self.dataset.start, "2025-01-01T00:00:00Z")
        self.assertEqual(self.dataset.end, "2025-12-26T00:00:00Z")

    def test_quality_rejects_duplicates_gaps_and_bad_ohlc(self):
        header = "timestamp,open,high,low,close,volume\n"
        good = "2026-01-01T00:00:00Z,10,11,9,10.5,100\n2026-01-02T00:00:00Z,10.5,12,10,11,120\n2026-01-03T00:00:00Z,11,12,10,11.5,130\n"
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "bad.csv"
            path.write_text(header + good, encoding="utf-8")
            self.assertTrue(load_ohlcv(path, source="t", symbol="T").quality.accepted)
            path.write_text(header + good.replace("2026-01-03", "2026-01-02"), encoding="utf-8")
            with self.assertRaises(DataQualityError):
                load_ohlcv(path, source="t", symbol="T")
            path.write_text(header + good.replace("2026-01-03", "2026-01-05"), encoding="utf-8")
            with self.assertRaises(DataQualityError):
                load_ohlcv(path, source="t", symbol="T")
            path.write_text(header + good.replace("10.5,100", "13,100"), encoding="utf-8")
            with self.assertRaises(DataQualityError):
                load_ohlcv(path, source="t", symbol="T")

    def test_signals_never_read_future_candles(self):
        rows = list(self.dataset.candles[:80])
        first = generate_signals(rows, self.config)
        extended = generate_signals(rows + list(self.dataset.candles[80:100]), self.config)
        self.assertEqual(first, extended[:len(first)])
        self.assertTrue(all(signal.computed_from in [c.timestamp for c in rows[:i]]
                            for i, signal in enumerate(first) if signal.computed_from))

    def test_backtest_prefix_is_independent_of_future_data(self):
        full_signals = generate_signals(self.dataset.candles, self.config)
        full = run_backtest(self.dataset, self.config, full_signals)
        prefix = slice_dataset(self.dataset, 0, 200)
        prefix_result = run_backtest(prefix, self.config, full_signals[:200])
        self.assertEqual(prefix_result.equity_curve, full.equity_curve[:200])

    def test_costs_reduce_returns_and_metrics_are_well_formed(self):
        signals = generate_signals(self.dataset.candles, self.config)
        cheap = run_backtest(self.dataset, StrategyConfig(5, 20, 0, 0), signals)
        costly = run_backtest(self.dataset, StrategyConfig(5, 20, 40, 25), signals)
        self.assertLessEqual(costly.metrics["net_return_pct"], cheap.metrics["net_return_pct"])
        self.assertLessEqual(costly.metrics["net_return_pct"], costly.metrics["gross_return_pct"])
        metrics = costly.metrics
        self.assertGreaterEqual(metrics["max_drawdown_pct"], 0)
        self.assertGreaterEqual(metrics["total_trades"], 0)
        self.assertTrue(0 <= metrics["win_rate_pct"] <= 100)
        self.assertTrue(0 <= metrics["exposure_pct"] <= 100)
        self.assertEqual(metrics["no_trade_return_pct"], 0.0)
        self.assertIn("buy_hold_net_pct", metrics)
        self.assertTrue(metrics["profit_factor"] is None or metrics["profit_factor"] >= 0)

    def test_stop_loss_and_kill_switch_are_recorded(self):
        rows = list(self.dataset.candles[:60])
        config = StrategyConfig(5, 20, 10, 5, stop_loss_pct=0.001, max_drawdown_stop_pct=0.01)
        segment = slice_dataset(self.dataset, 0, 60)
        result = run_backtest(segment, config, generate_signals(rows, config))
        self.assertTrue(result.metrics["kill_switch_triggered"])
        self.assertTrue(any(trade.reason in ("stop_loss", "drawdown_stop") for trade in result.trades))

    def test_splits_and_walk_forward_are_contiguous_and_disjoint(self):
        train, validation, oos = split_three(self.dataset)
        self.assertLess(train.end, validation.start)
        self.assertLess(validation.end, oos.start)
        folds = walk_forward(self.dataset, train_bars=120, test_bars=40)
        self.assertTrue(len(folds) >= 2)
        for train_fold, test_fold in folds:
            self.assertLess(train_fold.end, test_fold.start)
        self.assertNotEqual(folds[0][1].start, folds[1][1].start)

    def test_validation_is_reproducible_and_honest(self):
        first = run_validation(self.dataset, self.config)
        second = run_validation(self.dataset, self.config)
        self.assertEqual(first, second)
        self.assertIsInstance(first["accepted_for_paper_candidate"], bool)
        self.assertIsInstance(first["acceptance_reasons"], list)
        self.assertGreaterEqual(len(first["out_of_sample_metrics"]), 10)
        self.assertFalse(first["out_of_sample_metrics"].get("live_trading", False))
        self.assertIn("bukan", first["disclaimer"])

    def test_report_artifact_is_versioned_and_machine_readable(self):
        signals = generate_signals(self.dataset.candles, self.config)
        backtest = run_backtest(self.dataset, self.config, signals)
        validation = run_validation(self.dataset, self.config)
        meta = RunMeta(generated_at="2026-11-27T00:00:00Z")
        report = build_report(self.dataset, backtest, validation, meta, signals)
        self.assertEqual(report["report_schema"], REPORT_SCHEMA)
        self.assertEqual(report["data"]["provenance"]["data_kind"], "synthetic")
        self.assertEqual(report["signals_total"], len(signals))
        self.assertTrue(report["paper_only"])
        self.assertFalse(report["live_trading"])
        self.assertFalse(report["withdrawal"])
        self.assertFalse(report["profit_claim"])
        with tempfile.TemporaryDirectory() as folder:
            path = write_report(Path(folder) / "report.json", report)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), report)

    def test_public_data_adapter_maps_mocked_klines_and_rejects_bad_payload(self):
        start_ms = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
        payload = [
            [start_ms + i * 86400000, "100", "102", "99", "101", "500",
             start_ms + (i + 1) * 86400000 - 1, "0", 1, "0", "0", "0"]
            for i in range(5)
        ]
        rows = parse_klines(payload)
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[0]["timestamp"], "2026-01-01T00:00:00Z")
        self.assertEqual(drop_incomplete(rows, now_ms=start_ms + 10 * 86400000), [
            {key: row[key] for key in ("timestamp", "open", "high", "low", "close", "volume")}
            for row in rows
        ])
        self.assertEqual(len(drop_incomplete(rows, now_ms=start_ms + 86400000)), 1)
        with self.assertRaises(ValueError):
            parse_klines([])
        with self.assertRaises(ValueError):
            parse_klines([payload[0], [start_ms, "101", "99", "100", "100", "1"]])
        url = build_url("btcusdt", "1d", 100)
        self.assertIn("symbol=BTCUSDT", url)
        self.assertIn("interval=1d", url)
        self.assertIn("limit=100", url)
        self.assertNotIn("apiKey", url)

    def test_fixture_generator_is_deterministic(self):
        self.assertEqual(generate(12), generate(12))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fixture.csv"
            rows = generate(12)
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)
            self.assertEqual(len(load_ohlcv(path, source="t", symbol="T").candles), 12)


if __name__ == "__main__":
    unittest.main()
