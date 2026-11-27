import unittest

from quantum_scan import AssetFeatures, ScanResult
from signal_engine import build_plan, no_trade


def features(symbol='BTCUSDT', regime='LOW_VOL_UP', score=0.8):
    return AssetFeatures(symbol, '2026-11-25T00:00:00Z', 60000.0, 1000.0,
                         0.4, 0.05, 1.2, regime, score, ('close=60000', 'atr=1000'))


def scan(decision='SCAN_CANDIDATE', symbol='BTCUSDT', reasons=()):
    return ScanResult('quantum-scan.v1', '2026-11-25T00:00:00Z', (features(),),
                      symbol, decision, tuple(reasons))


class SignalEngineTests(unittest.TestCase):
    def test_no_trade_scan_returns_explicit_no_trade_plan(self):
        plan = build_plan(scan('NO_TRADE', None, ('CROSS_ASSET_CONFIRMATION_FAILED',)), {})
        self.assertEqual(plan.decision, 'NO_TRADE')
        self.assertIsNone(plan.entry_low)
        self.assertEqual(plan.confidence, 0.0)
        self.assertEqual(plan.reasons, ('CROSS_ASSET_CONFIRMATION_FAILED',))

    def test_levels_are_deterministic_and_derived_from_atr(self):
        item = features()
        first = build_plan(scan(), {item.symbol: item})
        second = build_plan(scan(), {item.symbol: item})
        self.assertEqual(first, second)
        self.assertEqual(first.decision, 'BUY_SETUP')
        self.assertEqual(first.tp1, 61500.0)
        self.assertEqual(first.tp2, 63000.0)
        self.assertEqual(first.tp3, 64500.0)
        self.assertEqual(first.stop_loss, 58500.0)
        self.assertLess(first.stop_loss, first.entry_low)
        self.assertLess(first.entry_low, first.tp1)
        self.assertLess(first.tp1, first.tp2)
        self.assertLess(first.tp2, first.tp3)
        self.assertEqual(first.rr_tiers, (1.0, 2.0, 3.0))
        self.assertGreater(first.confidence, 0)
        self.assertIn('LEVELS_FROM_ATR_AND_CLOSE', first.reasons)

    def test_incompatible_regime_and_missing_data_stay_no_trade(self):
        bad = features(regime='HIGH_VOL')
        plan = build_plan(scan(), {bad.symbol: bad})
        self.assertEqual(plan.decision, 'NO_TRADE')
        self.assertEqual(plan.reasons, ('REGIME_NOT_CONFIRMED',))
        self.assertEqual(no_trade(('X',)).decision, 'NO_TRADE')


if __name__ == '__main__':
    unittest.main()
