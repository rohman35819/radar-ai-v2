/** Bounded, read-only repository context for NEXUS CLI. */
import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const IGNORED = new Set(['.git', 'node_modules', '__pycache__', 'output', 'dist', '.cache']);
const SECRET_FILES = /\.env($|\.)|credentials|secret|private[_-]?key/i;
const MAX_FILES = 500;
const MAX_BYTES = 64 * 1024;

export function createRepoContext(rootPath) {
  const root = resolve(rootPath);

  function safePath(input) {
    const target = isAbsolute(input) ? resolve(input) : resolve(root, input);
    if (target !== root && !target.startsWith(root + sep)) throw new Error('Path di luar repository ditolak');
    return target;
  }

  async function walk(dir, depth, out) {
    if (depth > 6 || out.length >= MAX_FILES) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED.has(entry.name) || SECRET_FILES.test(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1, out);
      else if (entry.isFile() && out.length < MAX_FILES) out.push(relative(root, full));
    }
  }

  async function list(prefix = '') {
    const files = [];
    await walk(root, 0, files);
    const needle = prefix.trim();
    return files.filter((item) => !needle || item.startsWith(needle)).sort().slice(0, MAX_FILES);
  }

  async function read(path) {
    const target = safePath(path);
    if (SECRET_FILES.test(target)) throw new Error('File menyerupai secret tidak boleh dibaca');
    const info = await stat(target);
    if (!info.isFile() || info.size > MAX_BYTES) throw new Error('File tidak ada atau terlalu besar');
    return readFile(target, 'utf8');
  }

  async function search(query) {
    const text = query.trim().toLowerCase();
    if (text.length < 2) throw new Error('Query minimal 2 karakter');
    const matches = [];
    for (const file of await list()) {
      let content;
      try { content = await read(file); } catch { continue; }
      content.split('\n').forEach((line, index) => {
        if (matches.length < 50 && line.toLowerCase().includes(text)) {
          matches.push(`${file}:${index + 1}: ${line.trim().slice(0, 160)}`);
        }
      });
    }
    return matches;
  }

  async function structure() {
    const files = await list();
    return [...new Set(files.map((item) => item.split('/')[0] ?? ''))].sort().join('\n');
  }

  return { root, list, read, search, structure };
}
