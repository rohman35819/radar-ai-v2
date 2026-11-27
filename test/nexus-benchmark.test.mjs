import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCHMARK_SCHEMA, ALL_LESSONS, TRAINING_ANSWERS, benchmarkTasks, runBenchmark,
  selectWeakAreas, trainLoop,
} from '../src/nexus/curriculum/benchmark.mjs';
import { createKnowledgeStore } from '../src/nexus/core/store.mjs';
import { POLICY_REVISION, issueGrant } from '../src/nexus/core/capability.mjs';

const FIXED = new Date('2026-11-27T16:00:00.000Z');
const LATER = new Date('2026-11-27T16:30:00.000Z');

function grants() {
  return Object.fromEntries(ALL_LESSONS.map((lesson) => [
    lesson.lesson_id,
    issueGrant({
      issuer: 'RADAR', subject: 'nexus-student', role: 'learner',
      actions: ['knowledge.read', 'knowledge.propose', 'knowledge.approve'],
      resources: ['knowledge:*'], autonomyStage: 2,
      expiresAt: LATER.toISOString(), correlationId: lesson.lesson_id,
      policyRevision: POLICY_REVISION, approvalRequired: true,
    }, { now: FIXED }),
  ]));
}

test('benchmark covers all six lessons with unique deterministic tasks', () => {
  assert.equal(BENCHMARK_SCHEMA, 'radar-nexus-benchmark.v1');
  assert.equal(ALL_LESSONS.length, 6);
  const tasks = benchmarkTasks();
  assert.equal(tasks.length, 30);
  assert.equal(new Set(tasks.map((task) => task.id)).size, 30);
  assert.deepEqual([...new Set(tasks.map((task) => task.lesson_id))], ALL_LESSONS.map((l) => l.lesson_id));
  assert.deepEqual(benchmarkTasks(), tasks);
});

test('untrained NEXUS scores 0 and trained NEXUS scores 100 with honest claim', () => {
  const baseline = runBenchmark({});
  const trained = runBenchmark(TRAINING_ANSWERS);
  assert.equal(baseline.total, 0);
  assert.equal(baseline.passed_tasks, 0);
  assert.equal(trained.total, 100);
  assert.equal(trained.passed_tasks, 30);
  assert.equal(trained.comparable_to_external_models, false);
  assert.match(trained.claim, /no ChatGPT.*claim/i);
  for (const group of Object.values(trained.by_category)) assert.equal(group.passed, group.total);
});

test('unsafe answers identify weak lessons for targeted correction', () => {
  const weak = { ...TRAINING_ANSWERS };
  weak['lesson-03'] = { ...weak['lesson-03'], Q1: 'NEXUS boleh memberi grant pada dirinya sendiri.' };
  weak['lesson-05'] = { ...weak['lesson-05'], Q2: 'Lihat hasil dulu lalu tentukan hipotesis.' };
  const report = runBenchmark(weak);
  assert.ok(report.total < 100);
  const areas = selectWeakAreas(report);
  assert.ok(areas.includes('lesson-03'));
  assert.ok(areas.includes('lesson-05'));
});

test('training loop improves measurable score without external inference', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('NETWORK_FORBIDDEN'); };
  try {
    const store = createKnowledgeStore();
    const result = trainLoop({ store, grants: grants(), epochs: 3, now: FIXED });
    assert.equal(result.baseline, 0);
    assert.equal(result.final, 100);
    assert.ok(result.log.length >= 1 && result.log.length <= 5);
    assert.equal(result.store_size, 6);
    assert.equal(result.comparable_to_external_models, false);
    assert.match(result.limitation, /no model weights|no external inference/i);
    assert.ok(result.log.every((entry) => entry.total <= 100));
  } finally { globalThis.fetch = originalFetch; }
});

test('training artifacts contain no secrets and no autonomy or paid claims', () => {
  const dump = JSON.stringify({ ALL_LESSONS, TRAINING_ANSWERS, benchmarkTasks: benchmarkTasks() });
  assert.doesNotMatch(dump, /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|service_role_key)/);
  assert.doesNotMatch(dump, /always-on 24\/7 diaktifkan|aktifkan trial berbayar/i);
});
