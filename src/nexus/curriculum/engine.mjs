/** Generic curriculum engine: grader, correction and knowledge fixture builder.
 * Reuses the NEXUS learning pipeline; no network, credentials or side effects. */
import { LEARNING_SCHEMA } from '../core/contracts.mts';

export const CURRICULUM_SCHEMA = 'radar-nexus-lesson.v1';

export function gradeLesson(lesson, answers = {}) {
  const results = lesson.exam.map((question) => {
    const lower = String(answers[question.id] ?? '').toLowerCase();
    const missing = question.required.filter((token) => !lower.includes(token));
    const violations = question.forbidden.filter((token) => lower.includes(token));
    const score = Math.max(0, 100 - missing.length * 20 - violations.length * 50);
    return {
      id: question.id,
      score,
      passed: score >= lesson.pass_score,
      missing,
      violations,
      remediation: score >= lesson.pass_score ? null : question.remediation,
      feedback: violations.length
        ? `Klaim terlarang: ${violations.join(', ')}. Baca ulang ${question.remediation}.`
        : missing.length
          ? `Konsep kurang: ${missing.join(', ')}. Baca ulang ${question.remediation}.`
          : 'Lengkap dan tidak mengandung klaim terlarang.',
    };
  });
  const total = Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length);
  return { total, passed: total >= lesson.pass_score && results.every((item) => item.passed), results };
}

export function correctionLesson(grading, lesson) {
  if (grading.passed) return { required: false, status: 'no_correction', actions: [] };
  const sections = [...new Set(grading.results.filter((item) => !item.passed).map((item) => item.remediation))];
  return {
    required: true,
    status: 'remediation_required',
    sections,
    actions: [
      `Baca ulang ${sections.join(', ')}.`,
      'Tulis ulang jawaban yang gagal tanpa klaim terlarang.',
      'Ulangi ujian; materi tidak dipromosikan sebelum ujian lulus.',
      'Simpan koreksi sebagai versi baru dengan supersedes, bukan menimpa versi lama.',
    ],
  };
}

/** Builds a deterministic provider fixture whose claims are grounded in facts. */
export function makeLessonFixture(lesson, { sourceUri, revision, observedAt, extractedBy = 'grok-first-teacher' }) {
  const claims = lesson.exam.map((question) => ({ text: question.claim }));
  return {
    taskId: lesson.lesson_id + '-ingest',
    provider: 'radar-curriculum',
    model: lesson.lesson_id + '-curriculum',
    modelVersion: 'v1',
    text: claims.map((claim) => claim.text).join('. ') + '.',
    claims,
    provenance: {
      sourceId: 'radar-curriculum-' + lesson.lesson_id,
      sourceKind: 'document',
      provider: 'radar-curriculum',
      model: lesson.lesson_id + '-curriculum',
      modelVersion: 'v1',
      uri: sourceUri,
      revision,
      observedAt,
      extractedBy,
      method: 'structured-curriculum-fixture',
      sensitivity: 'internal',
      license: 'UNLICENSED-repository',
      claims,
    },
    evidence: [{ kind: 'repository_check', ref: sourceUri, passed: true, detail: 'bersumber dari repository dan mandat BOS' }],
    flags: [],
  };
}

export function makeLessonTask(lesson, sourceUri) {
  return {
    taskId: lesson.lesson_id + '-ingest',
    instruction: `Simpan pelajaran ${lesson.lesson_id}: ${lesson.title}`,
    sourceRef: sourceUri,
    scope: { type: 'project', id: 'radar-ai-v2' },
    sensitivity: 'internal',
    correlationId: lesson.lesson_id,
  };
}

/** Compact index entry — deliberately small so NEXUS memory is not flooded. */
export function summarizeLesson(lesson) {
  return `${lesson.lesson_id} | ${lesson.title} | ${lesson.material.length} bagian | ujian ${lesson.exam.length} soal | ${lesson.source_refs.length} referensi`;
}

export { LEARNING_SCHEMA };
