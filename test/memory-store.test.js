'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryStore, validateProposal, MemoryError } = require('../lib/knowledge/memory');

const sample = {
  memoryKey: 'decision-data-provenance-v1',
  memoryType: 'decision',
  scopeType: 'project',
  scopeId: 'radar-ai-v2',
  sensitivity: 'internal',
  sourceType: 'github',
  sourceRef: 'https://github.com/rohman35819/radar-ai-v2/issues/82',
  sourceRevision: '59c450093a06c69c0deef8d1d117540a1f918a1a',
  title: 'Data provenance is mandatory',
  summary: 'Every market fact must retain a source and revision.',
  content: 'Store only concise, source-backed project knowledge.',
  retentionUntil: '2027-11-24T00:00:00.000Z',
  artifactRefs: ['https://github.com/rohman35819/radar-ai-v2/issues/82']
};

test('memory proposals require provenance, actor, scope and retention metadata', () => {
  const row = validateProposal(sample, { id: 'division-07' });
  assert.equal(row.status, 'proposed');
  assert.equal(row.created_by, 'division-07');
  assert.equal(row.source_revision, sample.sourceRevision);
  assert.equal(row.approved_by, undefined);
});

test('memory proposals cannot store secret-like values or restricted sensitivity', () => {
  assert.throws(() => validateProposal({ ...sample, content: 'OPENAI_' + 'API_KEY=' + 'sk-' + '12345678901234567890' }, { id: 'division-07' }), (e) => e.code === 'MEMORY_SECRET_LIKE_CONTENT_REJECTED');
  assert.throws(() => validateProposal({ ...sample, sensitivity: 'restricted' }, { id: 'division-07' }), (e) => e.code === 'MEMORY_INVALID_SENSITIVITY');
});

test('memory proposals reject missing source revision and invalid retention', () => {
  assert.throws(() => validateProposal({ ...sample, sourceRevision: '' }, { id: 'division-07' }), /MEMORY_SOURCE_REVISION_REQUIRED/);
  assert.throws(() => validateProposal({ ...sample, retentionUntil: 'not-a-date' }, { id: 'division-07' }), /MEMORY_INVALID_RETENTION/);
});

test('memory proposals are always proposed and cannot be inserted as approved', () => {
  const row = validateProposal({ ...sample, status: 'approved', approvedBy: 'owner' }, { id: 'division-07' });
  assert.equal(row.status, 'proposed');
  assert.equal(row.approved_by, undefined);
});

test('memory store fails closed when Supabase service configuration is missing', async () => {
  const store = createMemoryStore({ url: '', serviceKey: '', fetchImpl: async () => { throw new Error('must not fetch'); } });
  await assert.rejects(store.listProposals({ type: 'project', id: 'radar-ai-v2' }), (e) => e.code === 'MEMORY_NOT_CONFIGURED');
});

test('memory proposal writes use server-side service credentials and force proposed state', async () => {
  let call;
  const store = createMemoryStore({
    url: 'https://example.supabase.co',
    serviceKey: 'test-service-secret',
    fetchImpl: async (url, options) => {
      call = { url: String(url), options };
      return new Response(JSON.stringify([{ memory_id: '00000000-0000-4000-8000-000000000001', status: 'proposed' }]), { status: 201 });
    }
  });
  const result = await store.propose(sample, { id: 'division-07' });
  assert.equal(result.status, 'proposed');
  assert.match(call.url, /radar_memory_records/);
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers.apikey, 'test-service-secret');
  assert.equal(JSON.parse(call.options.body).status, 'proposed');
  assert.equal(JSON.parse(call.options.body).approved_by, undefined);
});

test('memory retrieval applies scope and approval filters before full-text ranking', async () => {
  let call;
  const store = createMemoryStore({
    url: 'https://example.supabase.co',
    serviceKey: 'test-service-secret',
    fetchImpl: async (url) => {
      call = new URL(String(url));
      return new Response('[]', { status: 200 });
    }
  });
  await store.searchApproved({ type: 'division', id: '07' }, 'provenance source', { limit: 999 });
  assert.equal(call.searchParams.get('scope_type'), 'eq.division');
  assert.equal(call.searchParams.get('scope_id'), 'eq.07');
  assert.equal(call.searchParams.get('status'), 'eq.approved');
  assert.equal(call.searchParams.get('sensitivity'), 'in.(public,internal)');
  assert.equal(call.searchParams.get('search_vector'), 'wfts.provenance source');
  assert.equal(call.searchParams.get('limit'), '50');
});

