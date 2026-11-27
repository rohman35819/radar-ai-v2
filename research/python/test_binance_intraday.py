import json
import unittest
from pathlib import Path

from quant_data import load_ohlcv
from run_binance_intraday import entry_signal, run_segment, vol_series, volume_z

FIXTURES = Path(__file__).parent / 'fixtures'


class BinanceIntradayTests(unittest.TestCase):
    def setUp(self):
        self.dataset = load_ohlcv(FIXTURES / 'btcusdt_4h_binance.csv', source='test',
                                  symbol='BTCUSDT', interval='4h', data_kind='public_api')

    def test_features_are_bounded_and_causal(self):
        vols = vol_series(list(self.dataset.candles), 400)
        self.assertEqual(vols[19], None)
        self.assertIsNotNone(vols[20])
        volumes = [bar.volume for bar in self.dataset.candles[:200]]
        self.assertIsNone(volume_z(volumes[:10], 24))
        self.assertEqual(volume_z(volumes, 24), volume_z(volumes, 24))

    def test_entry_signal_does_not_read_future_bars(self):
        candles = list(self.dataset.candles[:400])
        vols = vol_series(candles, 400)
        before = entry_signal('I1', candles, 'BTCUSDT', 350, vols[:350])
        extended = candles + list(self.dataset.candles[400:450])
        self.assertEqual(entry_signal('I1', extended, 'BTCUSDT', 350, vols[:350]), before)

    def test_segment_is_deterministic(self):
        first = run_segment(self.dataset, 'BTCUSDT', 'I1', 600, 650)
        self.assertEqual(first, run_segment(self.dataset, 'BTCUSDT', 'I1', 600, 650))
        self.assertIn('net_return_pct', first)
        self.assertIn('expectancy_pct', first)

    def test_report_summary_recomputes_and_all_rejected(self):
        report = json.loads((Path(__file__).parent / 'output' / 'binance_intraday' / 'report.json').read_text())
        for name in ('I1', 'I2'):
            items = [fold['symbols'][symbol][name] for fold in report['folds'] for symbol in report['folds'][0]['symbols']]
            summary = report['summary'][name]
            self.assertEqual(sum(item['trades'] for item in items), summary['oos_trades'])
            self.assertFalse(summary['accepted'])


if __name__ == '__main__':
    unittest.main()
