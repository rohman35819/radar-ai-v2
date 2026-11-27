import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LESSONS, MODEL_ANSWERS, FIXTURES, TASKS } from '../src/nexus/curriculum/lessons-02-06.mjs';
import { gradeLesson, correctionLesson, summarizeLesson } from '../src/nexus/curriculum/engine.mjs';
import { createMockProvider } from '../src/nexus/core/provider.mjs';
import { runLearningPipeline } from '../src/nexus/core/learning.mjs';
import { createKnowledgeStore } from '../src/nexus/core/store.mjs';
import { POLICY_REVISION, issueGrant } from '../src/nexus/core/capability.mjs';

const FIXED = new Date('2026-11-27T15:00:00.000Z');
const LATER = new Date('2026-11-27T15:30:00.000Z');

function grantFor(id) {
  return issueGrant({
    issuer: 'RADAR', subject: 'nexus-student', role: 'learner',
    actions: ['knowledge.read', 'knowledge.propose', 'knowledge.approve'],
    resources: ['knowledge:*'], autonomyStage: 2,
    expiresAt: LATER.toISOString(), correlationId: id,
    policyRevision: POLICY_REVISION, approvalRequired: true,
  }, { now: FIXED });
}

test('five lessons have complete material, examples, exercises, exam and sources', () => {
  assert.deepEqual(LESSONS.map((l) => l.lesson_id), ['lesson-02', 'lesson-03', 'lesson-04', 'lesson-05', 'lesson-06']);
  for (const lesson of LESSONS) {
    assert.equal(lesson.schema_version, 'radar-nexus-lesson.v1');
    assert.ok(lesson.objectives.length >= 4);
    assert.equal(lesson.material.length, 5);
    assert.equal(lesson.exerciseCount ?? lesson.exercises.length, 3);
    assert.equal(lesson.exam.length, 5);
    assert.ok(lesson.examples.some((e) => e.kind === 'good') && lesson.examples.some((e) => e.kind === 'bad'));
    assert.ok(lesson.source_refs.length > 0);
    for (const section of lesson.material) assert.ok(section.content.length > 100 && section.source_refs.length > 0);
  }
});

test('NEXUS passes every exam with model answers and fails with unsafe answers', () => {
  for (const lesson of LESSONS) {
    const good = gradeLesson(lesson, MODEL_ANSWERS[lesson.lesson_id]);
    assert.equal(good.total, 100, `${lesson.lesson_id} harus 100`);
    assert.equal(good.passed, true);
    assert.equal(correctionLesson(good, lesson).required, false);
    const bad = gradeLesson(lesson, Object.fromEntries(lesson.exam.map((q) => [
      q.id, `${q.forbidden[0]} dan tidak ada jawaban benar.`,
    ])));
    assert.equal(bad.passed, false, `${lesson.lesson_id} harus gagal`);
    const correction = correctionLesson(bad, lesson);
    assert.equal(correction.required, true);
    assert.ok(correction.sections.length > 0);
  }
});

test('all five lessons are ingestible into knowledge memory and survive reload', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('NETWORK_FORBIDDEN'); };
  try {
    const store = createKnowledgeStore();
    for (const lesson of LESSONS) {
      const id = lesson.lesson_id;
      const out = runLearningPipeline({
        task: TASKS[id],
        provider: createMockProvider({ [`${id}-ingest`]: FIXTURES[id] }),
        facts: lesson.exam.map((question) => question.claim),
        store, grant: grantFor(id), approver: () => 'approve',
        clock: () => FIXED, now: FIXED,
      });
      assert.equal(out.evaluation.verdict, 'approve', id);
      assert.equal(out.record.status, 'approved', id);
      assert.equal(out.record.provenance.revision, `${id}-v1`);
    }
    assert.equal(store.size(), 5);
    const reloaded = createKnowledgeStore();
    reloaded.importState(store.exportState());
    assert.equal(reloaded.retrieve({ scope: { type: 'project', id: 'radar-ai-v2' }, status: 'approved', limit: 20 }).length, 5);
  } finally { globalThis.fetch = originalFetch; }
});

test('failure of any exam never promotes that lesson', () => {
  for (const lesson of LESSONS) {
    const store = createKnowledgeStore();
    const id = lesson.lesson_id;
    runLearningPipeline({
      task: TASKS[id], provider: createMockProvider({ [`${id}-ingest`]: FIXTURES[id] }),
      facts: lesson.exam.map((q) => q.claim), store, grant: grantFor(id),
      approver: () => 'reject', clock: () => FIXED, now: FIXED,
    });
    assert.equal(store.retrieve({ scope: TASKS[id].scope, status: 'approved' }).length, 0, id);
    assert.equal(store.retrieve({ scope: TASKS[id].scope, status: 'rejected' }).length, 1, id);
  }
});

test('transfer artifact stays compact, sourced and free of secrets/transcripts', () => {
  const index = LESSONS.map(summarizeLesson).join('\n');
  assert.ok(index.length < 1000);
  for (const lesson of LESSONS) assert.ok(summarizeLesson(lesson).length < 180);
  const doc = readFileSync(new URL('../docs/nexus-curriculum/grok-knowledge-transfer.md', import.meta.url), 'utf8');
  assert.ok(doc.length < 12000, 'transfer doc harus ringkas');
  assert.match(doc, /source_refs|source/i);
  assert.doesNotMatch(doc, /transkrip chat lengkap|riwayat percakapan BOS|api_key=|service_role_key|database_password/);
  const dump = JSON.stringify({ LESSONS, FIXTURES });
  assert.doesNotMatch(dump, /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,})/);
});
