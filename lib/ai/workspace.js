'use strict';

const { parseJson } = require('./chat-completions');

const PROJECT = {
  product: 'RADAR AI V2: dashboard screener token, watchlist, berita, unlock, alert, Grup AI, backend Node.js tanpa dependensi.',
  architecture: [
    'server.js memakai Node http dan public/ untuk UI.',
    'lib/ingest.js mengambil market data dan menyimpan state melalui DATA_DIR.',
    'lib/ai/group.js menjalankan empat analis pasar dan moderator Groq.',
    'lib/github/app-client.js adalah fondasi GitHub App pada branch developer; perubahan harus branch ai-dev/* dan draft PR.',
    'GitHub App dibatasi ke public/, lib/ai/, test/; main tidak boleh ditulis atau di-merge oleh AI.',
    'Tidak ada auto-trading. Semua usulan trading hanya analisis.',
    'Aplikasi harus ringan untuk Android, hemat API/token, aman, dan berbahasa Indonesia.'
  ],
  known_gaps: [
    'Belum ada diskusi silang dan penilaian Direktur Utama di dalam dashboard.',
    'GitHub App developer client belum dihubungkan ke antrean tugas yang disetujui.',
    'DATA_DIR pada hosting bisa bersifat sementara jika tidak memakai persistent volume.',
    'Sumber berita dan unlock memerlukan konfigurasi tambahan.'
  ]
};

const LENSES = {
  gemini: 'Kamu Gemini, peneliti produk dan pengalaman pengguna. Cari cara membuat RADAR lebih mudah dipahami, informatif, dan nyaman dipakai dari HP Android. Jangan hanya menyarankan animasi dekoratif; utamakan manfaat.',
  groq: 'Kamu Groq, insinyur reliability dan QA. Cari bug, risiko keamanan, ketahanan server, kualitas data, pengujian, dan cara membuat aplikasi tetap ringan.',
  openrouter: 'Kamu OpenRouter, arsitek sistem dan peneliti peluang. Cari integrasi data, modularitas, observability, ide fitur bernilai tinggi, dan efisiensi biaya.',
  openai: 'Kamu OpenAI, software engineer dan reviewer teknis. Cari perbaikan arsitektur, kualitas kode, developer experience, keamanan, dan implementasi bertahap.'
};

const SYSTEM_SUFFIX = `
Kamu adalah anggota tim yang bekerja secara mandiri. Jangan menunggu instruksi rinci; temukan sendiri masalah dan peluang dari konteks proyek.
Gunakan hanya fakta yang tersedia. Jangan mengaku telah membuka file, menjalankan tes, mengubah kode, atau mengakses GitHub.
Ajukan maksimal 3 proposal yang spesifik dan bisa diuji. Jangan mengulang ide anggota lain jika tidak memberi nilai tambahan.
Jangan menyarankan auto-trading, mengubah risk limit, membuka secret, menyimpan API key di browser, atau menulis langsung ke main.
Utamakan dampak nyata, keamanan, keterjangkauan biaya, dan kegunaan di layar HP.
Balas JSON saja:
{
  "observation": "temuan utama singkat",
  "proposals": [
    {
      "title": "judul ringkas",
      "problem": "masalah yang ingin diselesaikan",
      "benefit": "manfaat yang bisa diukur",
      "priority": "high | medium | low",
      "effort": "small | medium | large",
      "risk": "risiko utama",
      "files": ["path yang mungkin perlu diubah"],
      "acceptance_criteria": ["kriteria selesai yang bisa diuji"]
    }
  ],
  "challenge": "asumsi atau kelemahan yang perlu diperiksa",
  "self_critique": "apa yang mungkin salah dari usulanmu"
}
`;

function cleanText(value, max = 360) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function cleanList(value, maxItems = 4) {
  return Array.isArray(value) ? value.filter((x) => typeof x === 'string').slice(0, maxItems).map((x) => x.slice(0, 180)) : [];
}
function normalizeProposal(raw, provider, model) {
  const proposals = Array.isArray(raw.proposals) ? raw.proposals.slice(0, 3).map((p) => ({
    title: cleanText(p.title, 100),
    problem: cleanText(p.problem),
    benefit: cleanText(p.benefit),
    priority: ['high', 'medium', 'low'].includes(p.priority) ? p.priority : 'medium',
    effort: ['small', 'medium', 'large'].includes(p.effort) ? p.effort : 'medium',
    risk: cleanText(p.risk),
    files: cleanList(p.files, 5).filter((f) => /^(public|lib\/ai|test)\/[A-Za-z0-9_./-]+$/.test(f) && !f.split('/').includes('..')),
    acceptance_criteria: cleanList(p.acceptance_criteria, 4)
  })).filter((p) => p.title && p.problem && p.benefit) : [];
  return {
    provider, model,
    observation: cleanText(raw.observation),
    proposals,
    challenge: cleanText(raw.challenge),
    self_critique: cleanText(raw.self_critique),
    created_at: new Date().toISOString()
  };
}

