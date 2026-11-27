import unittest
from pathlib import Path

from paper_sim import COST_RATE, simulate
from quant_data import load_ohlcv
from signal_engine import TradePlan

FIXTURE = Path(__file__).parent / 'fixtures' / 'btcusdt_1d_public.csv'


def plan(decision='BUY_SETUP'):
    return TradePlan('trade-plan.v1', decision, 'BTCUSDT',
                     59750.0, 60250.0, 58500.0, 61500.0, 63000.0, 64500.0,
                     (1.0, 2.0, 3.0), 0.6, ('test',))


class PaperSimTests(unittest.TestCase):
    def setUp(self):
        self.candles = load_ohlcv(FIXTURE, source='test-fixture', symbol='BTCUSDT',
                                  interval='1d', data_kind='public_api').candles

    def test_no_trade_plan_changes_nothing(self):
        result = simulate(self.candles, plan('NO_TRADE'), start_index=250)
        self.assertEqual(result.fills, ())
        self.assertEqual(result.net_return_pct, 0.0)
        self.assertEqual(result.total_trades, 0)
        self.assertIn('NOT_LIVE_TRADING', result.limitations)

    def test_simulation_is_deterministic_and_costs_are_charged(self):
        first = simulate(self.candles, plan(), start_index=250)
        second = simulate(self.candles, plan(), start_index=250)
        self.assertEqual(first, second)
        self.assertGreater(len(first.fills), 0)
        self.assertTrue(all(fill['cost_bps'] == 15.0 for fill in first.fills))
        self.assertAlmostEqual(COST_RATE, 0.0015)
        self.assertEqual(first.schema_version, 'paper-sim.v1')

    def test_drawdown_circuit_breaker_stops_new_entries(self):
        tight = simulate(self.candles, plan(), start_index=250, max_drawdown_pct=0.0001)
        normal = simulate(self.candles, plan(), start_index=250, max_drawdown_pct=25.0)
        self.assertTrue(tight.kill_switch_triggered)
        self.assertLess(len([f for f in tight.fills if f['kind'] == 'buy']),
                        len([f for f in normal.fills if f['kind'] == 'buy']))

    def test_simulator_has_no_persistence_or_order_path(self):
        source = (Path(__file__).parent / 'paper_sim.py').read_text()
        for forbidden in ('sqlite', 'postgres', 'open(', 'fetch(', 'placeOrder', 'withdraw', 'transfer'):
            self.assertNotIn(forbidden, source)
        self.assertIn('IN_MEMORY_ONLY', str(simulate(self.candles, plan(), start_index=250).limitations))


if __name__ == '__main__':
    unittest.main()
