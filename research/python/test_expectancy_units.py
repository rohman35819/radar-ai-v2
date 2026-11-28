"""Canonical expectancy-unit tests for both engines and the report verifier.

Canonical unit: every ``*_pct`` field is a percentage (1.0 means 1 %). The
verifier recomputes each trade from its entry/exit prices, so a report that
stores a fraction under a percent name must fail instead of passing because
producer and verifier share the same wrong convention.

Covered per engine: positive, negative, zero, one-trade and no-trade ledgers.
No network, exchange or credential is used.
"""
from __future__ import annotations

import copy
import statistics
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backtest_engine import run_backtest
from hybrid import HybridConfig, HybridSignal
from hybrid_backtest import run_hybrid_backtest
from quant_data import Candle, Dataset, QualityReport, load_ohlcv
from report import RunMeta, build_report
from strategy import Signal, StrategyConfig
from verify_report import mean_percent, trade_return_pct, verify, verify_m5

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def stamp(minutes: int = 0, days: int = 0) -> str:
    return (START + timedelta(days=days, minutes=minutes)).isoformat().replace("+00:00", "Z")


def candles_from(prices: list[float], *, step_minutes: int = 0) -> list[Candle]:
    rows = []
    for index, price in enumerate(prices):
        rows.append(Candle(
            timestamp=stamp(minutes=step_minutes * index, days=0 if step_minutes else index),
            open=price, high=price * 1.001, low=price * 0.999, close=price, volume=10.0,
        ))
    return rows


def make_dataset(rows: list[Candle], interval: str) -> Dataset:
    return Dataset(
        candles=tuple(rows),
        provenance={
            "schema_version": "1.0.0", "source": "unit-test", "symbol": "BTCUSDT",
            "interval": interval, "retrieved_at": "2026-02-01T00:00:00Z",
            "data_kind": "synthetic", "start": rows[0].timestamp,
            "end": rows[-1].timestamp, "rows": len(rows), "checksum_sha256": "0" * 64,
        },
        quality=QualityReport(
            rows=len(rows), start=rows[0].timestamp, end=rows[-1].timestamp,
            interval=interval, duplicate_timestamps=0, missing_intervals=0,
            ohlcv_violations=0, accepted=True, issues=(),
        ),
        checksum="0" * 64,
    )


def daily_dataset(prices: list[float], folder: str) -> tuple[Dataset, Path]:
    rows = candles_from(prices)
    header = "timestamp,open,high,low,close,volume\n"
    body = "".join(
        f"{row.timestamp},{row.open},{row.high},{row.low},{row.close},{row.volume}\n" for row in rows
    )
    path = Path(folder) / "prices_1d.csv"
    path.write_text(header + body, encoding="utf-8")
    dataset = load_ohlcv(
        path, source="unit-test", symbol="BTCUSDT", interval="1d",
        retrieved_at="2026-02-01T00:00:00Z", data_kind="synthetic",
    )
    return dataset, path


def one_d_signals(count: int, actions: dict[int, int]) -> list[Signal]:
    return [
        Signal(timestamp=stamp(days=index), target_position=actions.get(index, 0),
               computed_from=None, reference_price=None)
        for index in range(count)
    ]


def one_d_config(**overrides) -> StrategyConfig:
    base = dict(
        fee_bps=0.0, slippage_bps=0.0, funding_bps_per_day=0.0,
        position_fraction=1.0, stop_loss_pct=0.5, max_drawdown_stop_pct=0.9,
    )
    base.update(overrides)
    return StrategyConfig(**base)


def m5_signals(count: int, actions: dict[int, int]) -> list[HybridSignal]:
    out = []
    for index in range(count):
        desired = actions.get(index, 0)
        out.append(HybridSignal(
            bar_index=index,
            timestamp=stamp(minutes=5 * index),
            target=desired,
            strategy="MOMENTUM" if desired else "HOLD",
            stop_pct=0.5 if desired else 0.0,
            take_profit_pct=1.0 if desired else 0.0,
            expires_at=index + 1 if desired else -1,
            confidence=0.6 if desired else 0.0,
        ))
    return out


