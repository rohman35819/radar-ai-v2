/** Deterministic offline provider. No network, no API key, no cost. */
import { LEARNING_SCHEMA } from './contracts.mts';

export function createMockProvider(fixtures = {}) {
  if (!fixtures || typeof fixtures !== 'object' || Array.isArray(fixtures)) throw new TypeError('fixtures harus object');
  let calls = 0;
  return Object.freeze({
    id: 'mock',
    complete(task) {
      calls += 1;
      const fixture = fixtures[task?.taskId];
      if (!fixture) throw new Error('MOCK_FIXTURE_MISSING');
      if (fixture.taskId !== task.taskId) throw new Error('MOCK_TASK_MISMATCH');
      if (typeof fixture.text !== 'string' || !Array.isArray(fixture.claims)) throw new Error('MOCK_FIXTURE_INVALID');
      return Object.freeze({
        schema_version: LEARNING_SCHEMA,
        taskId: fixture.taskId,
        provider: fixture.provider || 'mock',
        model: fixture.model || 'mock-model',
        modelVersion: fixture.modelVersion || 'fixture-v1',
        text: fixture.text.slice(0, 16000),
        claims: fixture.claims.slice(0, 10).map((claim) => ({
          text: String(claim.text ?? '').slice(0, 500),
          ...(claim.evidenceRef ? { evidenceRef: String(claim.evidenceRef).slice(0, 200) } : {}),
        })),
        observedAt: fixture.observedAt || '2026-11-27T00:00:00.000Z',
        flags: Object.freeze([...(fixture.flags || [])]),
        ...(fixture.provenance ? { provenance: fixture.provenance } : {}),
        ...(fixture.evidence ? { evidence: fixture.evidence.slice(0, 8) } : {}),
      });
    },
    callCount() { return calls; },
  });
}

/** Fail-closed provider used when nothing is explicitly configured. */
export function createDisabledProvider() {
  return Object.freeze({
    id: 'disabled',
    complete() { throw new Error('PROVIDER_NOT_CONFIGURED: tidak ada provider aktif; tidak ada fallback berbayar'); },
  });
}