test('proposal listing never returns confidential records and requires an explicit scope', async () => {
  let call;
  const store = createMemoryStore({
    url: 'https://example.supabase.co',
    serviceKey: 'test-service-secret',
    fetchImpl: async (url) => { call = new URL(String(url)); return new Response('[]', { status: 200 }); }
  });
  await assert.rejects(store.listProposals(null), (e) => e.code === 'MEMORY_SCOPE_REQUIRED');
  await store.listProposals({ type: 'agent', id: 'division-07-agent' });
  assert.equal(call.searchParams.get('status'), 'eq.proposed');
  assert.equal(call.searchParams.get('sensitivity'), 'in.(public,internal)');
});

test('memory storage errors expose status codes only, never upstream response bodies', async () => {
  const store = createMemoryStore({
    url: 'https://example.supabase.co',
    serviceKey: 'test-service-secret',
    fetchImpl: async () => new Response('service secret leaked here', { status: 403 })
  });
  await assert.rejects(store.listProposals({ type: 'project', id: 'radar-ai-v2' }), (e) => {
    assert.equal(e.code, 'MEMORY_STORAGE_HTTP_403');
    assert.equal(e.message.includes('secret'), false);
    return true;
  });
});

test('memory proposals reject secrets embedded in artifact references', () => {
  assert.throws(() => validateProposal({
    ...sample,
    artifactRefs: ['https://example.test/callback?token=supersecretcredentialvalue123']
  }, { id: 'division-07' }), (e) => e.code === 'MEMORY_SECRET_LIKE_CONTENT_REJECTED');
});

test('memory store accepts only HTTPS base URLs without embedded credentials or path', () => {
  assert.throws(() => createMemoryStore({ url: 'http://example.supabase.co', serviceKey: 'secret' }), (e) => e.code === 'MEMORY_INVALID_URL');
  assert.throws(() => createMemoryStore({ url: 'https://user:pass@example.supabase.co', serviceKey: 'secret' }), (e) => e.code === 'MEMORY_INVALID_URL');
});

test('memory retrieval excludes expired and not-yet-valid records at the database query', async () => {
  let call;
  const store = createMemoryStore({
    url: 'https://example.supabase.co',
    serviceKey: 'test-service-secret',
    fetchImpl: async (url) => { call = new URL(String(url)); return new Response('[]', { status: 200 }); }
  });
  await store.searchApproved({ type: 'project', id: 'radar-ai-v2' }, 'current policy');
  assert.match(call.searchParams.get('retention_until'), /^gt\./);
  const validity = call.searchParams.get('and');
  assert.match(validity, /valid_from\.is\.null/);
  assert.match(validity, /valid_until\.is\.null/);
});

test('memory proposals reject Supabase secret keys and JWT credentials', () => {
  assert.throws(() => validateProposal({ ...sample, content: 'sb_secret_1234567890abcdefghijklmnop' }, { id: 'division-07' }),
    (e) => e.code === 'MEMORY_SECRET_LIKE_CONTENT_REJECTED');
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ0ZXN0In0', 'signaturevalue123'].join('.');
  assert.throws(() => validateProposal({ ...sample, artifactRefs: [jwt] }, { id: 'division-07' }),
    (e) => e.code === 'MEMORY_SECRET_LIKE_CONTENT_REJECTED');
});

test('memory proposals reject secrets in identifiers and source revisions before persistence', () => {
  assert.throws(() => validateProposal({ ...sample, sourceRevision: 'sb_secret_1234567890abcdefghijklmnop' }, { id: 'division-07' }),
    (e) => e.code === 'MEMORY_SECRET_LIKE_CONTENT_REJECTED');
  const secretMemoryKey = 'sk-' + ['1234567890', '1234567890'].join('');
  assert.throws(() => validateProposal({ ...sample, memoryKey: secretMemoryKey }, { id: 'division-07' }),
    (e) => e.code === 'MEMORY_SECRET_LIKE_CONTENT_REJECTED');
});

test('memory proposal artifact references are bounded before secret scanning', () => {
  assert.throws(() => validateProposal({ ...sample, artifactRefs: Array(21).fill('https://example.test/ref') }, { id: 'division-07' }),
    (e) => e.code === 'MEMORY_INVALID_ARTIFACT_REFS');
  assert.throws(() => validateProposal({ ...sample, artifactRefs: ['https://example.test/ref', 42] }, { id: 'division-07' }),
    (e) => e.code === 'MEMORY_INVALID_ARTIFACT_REFS');
});

test('memory store rejects Supabase URLs containing paths, query strings or fragments', () => {
  for (const url of [
    'https://example.supabase.co/rest/v1',
    'https://example.supabase.co?apikey=not-allowed',
    'https://example.supabase.co#fragment'
  ]) {
    assert.throws(() => createMemoryStore({ url, serviceKey: 'test-service-secret' }),
      (e) => e.code === 'MEMORY_INVALID_URL');
  }
});
