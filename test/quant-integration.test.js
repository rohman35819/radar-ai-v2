'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const REPORT_PATH = join(__dirname, '..', 'research', 'python', 'output', 'example_report.json');
const PAPER_SOURCE_PATH = join(__dirname, '..', 'src', 'quant', 'paper.mts');

async function loadQuant() {
  const contracts = await import('../src/quant/contracts.mts');
  const paper = await import('../src/quant/paper.mts');
  const risk = await import('../src/quant/risk.mts');
  const report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
  return { ...contracts, ...paper, ...risk, report };
}

const baseConfig = {
  now: '2025-12-31T00:00:00Z',
  max_age_seconds: 86400 * 400,
  fee_bps: 10,
  slippage_bps: 5,
  starting_equity: 1,
  max_exposure: 1,
  kill_switch: false,
};

test('Python JSON report satisfies the versioned TypeScript contract', async () => {
  const { isQuantReportV1, isQuantSignalV1, report } = await loadQuant();
  assert.equal(isQuantReportV1(report), true);
  assert.equal(report.report_schema, 'quant-report.v1');
  assert.equal(report.data.provenance.data_kind, 'synthetic');
  assert.equal(report.paper_only, true);
  assert.equal(report.live_trading, false);
  assert.equal(report.withdrawal, false);
  assert.ok(report.signals.length > 0);
  assert.equal(report.signals.every(isQuantSignalV1), true);
  assert.equal(isQuantReportV1({ ...report, report_schema: 'quant-report.v9' }), false);
  assert.equal(isQuantReportV1({ ...report, live_trading: true }), false);
  assert.equal(isQuantReportV1({ ...report, profit_claim: true }), false);
  assert.equal(isQuantReportV1({
    ...report,
    backtest: { ...report.backtest, metrics: { ...report.backtest.metrics, total_trades: -1 } },
  }), false);
  assert.equal(isQuantReportV1({
    ...report,
    data: { ...report.data, provenance: { ...report.data.provenance, checksum_sha256: 'bad' } },
  }), false);
});

test('paper simulation is deterministic and never submits an order', async () => {
  const { runPaperSimulation, report } = await loadQuant();
  const first = runPaperSimulation(report.signals, baseConfig);
  const second = runPaperSimulation(report.signals, baseConfig);
  assert.deepEqual(first, second);
  assert.equal(first.no_order_submitted, true);
  assert.equal(first.kill_switch_active, false);
  assert.ok(first.fills.length > 0);
  assert.ok(first.audit.length > 0);
  assert.ok(first.fills.every((fill) => fill.position === 0 || fill.position === 1));
  const source = readFileSync(PAPER_SOURCE_PATH, 'utf8');
  assert.equal(/fetch\s*\(/.test(source), false);
  assert.equal(/order\s*submit/.test(source), false);
});

test('kill switch, stale data and malformed signals block paper fills', async () => {
  const { runPaperSimulation, report } = await loadQuant();
  const halted = runPaperSimulation(report.signals, { ...baseConfig, kill_switch: true });
  assert.equal(halted.fills.length, 0);
  assert.equal(halted.kill_switch_active, true);
  assert.ok(halted.rejected.length > 0);

  const stale = runPaperSimulation(report.signals, {
    ...baseConfig, now: '2025-01-01T00:00:00Z', max_age_seconds: 1,
  });
  assert.equal(stale.fills.length, 0);
  assert.ok(stale.rejected.some((item) => item.reasons.includes('STALE_DATA')));

  const malformed = runPaperSimulation([
    { schema_version: 'quant-signal.v1', target_position: 1 },
  ], baseConfig);
  assert.equal(malformed.fills.length, 0);
  assert.equal(malformed.rejected[0].reasons[0], 'CONTRACT_VIOLATION');
});

test('paper risk gate fails closed on invalid input', async () => {
  const { evaluatePaperRisk } = await loadQuant();
  assert.deepEqual(evaluatePaperRisk(null), { allow: false, reasons: ['INVALID_INPUT'] });
  assert.equal(evaluatePaperRisk({
    kill_switch: false, stale: false, signal_valid: true, max_exposure: 1, requested_exposure: 1,
  }).allow, true);
  assert.equal(evaluatePaperRisk({
    kill_switch: true, stale: false, signal_valid: true, max_exposure: 1, requested_exposure: 1,
  }).allow, false);
  assert.equal(evaluatePaperRisk({
    kill_switch: false, stale: true, signal_valid: true, max_exposure: 1, requested_exposure: 1,
  }).allow, false);
  assert.equal(evaluatePaperRisk({
    kill_switch: false, stale: false, signal_valid: true, max_exposure: -1, requested_exposure: 0,
  }).reasons.includes('INVALID_MAX_EXPOSURE'), true);
  assert.equal(evaluatePaperRisk({
    kill_switch: false, stale: false, signal_valid: true, max_exposure: 0.5, requested_exposure: 1,
  }).reasons.includes('EXPOSURE_LIMIT'), true);
});
