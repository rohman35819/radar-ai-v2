/**
 * Divisi 06 foundation — fail-closed task admission policy.
 *
 * Pure decision function; it never claims a task, touches a database or starts
 * a worker. Default posture is DENY. Rp0 means any non-zero budget is denied.
 */

export interface PlatformControlSnapshot {
  readonly paused: boolean;
  readonly kill_switch: boolean;
  readonly max_concurrency: number;
  readonly daily_budget_usd: number;
}

export interface TaskAdmissionInput {
  readonly enabled: boolean;
  readonly control: PlatformControlSnapshot | null;
  readonly active_tasks: number;
  readonly autonomy_stage: number;
}

export interface TaskPolicyDecision {
  readonly allow: boolean;
  readonly reasons: readonly string[];
}

export const RP0_MAX_BUDGET_USD = 0;
export const MAX_AUTONOMY_STAGE = 1;

function isControlSnapshot(value: unknown): value is PlatformControlSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.paused === 'boolean'
    && typeof obj.kill_switch === 'boolean'
    && typeof obj.max_concurrency === 'number' && Number.isInteger(obj.max_concurrency)
    && obj.max_concurrency >= 0 && obj.max_concurrency <= 1
    && typeof obj.daily_budget_usd === 'number' && Number.isFinite(obj.daily_budget_usd);
}

/** Returns DENY with reasons for every unsafe or malformed input. */
export function evaluateTaskAdmission(input: TaskAdmissionInput): TaskPolicyDecision {
  const reasons: string[] = [];
  if (!input || typeof input !== 'object') return { allow: false, reasons: ['INVALID_INPUT'] };
  if (input.enabled !== true) reasons.push('WORKER_DISABLED');
  if (!isControlSnapshot(input.control)) {
    reasons.push('INVALID_CONTROL');
  } else {
    const control = input.control;
    if (control.paused) reasons.push('PLATFORM_PAUSED');
    if (control.kill_switch) reasons.push('KILL_SWITCH_ON');
    if (control.daily_budget_usd > RP0_MAX_BUDGET_USD) reasons.push('BUDGET_NOT_RP0');
    if (control.daily_budget_usd < RP0_MAX_BUDGET_USD) reasons.push('INVALID_BUDGET');
    if (!Number.isInteger(input.active_tasks) || input.active_tasks < 0) reasons.push('INVALID_ACTIVE_TASKS');
    else if (input.active_tasks >= control.max_concurrency) reasons.push('CONCURRENCY_LIMIT');
  }
  if (!Number.isInteger(input.autonomy_stage) || input.autonomy_stage > MAX_AUTONOMY_STAGE) {
    reasons.push('AUTONOMY_STAGE_TOO_HIGH');
  }
  return { allow: reasons.length === 0, reasons };
}

export function isRp0Control(control: PlatformControlSnapshot | null): boolean {
  return isControlSnapshot(control) && control.daily_budget_usd === RP0_MAX_BUDGET_USD;
}
