import json
import unittest
from pathlib import Path

from quant_data import load_ohlcv
from run_feature_research import entry_signal, run_segment, volume_z, zscore

FIXTURES = Path(__file__).parent / 'fixtures'


class FeatureResearchTests(unittest.TestCase):
    def setUp(self):
        self.dataset = load_ohlcv(FIXTURES / 'btcusdt_1d_2023.csv', source='test', symbol='BTCUSDT',
                                  interval='1d', data_kind='public_api')

    def test_feature_helpers_are_bounded_and_deterministic(self):
        closes = [c.close for c in self.dataset.candles[:100]]
        volumes = [c.volume for c in self.dataset.candles[:100]]
        self.assertIsNone(zscore(closes[:5], 10))
        self.assertEqual(zscore(closes, 10), zscore(closes, 10))
        self.assertEqual(volume_z(volumes, 20), volume_z(volumes, 20))

    def test_entry_signals_do_not_read_future_candles(self):
        candles = list(self.dataset.candles[:180])
        before = entry_signal('F1', candles, 'BTCUSDT', 175)
        extended = candles + list(self.dataset.candles[180:200])
        self.assertEqual(entry_signal('F1', extended, 'BTCUSDT', 175), before)
        before_f2 = entry_signal('F2', candles, 'BTCUSDT', 175)
        self.assertEqual(entry_signal('F2', extended, 'BTCUSDT', 175), before_f2)

    def test_segment_is_deterministic_and_reports_costs(self):
        first = run_segment(self.dataset, 'BTCUSDT', 'F1', 220, 260)
        self.assertEqual(first, run_segment(self.dataset, 'BTCUSDT', 'F1', 220, 260))
        self.assertIn('net_return_pct', first)
        self.assertIn('turnover_events', first)

    def test_report_summary_recomputes_from_folds(self):
        report = json.loads((Path(__file__).parent / 'output' / 'feature_research' / 'report.json').read_text())
        for strategy in ('F1', 'F2'):
            items = [fold['symbols'][symbol][strategy] for fold in report['folds'] for symbol in report['folds'][0]['symbols']]
            summary = report['summary'][strategy]
            self.assertEqual(sum(item['trades'] for item in items), summary['oos_trades'])
            self.assertEqual(sum(1 for item in items if item['net_return_pct'] > 0), summary['positive_folds'])
            self.assertFalse(summary['accepted'])


if __name__ == '__main__':
    unittest.main()
