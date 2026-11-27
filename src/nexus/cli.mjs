#!/usr/bin/env node
/** RADAR NEXUS terminal client. Same API/policy as the dashboard; no second brain. */
import { createInterface } from 'node:readline/promises';
import { createNexusClient } from './client.mts';
import { createSessionStore, redact } from './session.mjs';
import { createRepoContext } from './repo.mjs';
import { createPolicyGateway } from './policy.mjs';
import { compactHandoff } from './handoff.mjs';

const HELP = `RADAR NEXUS — perintah:
  /help                  tampilkan bantuan ini
  /status                status NEXUS Core, provider, dan memory
  /memory                ringkasan memori dari AI Workspace
  /handoff               ringkasan NEXUS ringkas untuk sesi berikutnya
  /sessions              daftar sesi lokal
  /new                   sesi baru
  /resume <id>           lanjutkan sesi
  /clear                 hapus sesi aktif
  /structure             struktur top-level repository
  /files [prefix]        daftar file (read-only)
  /read <path>           baca file (read-only)
  /search <query>        cari teks di repository (read-only)
  /edit <path>           usulkan edit penuh;Review diff + persetujuan BOS
  /run <command>         perintah allowlist dengan persetujuan BOS
  /exit                  keluar
  <teks apa saja>        kirim pesan ke NEXUS`;

function parseParticipants(raw) {
  const allowed = ['gemini', 'groq', 'openrouter', 'openai'];
  if (!raw) return allowed;
  const selected = raw.split(',').map((item) => item.trim()).filter((item) => allowed.includes(item));
  return selected.length ? selected : allowed;
}

export async function main(argv = []) {
  const root = process.env.NEXUS_REPO_ROOT || process.cwd();
  const baseUrl = process.env.NEXUS_BASE_URL || 'http://127.0.0.1:3000';
  const adminToken = process.env.NEXUS_ADMIN_TOKEN || '';
  const client = createNexusClient({
    baseUrl,
    adminToken,
    participants: parseParticipants(process.env.NEXUS_PARTICIPANTS || ''),
  });
  const sessions = createSessionStore();
  const repo = createRepoContext(root);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const approve = async (description, detail) => {
    console.log(`\n[persetujuan] ${description}`);
    if (detail) console.log(redact(detail).slice(0, 4000));
    const answer = await rl.question('Setujui? [y/N] ');
    return /^y(es)?$/i.test(answer.trim());
  };
  const policy = createPolicyGateway(root, approve);
  let session = await sessions.create();

  const say = (text) => console.log(redact(String(text ?? '')));
  say('BOS Besar, RADAR NEXUS — terminal workspace. Default read-only. /help untuk perintah.');
  const status = await client.status();
  say(`Provider: ${status.provider_state} — ${status.provider_detail}`);
  say(`Sesi aktif: ${session.id}`);

  try {
    while (true) {
      let raw;
      try {
        raw = await rl.question('\nnexus> ');
      } catch {
        break;
      }
      const line = raw.trim();
      if (!line) continue;
      if (line === '/exit' || line === '/quit' || line === 'exit') break;
      if (line === '/help') { say(HELP); continue; }
      try {
        if (line === '/status') {
          say(JSON.stringify(await client.status(), null, 2));
          continue;
        }
        if (line === '/memory') {
          say(await client.memorySummary());
          continue;
        }
        if (line === '/handoff') {
          const handoffStatus = await client.status();
          say(compactHandoff({
            session, status: handoffStatus,
            decisions: ['NEXUS CLI dan dashboard memakai satu NEXUS Core; bukan dua backend/identitas AI.'],
            evidence: ['Rp0; tanpa paid provider/fallback; tanpa worker/scheduler/order/withdrawal.'],
            next: ['Verifikasi interaktif Termux oleh BOS belum dilakukan.'],
          }));
          continue;
        }
        if (line === '/sessions') {
          say((await sessions.list()).join('\n') || '(belum ada sesi)');
          continue;
        }
        if (line === '/new') {
          session = await sessions.create();
          say(`Sesi baru: ${session.id}`);
          continue;
        }
        if (line.startsWith('/resume ')) {
          session = await sessions.get(line.slice(8).trim());
          say(`Sesi dilanjutkan: ${session.id} (${session.messages.length} pesan)`);
          continue;
        }
        if (line === '/clear') {
          await sessions.clear(session.id);
          session = await sessions.create();
          say(`Sesi dibersihkan. Sesi baru: ${session.id}`);
          continue;
        }
        if (line === '/structure') {
          say(await repo.structure());
          continue;
        }
        if (line.startsWith('/files')) {
          const prefix = line.slice(6).trim();
          say((await repo.list(prefix)).join('\n'));
          continue;
        }
        if (line.startsWith('/read ')) {
          say(await repo.read(line.slice(6).trim()));
          continue;
        }
        if (line.startsWith('/search ')) {
          say((await repo.search(line.slice(8).trim())).join('\n') || '(tidak ada kecocokan)');
          continue;
        }
        if (line.startsWith('/edit ')) {
          const path = line.slice(6).trim();
          say('Masukkan isi file baru. Akhiri dengan baris berisi titik tunggal (.):');
          const chunks = [];
          while (true) {
            const part = await rl.question('');
            if (part === '.') break;
            chunks.push(part);
          }
          const result = await policy.requestEdit(path, chunks.join('\n') + '\n');
          say(result.applied ? `Perubahan diterapkan: ${path}` : `Perubahan dibatalkan: ${result.reason ?? 'tidak disetujui'}`);
          continue;
        }
        if (line.startsWith('/run ')) {
          const result = await policy.requestRun(line.slice(5).trim());
          if (result.output) say(result.output);
          say(`exit=${result.exitCode} approved=${result.approved}${result.reason ? ` reason=${result.reason}` : ''}`);
          continue;
        }

        await sessions.append(session.id, { role: 'bos', content: line, at: new Date().toISOString() });
        const reply = await client.chat(line);
        if (reply.kind === 'unavailable') {
          const note = `NEXUS tidak dapat merespons: ${reply.detail}`;
          say(note);
          await sessions.append(session.id, { role: 'system', content: note, at: new Date().toISOString() });
        } else {
          say(`Perintah diterima (${reply.command_id}). Menunggu hasil dari NEXUS Core…`);
          const answer = await client.result(reply.command_id);
          say(answer);
          await sessions.append(session.id, { role: 'nexus', content: answer, at: new Date().toISOString() });
        }
      } catch (error) {
        say(`error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    rl.close();
  }
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[nexus] ${redact(String(error))}`);
    process.exitCode = 1;
  });
}
