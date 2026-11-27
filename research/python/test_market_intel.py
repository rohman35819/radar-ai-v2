import unittest
from pathlib import Path

from execution_intel import assess
from institutional_risk import RiskError, exposure_for, hedged_book, size_by_risk
from market_microstructure import MicrostructureError, compare_liquidity, observe_microstructure
from quant_data import load_ohlcv
from signal_engine import TradePlan
from volatility_intel import VolatilityError, compare_volatility, observe_volatility

FIXTURES = Path(__file__).parent / 'fixtures'


class MarketIntelTests(unittest.TestCase):
    def setUp(self):
        self.series = {
            symbol: load_ohlcv(FIXTURES / f'{symbol.lower()}_1d_public.csv',
                               source='test-fixture', symbol=symbol, interval='1d', data_kind='public_api').candles
            for symbol in ('BTCUSDT', 'ETHUSDT')
        }

    def test_microstructure_is_a_labelled_proxy_and_deterministic(self):
        micro = observe_microstructure(self.series['BTCUSDT'], 'BTCUSDT', 250)
        self.assertEqual(micro, observe_microstructure(self.series['BTCUSDT'], 'BTCUSDT', 250))
        self.assertFalse(micro.actual_order_book)
        self.assertGreater(micro.spread_proxy_bps, 0)
        self.assertIn(micro.spread_state, ('WIDENING', 'NARROWING', 'STABLE'))
        self.assertIn(micro.liquidity_state, ('OK', 'POOR'))
        self.assertIn('NO_ACTUAL_BID_ASK_OR_DEPTH', micro.reasons)

    def test_volatility_is_realized_only_and_deterministic(self):
        vol = observe_volatility(self.series['BTCUSDT'], 'BTCUSDT', 250)
        self.assertIsNone(vol.implied_volatility)
        self.assertEqual(vol, observe_volatility(self.series['BTCUSDT'], 'BTCUSDT', 250))
        self.assertIn(vol.regime, ('HIGH_VOL', 'LOW_VOL', 'NORMAL_VOL'))
        self.assertEqual(compare_volatility({'BTCUSDT': vol, 'ETHUSDT': observe_volatility(self.series['ETHUSDT'], 'ETHUSDT', 250)})['schema_version'], 'volatility-comparison.v1')

    def test_insufficient_data_fails_closed(self):
        with self.assertRaises(MicrostructureError):
            observe_microstructure(self.series['BTCUSDT'], 'BTCUSDT', 10)
        with self.assertRaises(VolatilityError):
            observe_volatility(self.series['BTCUSDT'], 'BTCUSDT', 10)

    def test_position_sizing_and_hedged_book_have_no_fake_greeks(self):
        size = size_by_risk(0.01, 0.05, 1.0)
        self.assertEqual(size, 0.2)
        self.assertLessEqual(size, 1.0)
        entry = exposure_for('BTCUSDT', 1, size, 1.0)
        self.assertIsNone(entry.options_delta)
        self.assertIsNone(entry.options_gamma)
        self.assertIsNone(entry.options_theta)
        self.assertIsNone(entry.options_vega)
        self.assertEqual(entry.greeks_reason, 'OPTIONS_GREEKS_DEFERRED_NO_VALID_OPTIONS_DATA')
        book = hedged_book([entry], {'BTCUSDT': [0.01] * 20})
        self.assertEqual(book['gross_exposure'], 0.2)
        with self.assertRaises(RiskError):
            size_by_risk(2.0, 0.05, 1.0)

    def test_execution_assessment_charges_costs_and_never_orders(self):
        plan = TradePlan('trade-plan.v1', 'BUY_SETUP', 'BTCUSDT', 59750, 60250, 58500,
                         61500, 63000, 64500, (1.0, 2.0, 3.0), 0.6, ('test',))
        micro = observe_microstructure(self.series['BTCUSDT'], 'BTCUSDT', 250)
        vol = observe_volatility(self.series['BTCUSDT'], 'BTCUSDT', 250)
        result = assess(plan, micro, vol, 100.0)
        self.assertEqual(result.spread_cost_bps, 5.0)
        self.assertEqual(result.slippage_bps, 5.0)
        self.assertEqual(result.fee_bps, 5.0)
        self.assertLess(result.expected_return_net_bps, 100.0)
        self.assertTrue(result.liquidity_aware)
        self.assertIn('NO_ORDER_SUBMITTED', result.reasons)

    def test_liquidity_comparison_is_proxy_ranking(self):
        a = observe_microstructure(self.series['BTCUSDT'], 'BTCUSDT', 250)
        b = observe_microstructure(self.series['ETHUSDT'], 'ETHUSDT', 250)
        result = compare_liquidity({'BTCUSDT': a, 'ETHUSDT': b})
        self.assertFalse(result['actual_order_book'])
        self.assertIn(result['best'], ('BTCUSDT', 'ETHUSDT'))


if __name__ == '__main__':
    unittest.main()
