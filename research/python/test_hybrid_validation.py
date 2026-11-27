"""Deterministic validation tests for hybrid M5 engine."""
from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from hybrid import HybridConfig
from hybrid_validation import run_validation, split_indices, walk_forward_windows
from quant_data import Candle

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def rows(count: int = 2600) -> list[Candle]:
    out = []
    price = 100.0
    for i in range(count):
        close = price + (1.0 if i % 60 < 30 else -1.0)
        out.append(Candle(
            timestamp=(START + timedelta(minutes=5 * i)).isoformat().replace('+00:00', 'Z'),
            open=price, high=max(price, close) + 0.5, low=min(price, close) - 0.5,
            close=close, volume=100.0 + (i % 10),
        ))
        price = close
    return out


class HybridValidationTests(unittest.TestCase):
    def test_split_and_windows_are_contiguous(self):
        start, train_end, val_end, total = split_indices(2600)
        self.assertEqual((start, train_end, val_end, total), (0, 1560, 2080, 2600))
        windows = walk_forward_windows(2600, train_bars=300, test_bars=100, step=100)
        self.assertTrue(all(a < b < c for a, b, c in windows))
        self.assertEqual(windows[0], (0, 300, 400))

    def test_validation_uses_selected_config_once_on_oos(self):
        configs = [
            HybridConfig(mode='HYBRID', ema_fast=9, ema_slow=21),
            HybridConfig(mode='MOMENTUM', ema_fast=12, ema_slow=30),
        ]
        result = run_validation(rows(2600), configs, instrument='FUTURES')
        self.assertIn(result['selected_config']['mode'], ('HYBRID', 'MOMENTUM'))
        self.assertEqual(result['out_of_sample_metrics']['instrument'], 'FUTURES')
        self.assertGreater(result['walk_forward_total'], 0)
        self.assertEqual(len(result['walk_forward_folds']), result['walk_forward_total'])
        self.assertIsInstance(result['accepted_for_paper_candidate'], bool)
        self.assertTrue(all(fold['train_end'] == fold['test_start'] for fold in result['walk_forward_folds']))

    def test_config_validation_is_enforced(self):
        with self.assertRaises(ValueError):
            replace(HybridConfig(), mode='UNKNOWN').validate()


if __name__ == '__main__':
    unittest.main()
