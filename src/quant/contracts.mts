/**
 * Versioned boundary contract between Python quant research and TypeScript platform.
 * Runtime guards validate untrusted JSON before any downstream use.
 * No network, no exchange order path, no secrets.
 */

export type QuantSignalSchema = 'quant-signal.v1';
export type QuantReportSchema = 'quant-report.v1';

export interface QuantSignalV1 {
  readonly schema_version: QuantSignalSchema;
  readonly symbol: string;
  readonly timestamp: string;
  readonly as_of: string;
  readonly target_position: 0 | 1;
  readonly source: string;
  readonly provenance_ref: string;
  readonly reference_price: number | null;
}

export interface QuantMetricsV1 {
  readonly start: string;
  readonly end: string;
  readonly bars: number;
  readonly interval: string;
  readonly gross_return_pct: number;
  readonly net_return_pct: number;
  readonly max_drawdown_pct: number;
  readonly total_trades: number;
  readonly win_rate_pct: number;
  readonly profit_factor: number | null;
  readonly expectancy_pct_per_trade: number;
  readonly exposure_pct: number;
  readonly position_changes: number;
  readonly turnover_events: number;
  readonly sharpe: number | null;
  readonly sortino: number | null;
  readonly buy_hold_gross_pct: number;
  readonly buy_hold_net_pct: number;
  readonly no_trade_return_pct: number;
  readonly kill_switch_triggered: boolean;
  readonly fee_bps_per_side: number;
  readonly slippage_bps_per_side: number;
  readonly funding_bps_per_day: number;
  readonly position_fraction: number;
  readonly stop_loss_pct: number;
  readonly max_drawdown_stop_pct: number;
  readonly cost_bps_per_turn: number;
}

