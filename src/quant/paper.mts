/**
 * Shadow/paper simulation over validated quant signals.
 *
 * Pure and deterministic: no fetch, no exchange client, no order submission,
 * no persistence. Signals are validated against the versioned contract; every
 * rejected or executed transition produces a sanitized audit event.
 */
import { isQuantSignalV1, type QuantSignalV1 } from './contracts.mts';
import { evaluatePaperRisk, type PaperRiskDecision } from './risk.mts';

export interface PaperConfig {
  readonly now: string;
  readonly max_age_seconds: number;
  readonly fee_bps: number;
  readonly slippage_bps: number;
  readonly starting_equity: number;
  readonly max_exposure: number;
  readonly kill_switch: boolean;
}

export interface PaperFill {
  readonly timestamp: string;
  readonly symbol: string;
  readonly side: 'enter' | 'exit';
  readonly reference_price: number;
  readonly simulated_price: number;
  readonly position: 0 | 1;
  readonly audit_ref: string;
}

export interface PaperAuditEvent {
  readonly event: 'signal_rejected' | 'fill_simulated' | 'no_change';
  readonly timestamp: string;
  readonly reason: string;
  readonly provenance_ref: string;
}

export interface PaperResult {
  readonly fills: readonly PaperFill[];
  readonly rejected: readonly { timestamp: string; reasons: readonly string[] }[];
  readonly audit: readonly PaperAuditEvent[];
  readonly final_position: 0 | 1;
  readonly equity_factor: number;
  readonly no_order_submitted: true;
  readonly kill_switch_active: boolean;
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

export function runPaperSimulation(
  signals: readonly unknown[],
  config: PaperConfig,
  riskEvaluator: (input: Parameters<typeof evaluatePaperRisk>[0]) => PaperRiskDecision = evaluatePaperRisk,
): PaperResult {
  if (!config || !isIso(config.now) || !Number.isFinite(config.max_age_seconds)
    || config.max_age_seconds < 0 || !Number.isFinite(config.fee_bps) || config.fee_bps < 0
    || !Number.isFinite(config.slippage_bps) || config.slippage_bps < 0
    || !Number.isFinite(config.starting_equity) || config.starting_equity <= 0
    || !Number.isFinite(config.max_exposure) || config.max_exposure < 0 || config.max_exposure > 1
    || typeof config.kill_switch !== 'boolean' || !Array.isArray(signals)) {
    return { fills: [], rejected: [], audit: [], final_position: 0, equity_factor: 1,
      no_order_submitted: true, kill_switch_active: true };
  }
  const nowMs = Date.parse(config.now);
  const fills: PaperFill[] = [];
  const rejected: { timestamp: string; reasons: string[] }[] = [];
  const audit: PaperAuditEvent[] = [];
  const costRate = (config.fee_bps + config.slippage_bps) / 10000;
  let position: 0 | 1 = 0;
  let equityFactor = 1;
  let previousTimestamp = '';

  for (const candidate of signals) {
    if (!isQuantSignalV1(candidate)) {
      rejected.push({ timestamp: typeof candidate === 'object' && candidate !== null
        ? String((candidate as { timestamp?: unknown }).timestamp ?? 'unknown') : 'unknown',
        reasons: ['CONTRACT_VIOLATION'] });
      continue;
    }
    const signal: QuantSignalV1 = candidate;
    if (signal.timestamp <= previousTimestamp) {
      rejected.push({ timestamp: signal.timestamp, reasons: ['NON_CHRONOLOGICAL'] });
      continue;
    }
    previousTimestamp = signal.timestamp;
    const age = nowMs - Date.parse(signal.as_of);
    const stale = !Number.isFinite(age) || age < 0 || age > config.max_age_seconds * 1000;
    const decision = riskEvaluator({
      kill_switch: config.kill_switch,
      stale,
      signal_valid: true,
      max_exposure: config.max_exposure,
      requested_exposure: signal.target_position === 1 ? 1 : 0,
    });
    if (!decision.allow) {
      rejected.push({ timestamp: signal.timestamp, reasons: [...decision.reasons] });
      audit.push({ event: 'signal_rejected', timestamp: signal.timestamp,
        reason: decision.reasons.join(','), provenance_ref: signal.provenance_ref });
      continue;
    }
    if (signal.target_position === position) {
      audit.push({ event: 'no_change', timestamp: signal.timestamp,
        reason: 'POSITION_UNCHANGED', provenance_ref: signal.provenance_ref });
      continue;
    }
    if (signal.reference_price === null) {
      rejected.push({ timestamp: signal.timestamp, reasons: ['MISSING_REFERENCE_PRICE'] });
      audit.push({ event: 'signal_rejected', timestamp: signal.timestamp,
        reason: 'MISSING_REFERENCE_PRICE', provenance_ref: signal.provenance_ref });
      continue;
    }
    const side = signal.target_position === 1 ? 'enter' : 'exit';
    const simulatedPrice = side === 'enter'
      ? signal.reference_price * (1 + costRate)
      : signal.reference_price * (1 - costRate);
    equityFactor *= 1 - costRate;
    position = signal.target_position;
    fills.push({
      timestamp: signal.timestamp,
      symbol: signal.symbol,
      side,
      reference_price: signal.reference_price,
      simulated_price: simulatedPrice,
      position,
      audit_ref: `${signal.provenance_ref.slice(0, 12)}:${signal.timestamp}`,
    });
    audit.push({ event: 'fill_simulated', timestamp: signal.timestamp,
      reason: side.toUpperCase(), provenance_ref: signal.provenance_ref });
  }

  return {
    fills,
    rejected,
    audit,
    final_position: position,
    equity_factor: equityFactor,
    no_order_submitted: true,
    kill_switch_active: config.kill_switch,
  };
}
