'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require.resolve('../src/quantum/m5-contracts.mts'), 'utf8');

test('M5 typed contract covers all required boundary objects', () => {
  for (const type of [
    'M5Provenance', 'M5Candle', 'M5MarketData', 'M5StrategySignal',
    'EntryExitPlan', 'RiskAssessment', 'SignalExecution', 'M5AuditEvent',
  ]) {
    assert.match(source, new RegExp(`interface ${type}\\b`), `missing ${type}`);
  }
  assert.match(source, /export const INSTRUMENTS = \['SPOT', 'FUTURES'\]/);
  assert.match(source, /export const STRATEGIES = \['SCALP', 'MOMENTUM', 'HOLD', 'NO_TRADE'\]/);
  assert.match(source, /export type InstrumentType = \(typeof INSTRUMENTS\)\[number\]/);
  assert.match(source, /export type StrategyName = \(typeof STRATEGIES\)\[number\]/);
  assert.match(source, /target: TargetPosition/);
});

test('M5 contract validates provenance, risk, expiry and secrets', () => {
  for (const validator of [
    'validateProvenance', 'validateCandle', 'validateSignal', 'validateEntryExit',
    'validateRisk', 'validateExecution', 'buildAuditEvent', 'idempotencyKey',
  ]) {
    assert.match(source, new RegExp(`export function ${validator}\\b`), `missing ${validator}`);
  }
  assert.match(source, /BAD_EXPIRY/);
  assert.match(source, /SECRET_LIKE_VALUE/);
  assert.match(source, /PROVENANCE_MISMATCH/);
  assert.match(source, /value\.leverage !== 1/);
  assert.doesNotMatch(source, /fetch\(|axios|https?\.request|placeOrder|withdraw/i);
});
