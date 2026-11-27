import unittest
from pathlib import Path

from quant_data import load_ohlcv, slice_dataset
from quantum_scan import ScanError, compute_features, scan

FIXTURES = Path(__file__).parent / 'fixtures'


class QuantumScanTests(unittest.TestCase):
    def setUp(self):
        self.datasets = {
            symbol: load_ohlcv(FIXTURES / f'{symbol.lower()}_1d_public.csv',
                               source='test-fixture', symbol=symbol, interval='1d', data_kind='public_api')
            for symbol in ('BTCUSDT', 'ETHUSDT')
        }

    def test_features_are_deterministic_and_do_not_read_future_bars(self):
        dataset = self.datasets['BTCUSDT']
        full = compute_features(dataset, 250, 'BTCUSDT')
        truncated = compute_features(slice_dataset(dataset, 0, 250), 250, 'BTCUSDT')
        self.assertEqual(full, truncated)
        self.assertEqual(full, compute_features(dataset, 250, 'BTCUSDT'))
        self.assertIn('atr=', ' '.join(full.reasons))

    def test_scan_uses_cross_asset_confirmation_and_never_invents_candidate(self):
        result = scan(self.datasets, '2026-11-25T00:00:00Z',
                      end_by_symbol={'BTCUSDT': 250, 'ETHUSDT': 250},
                      max_age_ms=365 * 24 * 3600 * 1000)
        self.assertEqual(result.schema_version, 'quantum-scan.v1')
        self.assertIn(result.decision, ('NO_TRADE', 'SCAN_CANDIDATE'))
        if result.decision == 'SCAN_CANDIDATE':
            self.assertIn(result.selected_symbol, ('BTCUSDT', 'ETHUSDT'))
        else:
            self.assertIsNone(result.selected_symbol)
        self.assertTrue(result.reasons)

    def test_stale_and_missing_inputs_are_rejected(self):
        with self.assertRaises(ScanError) as ctx:
            scan(self.datasets, '2027-01-01T00:00:00Z', end_by_symbol={'BTCUSDT': 250, 'ETHUSDT': 250})
        self.assertEqual(ctx.exception.code, 'STALE_DATA')
        result = scan({'BTCUSDT': self.datasets['BTCUSDT']}, '2026-11-25T00:00:00Z',
                      end_by_symbol={'BTCUSDT': 250}, max_age_ms=365 * 24 * 3600 * 1000)
        self.assertEqual(result.decision, 'NO_TRADE')
        self.assertEqual(result.reasons, ('MISSING_REQUIRED_ASSET',))

    def test_insufficient_history_and_invalid_index_fail_closed(self):
        dataset = self.datasets['BTCUSDT']
        with self.assertRaises(ScanError) as ctx:
            compute_features(dataset, 10, 'BTCUSDT')
        self.assertEqual(ctx.exception.code, 'NOT_ENOUGH_DATA')
        with self.assertRaises(ScanError) as ctx:
            scan(self.datasets, '2026-11-25T00:00:00Z', end_by_symbol={'BTCUSDT': 9999, 'ETHUSDT': 250})
        self.assertEqual(ctx.exception.code, 'INVALID_SCAN_INDEX')


if __name__ == '__main__':
    unittest.main()