async function requestCompatible({ provider, apiKey, baseUrl, model, headers = {}, context, fetchImpl = fetch, timeoutMs = 25000, reasoningEffort }) {
  if (!apiKey) throw new Error(provider.toUpperCase() + '_API_KEY belum dikonfigurasi');
  const response = await fetchImpl(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey, ...headers },
    body: JSON.stringify({
      model, max_tokens: 650, temperature: 0.35,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: LENSES[provider] + '\\n' + SYSTEM_SUFFIX },
        { role: 'user', content: JSON.stringify({ task: 'review mandiri RADAR AI', project: PROJECT, current_context: context || {} }) }
      ]
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(provider + ': respons bukan JSON'); }
  if (!response.ok) throw new Error(provider + ': ' + String(payload?.error?.message || payload?.message || ('HTTP ' + response.status)).slice(0, 160));
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error(provider + ': jawaban kosong');
  return normalizeProposal(parseJson(text), provider, model);
}

async function requestGemini({ apiKey, model, context, fetchImpl = fetch, timeoutMs = 25000 }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY belum dikonfigurasi');
  const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: LENSES.gemini + '\\n' + SYSTEM_SUFFIX }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ task: 'review mandiri RADAR AI', project: PROJECT, current_context: context || {} }) }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 1800, responseMimeType: 'application/json' }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  let payload;
  try { payload = await response.json(); } catch { throw new Error('Gemini: respons bukan JSON'); }
  if (!response.ok) throw new Error('Gemini: ' + String(payload?.error?.message || ('HTTP ' + response.status)).slice(0, 160));
  const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini: jawaban kosong');
  return normalizeProposal(parseJson(text), 'gemini', model);
}

async function runWorkspaceReview(context = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const env = options.env || process.env;
  const specs = [
    ['gemini', () => requestGemini({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-3.8-flash', context, fetchImpl, timeoutMs: options.timeoutMs })],
    ['groq', () => requestCompatible({ provider: 'groq', apiKey: env.GROQ_API_KEY, baseUrl: 'https://api.groq.com/openai/v1', model: env.GROQ_MODEL || 'openai/gpt-oss-20b', context, fetchImpl, timeoutMs: options.timeoutMs })],
    ['openrouter', () => requestCompatible({ provider: 'openrouter', apiKey: env.OPENROUTER_API_KEY, baseUrl: 'https://openrouter.ai/api/v1', model: env.OPENROUTER_MODEL || 'openrouter/free', headers: { 'HTTP-Referer': env.APP_URL || 'https://radar-ai-v2.hostless.app', 'X-Title': 'RADAR AI Workspace' }, context, fetchImpl, timeoutMs: options.timeoutMs })],
    ['openai', () => requestCompatible({ provider: 'openai', apiKey: env.OPENAI_API_KEY, baseUrl: 'https://api.openai.com/v1', model: env.OPENAI_MODEL || 'gpt-6-luna', context, fetchImpl, timeoutMs: options.timeoutMs, reasoningEffort: 'none' })]
  ];
  const settled = await Promise.allSettled(specs.map(([, run]) => run()));
  const agents = settled.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : { provider: specs[i][0], error: String(r.reason?.message || r.reason).slice(0, 180), proposals: [] });
  const valid = agents.filter((a) => !a.error);
  return {
    id: 'workspace-' + Date.now(),
    created_at: new Date().toISOString(),
    status: valid.length >= 2 ? 'completed' : 'insufficient_agents',
    agent_count: valid.length,
    agents,
    director_status: 'Menunggu penilaian Direktur Utama',
    safety: 'Usulan saja. Tidak ada perubahan kode, transaksi, atau merge otomatis.'
  };
}

module.exports = { runWorkspaceReview, normalizeProposal, PROJECT };
