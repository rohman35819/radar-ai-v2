/** Capability gateway: read-only by default, explicit approval for edits/commands. */
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { redact } from './session.mjs';

const MAX_EDIT_BYTES = 40 * 1024;
const MAX_OUTPUT = 8000;
const SECRET_FILE = /\.env($|\.)|credentials|secret|private[_-]?key/i;

const COMMANDS = {
  'npm test': { executable: 'npm', args: ['test'] },
  'npm run typecheck': { executable: 'npm', args: ['run', 'typecheck'] },
  'python3 -m unittest': { executable: 'python3', args: ['-m', 'unittest', 'discover', '-s', 'research/python', '-p', 'test_*.py'] },
  'git status': { executable: 'git', args: ['status', '--short'] },
  'git diff': { executable: 'git', args: ['diff', '--stat'] },
  'git log -1': { executable: 'git', args: ['log', '-1', '--oneline'] },
};

export function createPolicyGateway(rootPath, approve) {
  const root = resolve(rootPath);
  const events = [];

  function record(action, target, outcome) {
    events.push({ at: new Date().toISOString(), action, target: redact(target).slice(0, 160), outcome });
    if (events.length > 100) events.shift();
  }

  function safeTarget(path) {
    const target = isAbsolute(path) ? resolve(path) : resolve(root, path);
    if (target !== root && !target.startsWith(root + sep)) throw new Error('Path di luar repository ditolak');
    if (SECRET_FILE.test(target)) throw new Error('File menyerupai secret tidak boleh diubah');
    return target;
  }

  function diffLines(before, after) {
    const oldLines = before.split('\n');
    const newLines = after.split('\n');
    const rows = [];
    const count = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < count && rows.length < 80; i += 1) {
      if (oldLines[i] !== newLines[i]) {
        if (oldLines[i] !== undefined) rows.push(`-${oldLines[i].slice(0, 200)}`);
        if (newLines[i] !== undefined) rows.push(`+${newLines[i].slice(0, 200)}`);
      }
    }
    return rows.join('\n') || '(tanpa perubahan baris)';
  }

  async function requestEdit(path, newContent) {
    const target = safeTarget(path);
    if (Buffer.byteLength(newContent, 'utf8') > MAX_EDIT_BYTES) {
      record('edit', target, 'denied');
      return { approved: false, applied: false, diff: '', reason: 'Perubahan melebihi 40 KiB' };
    }
    let before = '';
    try { before = await readFile(target, 'utf8'); } catch { before = ''; }
    const diff = diffLines(before, newContent);
    const allowed = approve ? await approve(`Edit file ${path}`, diff) : false;
    if (!allowed) {
      record('edit', target, 'denied');
      return { approved: false, applied: false, diff, reason: 'BOS tidak menyetujui perubahan' };
    }
    await writeFile(target, newContent, 'utf8');
    record('edit', target, 'success');
    return { approved: true, applied: true, diff };
  }

  async function requestRun(command) {
    const key = command.trim();
    const spec = COMMANDS[key];
    if (!spec || /[;|&<>`$]/.test(key)) {
      record('run', key, 'denied');
      return { approved: false, command: key, exitCode: null, output: '', reason: 'Perintah tidak dalam allowlist' };
    }
    const allowed = approve ? await approve(`Jalankan ${key}`, 'Perintah dibatasi allowlist NEXUS') : false;
    if (!allowed) {
      record('run', key, 'denied');
      return { approved: false, command: key, exitCode: null, output: '', reason: 'BOS tidak menyetujui eksekusi' };
    }
    const result = await new Promise((done) => {
      execFile(spec.executable, [...spec.args], {
        cwd: root, timeout: 60_000, maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        done({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, text: `${stdout}${stderr}` });
      });
    });
    record('run', key, result.code === 0 ? 'success' : 'failure');
    return {
      approved: true,
      command: key,
      exitCode: result.code,
      output: redact(result.text).slice(-MAX_OUTPUT),
    };
  }

  return { audit: () => [...events], requestEdit, requestRun };
}