def m5_config(**overrides) -> HybridConfig:
    base = dict(
        fee_bps_per_side=0.0, slippage_bps_per_side=0.0, spread_bps=0.0,
        funding_bps_per_day=0.0, risk_per_trade=0.02, max_position=1.0,
    )
    base.update(overrides)
    return HybridConfig(**base)


class OneDayEngineUnitTests(unittest.TestCase):
    def run_case(self, prices: list[float], actions: dict[int, int], **config_overrides):
        rows = candles_from(prices)
        return run_backtest(
            make_dataset(rows, "1d"), one_d_config(**config_overrides),
            one_d_signals(len(rows), actions),
        )

    def test_positive_negative_zero_and_one_trade_are_percent(self):
        positive = self.run_case([100, 100, 110, 110], {1: 1, 3: 0})
        negative = self.run_case([100, 100, 90, 90], {1: 1, 3: 0})
        zero = self.run_case([100, 100, 100, 100], {1: 1, 3: 0})
        for result, expected in ((positive, 10.0), (negative, -10.0), (zero, 0.0)):
            self.assertEqual(result.metrics["total_trades"], 1)
            self.assertAlmostEqual(result.metrics["expectancy_pct_per_trade"], expected, places=9)
            self.assertAlmostEqual(
                result.metrics["expectancy_pct_per_trade"],
                statistics.fmean(trade.net_pct for trade in result.trades),
                places=9,
            )

    def test_no_trade_expectancy_is_zero(self):
        result = self.run_case([100, 101, 102, 103], {})
        self.assertEqual(result.metrics["total_trades"], 0)
        self.assertEqual(result.metrics["expectancy_pct_per_trade"], 0.0)

    def test_funding_is_reported_in_percent(self):
        result = self.run_case([100, 100, 100, 100], {1: 1, 2: 1, 3: 0}, funding_bps_per_day=100.0)
        trade = result.trades[0]
        self.assertAlmostEqual(trade.funding_pct, -2.0, places=9)
        # Trade net_pct is the price/cost return; funding is booked separately
        # on the equity curve and reported in its own percent field.
        self.assertAlmostEqual(trade.net_pct, 0.0, places=9)
        self.assertAlmostEqual(result.metrics["net_return_pct"], (0.99 ** 2 - 1.0) * 100.0, places=9)


class M5EngineUnitTests(unittest.TestCase):
    def run_case(self, prices: list[float], actions: dict[int, int]):
        rows = candles_from(prices, step_minutes=5)
        return run_hybrid_backtest(
            rows, m5_signals(len(rows), actions), m5_config(), instrument="FUTURES",
        )

    def test_positive_negative_zero_are_percent_and_one_trade(self):
        positive = self.run_case([100, 100, 110, 110], {1: 1, 3: 0})
        negative = self.run_case([100, 100, 90, 90], {1: 1, 3: 0})
        zero = self.run_case([100, 100, 100, 100], {1: 1, 3: 0})
        for result, expected in ((positive, 10.0), (negative, -10.0), (zero, 0.0)):
            self.assertEqual(result["total_trades"], 1)
            self.assertAlmostEqual(result["expectancy_pct_per_trade"], expected, places=9)
            self.assertAlmostEqual(
                result["expectancy_pct_per_trade"],
                statistics.fmean(trade.net_pct for trade in result["trades"]),
                places=9,
            )

    def test_no_trade_expectancy_is_zero(self):
        result = self.run_case([100, 101, 102, 103], {})
        self.assertEqual(result["total_trades"], 0)
        self.assertEqual(result["expectancy_pct_per_trade"], 0.0)