export interface QuantReportV1 {
  readonly report_schema: QuantReportSchema;
  readonly run: {
    readonly generated_at: string;
    readonly code_version: string;
    readonly python_version: string;
    readonly command: string;
  };
  readonly data: {
    readonly provenance: {
      readonly schema_version: string;
      readonly source: string;
      readonly symbol: string;
      readonly interval: string;
      readonly retrieved_at: string | null;
      readonly data_kind: 'synthetic' | 'public_api';
      readonly start: string;
      readonly end: string;
      readonly rows: number;
      readonly checksum_sha256: string;
    };
    readonly quality: {
      readonly rows: number;
      readonly start: string;
      readonly end: string;
      readonly interval: string;
      readonly duplicate_timestamps: number;
      readonly missing_intervals: number;
      readonly ohlcv_violations: number;
      readonly accepted: boolean;
      readonly issues: readonly string[];
    };
    readonly checksum_sha256: string;
  };
  readonly signals: readonly QuantSignalV1[];
  readonly signals_total: number;
  readonly strategy: {
    readonly id: string;
    readonly type: string;
    readonly signal_generation: string;
    readonly execution: string;
    readonly config: Record<string, unknown>;
  };
  readonly backtest: {
    readonly schema_version: string;
    readonly engine: string;
    readonly config: Record<string, unknown>;
    readonly metrics: QuantMetricsV1;
    readonly equity_curve: readonly number[];
    readonly trades: readonly Record<string, unknown>[];
    readonly trades_omitted?: number;
  };
  readonly validation: {
    readonly train: Record<string, unknown>;
    readonly validation: Record<string, unknown>;
    readonly out_of_sample: Record<string, unknown>;
    readonly selected_parameters: Record<string, unknown>;
    readonly out_of_sample_metrics: Record<string, unknown>;
    readonly walk_forward_folds: readonly Record<string, unknown>[];
    readonly accepted_for_paper_candidate: boolean;
    readonly acceptance_reasons: readonly string[];
  };
  readonly limitations: readonly string[];
  readonly paper_only: true;
  readonly live_trading: false;
  readonly withdrawal: false;
  readonly profit_claim: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return false;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

export function isQuantSignalV1(value: unknown): value is QuantSignalV1 {
  if (!isRecord(value)) return false;
  if (value.schema_version !== 'quant-signal.v1') return false;
  if (typeof value.symbol !== 'string' || value.symbol.length < 1 || value.symbol.length > 40) return false;
  if (!isIsoTimestamp(value.timestamp) || !isIsoTimestamp(value.as_of)) return false;
  if (value.target_position !== 0 && value.target_position !== 1) return false;
  if (typeof value.source !== 'string' || value.source.length < 1 || value.source.length > 120) return false;
  if (typeof value.provenance_ref !== 'string' || !/^[a-f0-9]{64}$/.test(value.provenance_ref)) return false;
  return isNullableNumber(value.reference_price)
    && (value.reference_price === null || value.reference_price > 0);
}

function isMetrics(value: unknown): value is QuantMetricsV1 {
  if (!isRecord(value)) return false;
  const numbers: readonly string[] = [
    'bars', 'gross_return_pct', 'net_return_pct', 'max_drawdown_pct', 'total_trades',
    'win_rate_pct', 'expectancy_pct_per_trade', 'exposure_pct', 'position_changes',
    'turnover_events', 'buy_hold_gross_pct', 'buy_hold_net_pct', 'no_trade_return_pct',
    'fee_bps_per_side', 'slippage_bps_per_side', 'funding_bps_per_day',
    'position_fraction', 'stop_loss_pct', 'max_drawdown_stop_pct', 'cost_bps_per_turn',
  ];
  if (!numbers.every((key) => isFiniteNumber(value[key]))) return false;
  if (!isIsoTimestamp(value.start) || !isIsoTimestamp(value.end)) return false;
  if (typeof value.interval !== 'string' || value.interval.length < 1) return false;
  if (typeof value.kill_switch_triggered !== 'boolean') return false;
  if (!isNullableNumber(value.profit_factor) || !isNullableNumber(value.sharpe) || !isNullableNumber(value.sortino)) return false;
  const trades = value.total_trades;
  const winRate = value.win_rate_pct;
  const exposure = value.exposure_pct;
  if (!isFiniteNumber(trades) || !isFiniteNumber(winRate) || !isFiniteNumber(exposure)) return false;
  return Number.isInteger(trades) && trades >= 0
    && winRate >= 0 && winRate <= 100
    && exposure >= 0 && exposure <= 100;
}

export function isQuantReportV1(value: unknown): value is QuantReportV1 {
  if (!isRecord(value) || value.report_schema !== 'quant-report.v1') return false;
  const run = value.run;
  const data = value.data;
  const backtest = value.backtest;
  const validation = value.validation;
  if (!isRecord(run) || !isIsoTimestamp(run.generated_at)
    || typeof run.code_version !== 'string' || typeof run.python_version !== 'string'
    || typeof run.command !== 'string') return false;
  if (!isRecord(data) || !isRecord(data.provenance) || !isRecord(data.quality)) return false;
  const provenance = data.provenance;
  if (!isRecord(provenance) || typeof provenance.source !== 'string'
    || typeof provenance.symbol !== 'string' || typeof provenance.interval !== 'string'
    || typeof provenance.data_kind !== 'string'
    || (provenance.data_kind !== 'synthetic' && provenance.data_kind !== 'public_api')
    || !isIsoTimestamp(provenance.start) || !isIsoTimestamp(provenance.end)
    || !isFiniteNumber(provenance.rows)
    || typeof provenance.checksum_sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(provenance.checksum_sha256)
    || !(provenance.retrieved_at === null || isIsoTimestamp(provenance.retrieved_at))) return false;
  const quality = data.quality;
  if (!isFiniteNumber(quality.rows) || typeof quality.accepted !== 'boolean'
    || !Array.isArray(quality.issues) || !quality.issues.every((item) => typeof item === 'string')) return false;
  if (typeof data.checksum_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.checksum_sha256)) return false;
  if (!Array.isArray(value.signals) || value.signals.length > 200 || !value.signals.every(isQuantSignalV1)) return false;
  if (!isFiniteNumber(value.signals_total) || value.signals_total < 0) return false;
  if (!isRecord(value.strategy) || typeof value.strategy.id !== 'string') return false;
  if (!isRecord(backtest) || !isMetrics(backtest.metrics)
    || !Array.isArray(backtest.equity_curve) || backtest.equity_curve.length > 100000
    || !backtest.equity_curve.every(isFiniteNumber)
    || !Array.isArray(backtest.trades) || backtest.trades.length > 200
    || !backtest.trades.every(isRecord)) return false;
  if (!isRecord(validation) || !Array.isArray(validation.walk_forward_folds)
    || validation.walk_forward_folds.length > 100
    || !validation.walk_forward_folds.every(isRecord)
    || typeof validation.accepted_for_paper_candidate !== 'boolean'
    || !Array.isArray(validation.acceptance_reasons)
    || !validation.acceptance_reasons.every((item) => typeof item === 'string')) return false;
  if (!Array.isArray(value.limitations) || value.limitations.length > 50
    || !value.limitations.every((item) => typeof item === 'string')) return false;
  return value.paper_only === true && value.live_trading === false
    && value.withdrawal === false && value.profit_claim === false;
}
