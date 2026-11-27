/**
 * Shadow-readiness risk budget: deterministic position sizing and circuit breakers.
 * Pure module. No ledger, no exchange client, no order submission, no activation.
 */

export interface RiskBudgetInput {
  readonly equity: number;
  readonly risk_fraction_per_trade: number;
  readonly stop_loss_pct: number;
  readonly entry_price: number;
  readonly max_exposure: number;
  readonly current_exposure: number;
  readonly kill_switch: boolean;
  readonly daily_loss_pct: number;
  readonly max_daily_loss_pct: number;
  readonly consecutive_losses: number;
  readonly max_consecutive_losses: number;
}

export interface RiskBudgetDecision {
  readonly allow: boolean;
  readonly size_fraction: number;
  readonly target_exposure: number;
  readonly reasons: readonly string[];
}

const DENY: RiskBudgetDecision = { allow: false, size_fraction: 0, target_exposure: 0, reasons: ['INVALID_INPUT'] };

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Fails closed on every malformed or breached limit. */
export function evaluateRiskBudget(input: RiskBudgetInput | null | undefined): RiskBudgetDecision {
  if (!input || typeof input !== 'object') return DENY;
  const reasons: string[] = [];
  if (!finite(input.equity) || input.equity <= 0) reasons.push('INVALID_EQUITY');
  if (!finite(input.entry_price) || input.entry_price <= 0) reasons.push('INVALID_ENTRY_PRICE');
  if (!finite(input.risk_fraction_per_trade) || input.risk_fraction_per_trade <= 0
    || input.risk_fraction_per_trade > 1) reasons.push('INVALID_RISK_FRACTION');
  if (!finite(input.stop_loss_pct) || input.stop_loss_pct <= 0 || input.stop_loss_pct >= 1) {
    reasons.push('INVALID_STOP_LOSS');
  }
  if (!finite(input.max_exposure) || input.max_exposure < 0 || input.max_exposure > 1) {
    reasons.push('INVALID_MAX_EXPOSURE');
  }
  if (!finite(input.current_exposure) || input.current_exposure < 0 || input.current_exposure > 1) {
    reasons.push('INVALID_CURRENT_EXPOSURE');
  }
  if (!finite(input.daily_loss_pct) || input.daily_loss_pct < 0) reasons.push('INVALID_DAILY_LOSS');
  if (!finite(input.max_daily_loss_pct) || input.max_daily_loss_pct <= 0) reasons.push('INVALID_DAILY_LIMIT');
  if (!Number.isInteger(input.consecutive_losses) || input.consecutive_losses < 0
    || !Number.isInteger(input.max_consecutive_losses) || input.max_consecutive_losses < 0) {
    reasons.push('INVALID_LOSS_STREAK');
  }
  if (input.kill_switch !== false) reasons.push('KILL_SWITCH_ON');
  if (reasons.length === 0) {
    if (input.daily_loss_pct > input.max_daily_loss_pct) reasons.push('DAILY_LOSS_LIMIT');
    if (input.consecutive_losses >= input.max_consecutive_losses) reasons.push('LOSS_STREAK_LIMIT');
    if (input.current_exposure >= input.max_exposure) reasons.push('EXPOSURE_LIMIT');
  }
  if (reasons.length > 0) return { allow: false, size_fraction: 0, target_exposure: 0, reasons };

  const riskBudgetSize = input.risk_fraction_per_trade / input.stop_loss_pct;
  const remainingExposure = input.max_exposure - input.current_exposure;
  const sizeFraction = Math.min(riskBudgetSize, remainingExposure);
  if (sizeFraction <= 0) return { allow: false, size_fraction: 0, target_exposure: 0, reasons: ['NO_CAPACITY'] };
  return {
    allow: true,
    size_fraction: Math.round(sizeFraction * 1e6) / 1e6,
    target_exposure: Math.round((input.current_exposure + sizeFraction) * 1e6) / 1e6,
    reasons: [],
  };
}