class VerifierUnitTests(unittest.TestCase):
    def test_verifier_accepts_percent_report_and_rejects_fraction_unit(self):
        with tempfile.TemporaryDirectory() as folder:
            dataset, path = daily_dataset([100, 100, 110, 110], folder)
            result = run_backtest(dataset, one_d_config(), one_d_signals(4, {1: 1, 3: 0}))
            report = build_report(
                dataset, result,
                {"accepted_for_paper_candidate": False, "acceptance_reasons": ["unit-test"],
                 "walk_forward_folds": []},
                RunMeta(generated_at="2026-02-01T00:00:00Z"),
                [],
            )
            verified = verify(report, path)
            self.assertTrue(verified["passed"], verified["failed"])
            self.assertAlmostEqual(
                report["backtest"]["metrics"]["expectancy_pct_per_trade"], 10.0, places=9,
            )

            fraction = copy.deepcopy(report)
            fraction["backtest"]["metrics"]["expectancy_pct_per_trade"] = 0.10
            failed = verify(fraction, path)
            self.assertFalse(failed["passed"])
            self.assertIn("expectancy_recomputed", failed["failed"])

            trades = copy.deepcopy(report)
            for trade in trades["backtest"]["trades"]:
                trade["net_pct"] /= 100.0
            failed = verify(trades, path)
            self.assertFalse(failed["passed"])
            self.assertIn("trade_returns_recomputed", failed["failed"])

            count = copy.deepcopy(report)
            count["backtest"]["metrics"]["total_trades"] = 7
            self.assertIn("trade_count_matches_ledger", verify(count, path)["failed"])

    def test_mean_percent_and_short_trade_formula(self):
        self.assertEqual(mean_percent([]), 0.0)
        self.assertAlmostEqual(mean_percent([10.0, -2.0]), 4.0)
        self.assertAlmostEqual(
            trade_return_pct({"entry_price": 100, "exit_price": 90, "direction": -1}),
            100.0 / 90.0 * 100.0 - 100.0,
        )

    def m5_report(self) -> dict:
        metrics = {
            "total_trades": 2,
            "trades": [
                {"entry_price": 100.0, "exit_price": 110.0, "direction": 1, "net_pct": 10.0},
                {"entry_price": 100.0, "exit_price": 98.0, "direction": 1, "net_pct": -2.0},
            ],
            "expectancy_pct_per_trade": 4.0,
            "win_rate_pct": 50.0,
            "profit_factor": 5.0,
            "equity_curve": [1.0, 1.1, 1.078, 1.078],
            "max_drawdown_pct": 2.0,
            "net_return_pct": 7.8,
            "gross_return_pct": 7.8,
        }
        return {
            "experiment_schema": "m5-hybrid-experiment.v1",
            "paper_only": True, "live_trading": False,
            "withdrawal": False, "profit_claim": False,
            "validation": {
                "accepted_for_paper_candidate": False,
                "acceptance_reasons": ["unit-test"],
                "walk_forward_folds": [],
                "out_of_sample_metrics": metrics,
                "validation_results": [],
            },
        }

    def test_m5_verifier_accepts_percent_and_rejects_tampering(self):
        report = self.m5_report()
        self.assertTrue(verify_m5(report)["passed"], verify_m5(report)["failed"])

        cases = {
            "fraction_unit": ("expectancy_pct_per_trade", 0.04),
            "wrong_value": ("expectancy_pct_per_trade", 9.0),
            "win_rate": ("win_rate_pct", 100.0),
            "profit_factor": ("profit_factor", 99.0),
            "net_return": ("net_return_pct", 99.0),
        }
        for name, (field, value) in cases.items():
            with self.subTest(case=name):
                tampered = copy.deepcopy(report)
                tampered["validation"]["out_of_sample_metrics"][field] = value
                self.assertFalse(verify_m5(tampered)["passed"])

        trades = copy.deepcopy(report)
        trades["validation"]["out_of_sample_metrics"]["trades"][0]["net_pct"] = 0.10
        failed = verify_m5(trades)
        self.assertFalse(failed["passed"])
        self.assertIn("oos_trade_returns_recomputed", failed["failed"])

        empty = copy.deepcopy(report)
        empty["validation"]["out_of_sample_metrics"].update({
            "total_trades": 0, "trades": [], "win_rate_pct": 0.0,
            "profit_factor": None, "expectancy_pct_per_trade": 1.0,
        })
        failed = verify_m5(empty)
        self.assertFalse(failed["passed"])
        self.assertIn("oos_expectancy_zero_without_trades", failed["failed"])


if __name__ == "__main__":
    unittest.main()
