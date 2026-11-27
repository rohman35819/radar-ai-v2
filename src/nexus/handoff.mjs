/** Compact NEXUS handoff for cross-session use. Facts only; never a chat archive. */
import { redact } from './session.mjs';

const MAX_ITEMS = 5;
const MAX_LINE = 220;

function rows(title, values, max = MAX_ITEMS) {
  const kept = (Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.trim())
    .slice(0, max)
    .map((value) => `- ${redact(value.trim()).replace(/\s+/g, ' ').slice(0, MAX_LINE)}`);
  return kept.length ? `\n${title}\n${kept.join('\n')}` : '';
}

/**
 * Produce a short, redacted, bounded handoff. Safe to paste into another
 * session; it does not include message-by-message conversation history.
 */
export function compactHandoff({
  session = null, status = null, decisions = [], evidence = [], blockers = [], next = [], limit = 2400,
} = {}) {
  const identity = status?.identity || 'RADAR NEXUS';
  const provider = status ? `${status.provider_state}: ${status.provider_detail}` : 'belum diperiksa';
  let text = [
    'Penerima: BOS Besar',
    `Identitas: ${identity}`,
    `Provider NEXUS: ${provider}`,
    'Batas tetap: Rp0; tanpa paid provider/trial/Dev Tier; tanpa worker/scheduler; tanpa live order/withdrawal; tanpa klaim LIVE atau always-on.',
    session ? `Sesi lokal: ${session.id} (${session.messages?.length ?? 0} pesan, tersimpan di luar Git).` : '',
    rows('Keputusan', decisions),
    rows('Bukti tes', evidence),
    rows('Blocker', blockers, 3),
    rows('NEXT TASK', next, 3),
  ].filter(Boolean).join('\n');
  if (text.length > limit) text = `${text.slice(0, limit - 40)}\n[handoff dipotong aman; buka dokumen sumber untuk detail]`;
  return redact(text);
}

export default compactHandoff;
