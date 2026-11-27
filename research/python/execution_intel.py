"""Execution-quality assessment with realistic costs and liquidity awareness.

Research-only. Produces an assessment, never an order. Spread is a candle proxy;
actual bid/ask is unavailable in the committed dataset.
"""
from __future__ import annotations

from dataclasses import dataclass

from market_microstructure import Microstructure
from signal_engine import TradePlan
from volatility_intel import VolatilityState

FEE_BPS = 5.0
SLIPPAGE_BPS = 5.0
SPREAD_BPS = 5.0
COST_BPS = FEE_BPS + SLIPPAGE_BPS + SPREAD_BPS


class ExecutionError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ExecutionAssessment:
    schema_version: str
    decision: str
    entry_quality: str
    spread_cost_bps: float
    slippage_bps: float
    fee_bps: float
    market_impact_proxy_bps: float
    expected_return_net_bps: float
    liquidity_aware: bool
    reasons: tuple[str, ...]

    def to_dict(self) -> dict:
        return {
            'schema_version': self.schema_version, 'decision': self.decision,
            'entry_quality': self.entry_quality, 'spread_cost_bps': self.spread_cost_bps,
            'slippage_bps': self.slippage_bps, 'fee_bps': self.fee_bps,
            'market_impact_proxy_bps': self.market_impact_proxy_bps,
            'expected_return_net_bps': self.expected_return_net_bps,
            'liquidity_aware': self.liquidity_aware, 'reasons': list(self.reasons),
        }


def assess(
    plan: TradePlan,
    micro: Microstructure,
    volatility: VolatilityState,
    gross_target_bps: float,
) -> ExecutionAssessment:
    if plan.decision != 'BUY_SETUP' or plan.entry_high is None or plan.stop_loss is None:
        return ExecutionAssessment('execution-assessment.v1', 'NO_TRADE', 'REJECTED', 0.0,
                                   SLIPPAGE_BPS, FEE_BPS, 0.0, 0.0, True,
                                   ('NO_VALID_PLAN',))
    if micro.liquidity_state == 'POOR' or micro.spread_state == 'WIDENING':
        quality = 'POOR'
    elif volatility.shock or volatility.regime == 'HIGH_VOL':
        quality = 'CAUTIOUS'
    else:
        quality = 'ACCEPTABLE'
    # Market impact proxy grows with realized vol and spread proxy; not an actual fill.
    impact = round(min(20.0, volatility.realized_vol * 100.0 + micro.spread_proxy_bps * 0.05), 6)
    total_cost = COST_BPS + impact
    net_bps = round(gross_target_bps - total_cost, 6)
    reasons = (
        f'spread_proxy={micro.spread_proxy_bps}bps', f'spread_state={micro.spread_state}',
        f'liquidity={micro.liquidity_state}', f'vol_regime={volatility.regime}',
        f'impact_proxy={impact}bps', f'total_cost={total_cost}bps',
        'ACTUAL_BID_ASK_UNAVAILABLE', 'NO_ORDER_SUBMITTED',
    )
    return ExecutionAssessment('execution-assessment.v1',
                               'ACCEPTABLE' if quality == 'ACCEPTABLE' and net_bps > 0 else 'NO_TRADE',
                               quality, SPREAD_BPS, SLIPPAGE_BPS, FEE_BPS,
                               impact, net_bps, True, reasons)
