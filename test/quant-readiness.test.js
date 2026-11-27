'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

async function load() {
  return {
    risk: await import('../src/quant/risk-budget.mts'),
    audit: await import('../src/quant/audit.mts'),
    recon: await import('../src/quant/reconciliation.mts'),
  };
}

const validBudget = {
  equity: 10000,
  risk_fraction_per_trade: 0.01,
  stop_loss_pct: 0.10,
  entry_price: 60000,
  max_exposure: 1,
  current_exposure: 0,
  kill_switch: false,
  daily_loss_pct: 0,
  max_daily_loss_pct: 0.03,
  consecutive_losses: 0,
  max_consecutive_losses: 3,
};

test('risk budget sizes from risk budget and respects circuit breakers', async () => {
  const { risk } = await load();
  const base = risk.evaluateRiskBudget(validBudget);
  assert.equal(base.allow, true);
  assert.equal(base.size_fraction, 0.1);
  assert.equal(base.target_exposure, 0.1);
  const capped = risk.evaluateRiskBudget({ ...validBudget, max_exposure: 0.05 });
  assert.equal(capped.allow, true);
  assert.equal(capped.size_fraction, 0.05);
  assert.equal(risk.evaluateRiskBudget({ ...validBudget, kill_switch: true }).allow, false);
  assert.equal(risk.evaluateRiskBudget({ ...validBudget, daily_loss_pct: 0.04 })
    .reasons.includes('DAILY_LOSS_LIMIT'), true);
  assert.equal(risk.evaluateRiskBudget({ ...validBudget, consecutive_losses: 3 })
    .reasons.includes('LOSS_STREAK_LIMIT'), true);
  assert.equal(risk.evaluateRiskBudget({ ...validBudget, current_exposure: 1 })
    .reasons.includes('EXPOSURE_LIMIT'), true);
  assert.equal(risk.evaluateRiskBudget(null).allow, false);
  assert.equal(risk.evaluateRiskBudget({ ...validBudget, equity: Number.NaN }).allow, false);
});

test('audit ledger is deterministic, idempotent and refuses secret-bearing input', async () => {
  const { audit } = await load();
  const input = {
    timestamp: '2026-11-27T00:00:00Z', actor: 'grok', action: 'signal.received',
    entity_type: 'signal', entity_id: 'sig-0001', correlation_id: 'corr-0001',
    detail: 'received deterministic signal',
  };
  const first = audit.appendAuditEvent([], input);
  assert.equal(first.length, 1);
  assert.equal(first[0].event_id, audit.auditEventId(input));
  assert.deepEqual(audit.appendAuditEvent(first, input), first);
  assert.deepEqual(audit.appendAuditEvent([], { ...input, detail: 'api_key=abcdefghijklmnop' }), []);
  assert.deepEqual(audit.appendAuditEvent([], { ...input, action: 'trade.execute' }), []);
  assert.equal(audit.appendAuditEvent(first, { ...input, correlation_id: 'corr-0002' }).length, 2);
  assert.equal(audit.appendAuditEvent(first, input, 1).length, 1);
  const again = audit.appendAuditEvent([], input);
  assert.deepEqual(again, first);
});

test('reconciliation reports missing, unexpected and mismatched fills deterministically', async () => {
  const { recon } = await load();
  const expected = [
    { id: 'f1', symbol: 'BTCUSDT', side: 'enter', price: 60000, quantity: 0.1 },
    { id: 'f2', symbol: 'BTCUSDT', side: 'exit', price: 61000, quantity: 0.1 },
  ];
  const exact = recon.reconcileFills(expected, expected);
  assert.equal(exact.balanced, true);
  assert.deepEqual(exact.matched, ['f1', 'f2']);
  const observed = [{ ...expected[0], price: 60050 }, { ...expected[1], id: 'f3' }];
  const result = recon.reconcileFills(expected, observed);
  assert.equal(result.balanced, false);
  assert.deepEqual(result.mismatched.map((item) => item.fields), [['price']]);
  assert.deepEqual(result.unexpected, ['f3']);
  assert.deepEqual(recon.reconcileFills(expected, observed), result);
  assert.equal(recon.reconcileFills(null, expected).reasons === undefined, true);
  assert.equal(recon.reconcileFills(null, expected).balanced, false);
  assert.equal(recon.reconcileFills([{ id: 'bad' }], expected).errors[0], 'INVALID_FILL');
  assert.equal(result.note.includes('not an active paper ledger'), true);
});

test('shadow readiness modules contain no network or order path', async () => {
  const paths = [
    'src/quant/risk-budget.mts', 'src/quant/audit.mts', 'src/quant/reconciliation.mts',
  ];
  for (const path of paths) {
    const source = readFileSync(join(__dirname, '..', path), 'utf8');
    assert.equal(/fetch\s*\(/.test(source), false, `${path} must not fetch`);
    assert.equal(/http\.request|https\.request/.test(source), false, `${path} must not call HTTP`);
    assert.equal(/submitOrder|placeOrder/.test(source), false, `${path} must not submit orders`);
  }
});
