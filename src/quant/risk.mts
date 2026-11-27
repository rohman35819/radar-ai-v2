/** Fail-closed risk gate for paper/shadow simulation. No order path. */

export interface PaperRiskInput {
  readonly kill_switch: boolean;
  readonly stale: boolean;
  readonly signal_valid: boolean;
  readonly max_exposure: number;
  readonly requested_exposure: number;
}

export interface PaperRiskDecision {
  readonly allow: boolean;
  readonly reasons: readonly string[];
}

export function evaluatePaperRisk(input: PaperRiskInput | null | undefined): PaperRiskDecision {
  if (!input || typeof input !== 'object') return { allow: false, reasons: ['INVALID_INPUT'] };
  const reasons: string[] = [];
  if (input.kill_switch !== false) reasons.push('KILL_SWITCH_ON');
  if (input.stale !== false) reasons.push('STALE_DATA');
  if (input.signal_valid !== true) reasons.push('INVALID_SIGNAL');
  if (!Number.isFinite(input.max_exposure) || input.max_exposure < 0 || input.max_exposure > 1) {
    reasons.push('INVALID_MAX_EXPOSURE');
  } else if (!Number.isFinite(input.requested_exposure) || input.requested_exposure < 0
    || input.requested_exposure > input.max_exposure) {
    reasons.push('EXPOSURE_LIMIT');
  }
  return { allow: reasons.length === 0, reasons };
}
