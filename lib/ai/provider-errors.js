'use strict';

const { redactSecrets } = require('./context-budget');

const ERROR_CODES = Object.freeze({
  RATE_LIMIT_TPM: 'RATE_LIMIT_TPM',
  RATE_LIMIT_429: 'RATE_LIMIT_429',
  TIMEOUT: 'TIMEOUT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  AUTH: 'AUTH',
  QUEUE_FULL: 'AI_QUEUE_FULL',
  BAD_RESPONSE: 'BAD_RESPONSE',
  UNKNOWN: 'UNKNOWN',
});

// Classifies provider failures into bounded, secret-free, actionable states.
// Never surfaces a raw provider body: it can contain request echoes or keys.
function classifyProviderError({ provider = 'provider', status = null, message = '', error = null } = {}) {
  const raw = String(message || error?.message || '').slice(0, 600);
  const text = raw.toLowerCase();
  const safeDetail = redactSecrets(raw).replace(/\s+/g, ' ').slice(0, 180);
  const base = { provider, status, safeDetail };

  if (error?.code === ERROR_CODES.QUEUE_FULL || (status === 503 && text.includes('antrean'))) {
    return { ...base, code: ERROR_CODES.QUEUE_FULL, retryable: false, reduceContext: false,
      userMessage: 'Antrean AI penuh. Tunggu pekerjaan berjalan selesai sebelum mengirim permintaan baru.' };
  }
  const isTpm = text.includes('tpm') || text.includes('token per menit') || text.includes('tokens per minute') || text.includes('rate_limit_exceeded');
  if (status === 429 || isTpm || text.includes('rate limit')) {
    return { ...base, code: isTpm ? ERROR_CODES.RATE_LIMIT_TPM : ERROR_CODES.RATE_LIMIT_429,
      retryable: true, reduceContext: true,
      userMessage: isTpm
        ? 'Provider melampaui batas token per menit (TPM). Konteks diperkecil otomatis dan permintaan diulang sekali; jika masih gagal, persempit cakupan atau tunggu. Tidak ada provider berbayar yang dipakai.'
        : 'Provider menerima terlalu banyak permintaan (HTTP 429). Permintaan diulang sekali dengan konteks lebih kecil.' };
  }
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || text.includes('timeout') || text.includes('aborted')) {
    return { ...base, code: ERROR_CODES.TIMEOUT, retryable: true, reduceContext: false,
      userMessage: 'Provider tidak merespons dalam batas waktu. Permintaan diulang sekali; periksa koneksi jika masih gagal.' };
  }
  if (status === 401 || status === 403 || text.includes('invalid api key') || text.includes('unauthorized')) {
    return { ...base, code: ERROR_CODES.AUTH, retryable: false, reduceContext: false,
      userMessage: 'Kredensial provider ditolak. Periksa konfigurasi server-side oleh BOS; jangan menempelkan kunci ke chat atau klien.' };
  }
  if ([500, 502, 503, 504].includes(status) || text.includes('high demand') || text.includes('overloaded') || text.includes('unavailable')) {
    return { ...base, code: ERROR_CODES.PROVIDER_UNAVAILABLE, retryable: true, reduceContext: false,
      userMessage: 'Provider sedang tidak tersedia. Status ditampilkan apa adanya; tidak ada fallback berbayar yang diaktifkan.' };
  }
  if (text.includes('json') || text.includes('jawaban kosong') || text.includes('format jawaban')) {
    return { ...base, code: ERROR_CODES.BAD_RESPONSE, retryable: false, reduceContext: false,
      userMessage: 'Provider mengembalikan format jawaban yang tidak dapat dipakai. Respons dibuang, bukan ditebak.' };
  }
  return { ...base, code: ERROR_CODES.UNKNOWN, retryable: false, reduceContext: false,
    userMessage: 'Permintaan ke provider gagal. Detail dibatasi agar tidak membocorkan konfigurasi.' };
}

function providerFailure(provider, status, message, error) {
  const info = classifyProviderError({ provider, status, message, error });
  const err = new Error(info.userMessage);
  err.code = info.code;
  err.statusCode = status;
  err.retryable = info.retryable;
  err.reduceContext = info.reduceContext;
  err.safeDetail = info.safeDetail;
  return err;
}

module.exports = { ERROR_CODES, classifyProviderError, providerFailure };
