/** Deterministic internal benchmark + training loop for NEXUS curriculum.
 * Measures curriculum mastery only. NOT comparable to ChatGPT or any external
 * model: no shared tasks, no external inference, no paid service, no background
 * worker. Claims of parity/superiority are explicitly unsupported. */
import { gradeLesson, correctionLesson } from './engine.mjs';
import { LESSON_01, LESSON_01_MODEL_ANSWERS, LESSON_01_FIXTURE, LESSON_01_TASK, LESSON_01_FACTS } from './lesson-01.mjs';
import { LESSONS, MODEL_ANSWERS, FIXTURES, TASKS } from './lessons-02-06.mjs';
import { createMockProvider } from '../core/provider.mjs';
import { runLearningPipeline } from '../core/learning.mjs';

export const BENCHMARK_SCHEMA = 'radar-nexus-benchmark.v1';
export const ALL_LESSONS = Object.freeze([LESSON_01, ...LESSONS]);
export const TRAINING_ANSWERS = Object.freeze({
  [LESSON_01.lesson_id]: LESSON_01_MODEL_ANSWERS,
  ...MODEL_ANSWERS,
});
const FIXTURES_ALL = { [LESSON_01.lesson_id]: LESSON_01_FIXTURE, ...FIXTURES };
const TASKS_ALL = { [LESSON_01.lesson_id]: LESSON_01_TASK, ...TASKS };

export function benchmarkTasks() {
  return ALL_LESSONS.flatMap((lesson) => lesson.exam.map((question) => ({
    id: `${lesson.lesson_id}:${question.id}`,
    lesson_id: lesson.lesson_id,
    category: lesson.level,
    question: question.question,
    required: [...question.required],
    forbidden: [...question.forbidden],
  })));
}

/** Flattens lesson answers into benchmark keys, e.g. lesson-02:Q1. */
export function flattenAnswers(byLesson = {}) {
  const out = {};
  for (const lesson of ALL_LESSONS) {
    const answers = byLesson[lesson.lesson_id] ?? {};
    for (const question of lesson.exam) out[`${lesson.lesson_id}:${question.id}`] = answers[question.id] ?? '';
  }
  return out;
}

export function runBenchmark(answersByLesson = {}) {
  const answers = flattenAnswers(answersByLesson);
  const perLesson = ALL_LESSONS.map((lesson) => gradeLesson(lesson, answersByLesson[lesson.lesson_id] ?? {}));
  const tasks = benchmarkTasks();
  const passed = tasks.filter((task) => {
    const lower = String(answers[task.id] ?? '').toLowerCase();
    return task.required.every((token) => lower.includes(token)) && task.forbidden.every((token) => !lower.includes(token));
  }).length;
  const total = Math.round((passed / tasks.length) * 100);
  const byCategory = {};
  for (const task of tasks) {
    const entry = byCategory[task.category] ?? { passed: 0, total: 0 };
    const lower = String(answers[task.id] ?? '').toLowerCase();
    const ok = task.required.every((token) => lower.includes(token)) && task.forbidden.every((token) => !lower.includes(token));
    byCategory[task.category] = { passed: entry.passed + (ok ? 1 : 0), total: entry.total + 1 };
  }
  return {
    schema_version: BENCHMARK_SCHEMA,
    total,
    passed_tasks: passed,
    total_tasks: tasks.length,
    by_category: byCategory,
    per_lesson: perLesson.map((result, index) => ({ lesson_id: ALL_LESSONS[index].lesson_id, total: result.total, passed: result.passed })),
    comparable_to_external_models: false,
    claim: 'Internal curriculum benchmark only; no ChatGPT/DeepSeek parity or superiority claim is supported.',
  };
}

/** Returns lesson IDs that need remediation based on a benchmark result. */
export function selectWeakAreas(report) {
  return report.per_lesson.filter((item) => !item.passed).map((item) => item.lesson_id);
}

function factsFor(lesson) {
  return lesson.lesson_id === LESSON_01.lesson_id
    ? LESSON_01_FACTS
    : lesson.exam.map((question) => question.claim);
}

/** One training epoch: ingest all lessons through the approval pipeline and
 * re-measure. Returns a bounded log entry. No external model, no persistence. */
export function trainEpoch({ store, grant, grants = null, now = new Date(), answersByLesson = TRAINING_ANSWERS, approved = true } = {}) {
  const ingested = [];
  for (const lesson of ALL_LESSONS) {
    const id = lesson.lesson_id;
    const out = runLearningPipeline({
      task: TASKS_ALL[id],
      provider: createMockProvider({ [`${id}-ingest`]: FIXTURES_ALL[id] }),
      facts: factsFor(lesson), store, grant: grants?.[id] ?? grant,
      approver: () => (approved ? 'approve' : 'reject'),
      clock: () => now, now,
    });
    ingested.push({ lesson_id: id, verdict: out.evaluation.verdict, status: out.record.status });
  }
  const report = runBenchmark(answersByLesson);
  return { at: now.toISOString(), ingested, benchmark: report, weak_areas: selectWeakAreas(report) };
}

/** Repeated training over fixtures with a bounded log. Improvement measured
 * against the untrained baseline; it does NOT imply model-weight learning. */
export function trainLoop({ store, grant, grants = null, epochs = 2, now = new Date() } = {}) {
  const bounded = Math.max(1, Math.min(5, Math.floor(epochs)));
  const log = [];
  const baseline = runBenchmark({});
  for (let epoch = 0; epoch < bounded; epoch += 1) {
    const stamp = new Date(now.getTime() + epoch * 1000);
    const entry = trainEpoch({ store, grant, grants, now: stamp });
    log.push({ epoch: epoch + 1, total: entry.benchmark.total, weak_areas: entry.weak_areas });
    if (entry.weak_areas.length === 0) break;
    const corrections = entry.weak_areas.map((id) => {
      const lesson = ALL_LESSONS.find((item) => item.lesson_id === id);
      const grading = gradeLesson(lesson, TRAINING_ANSWERS[id]);
      return { lesson_id: id, correction: correctionLesson(grading, lesson) };
    });
    log[log.length - 1].corrections = corrections;
  }
  return {
    schema_version: BENCHMARK_SCHEMA,
    baseline: baseline.total,
    final: log.length ? log[log.length - 1].total : baseline.total,
    log,
    store_size: store.size(),
    comparable_to_external_models: false,
    limitation: 'Fixture-based curriculum training; no model weights, no external inference, no persistent NEXUS memory, no always-on runtime.',
  };
}
