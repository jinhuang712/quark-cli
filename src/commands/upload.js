import { readdir, stat } from 'node:fs/promises';
import { basename, join, posix, resolve as localResolve } from 'node:path';
import { listDir } from '../session.js';
import { ensureFolder, uploadFile } from '../transfer.js';
import { QuarkError, usageError } from '../errors.js';
import { size } from '../format.js';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// Splits positionals into local paths and the drive folder. The last argument is the drive
// folder when it starts with "/" or does not exist locally; `--to` removes the guessing.
async function split(args, to) {
  if (to !== undefined) return { locals: args, target: to };
  if (args.length >= 2) {
    const last = args.at(-1);
    if (last.startsWith('/') || !(await exists(last))) return { locals: args.slice(0, -1), target: last };
  }
  return { locals: args, target: '/' };
}

// Expands local paths into drive-relative file entries and the folders to create.
async function expand(local, rel, found) {
  const info = await stat(local);
  if (info.isFile()) {
    found.files.push({ local, dir: posix.dirname(rel), name: posix.basename(rel), size: info.size });
    return;
  }
  if (!info.isDirectory()) throw new QuarkError(`${local} is neither a file nor a folder`);
  found.dirs.push(rel);
  const entries = await readdir(local, { withFileTypes: true });
  const usable = entries.filter((e) => e.isFile() || e.isDirectory());
  await Promise.all(usable.map((e) => expand(join(local, e.name), posix.join(rel, e.name), found)));
}

export default {
  name: 'upload',
  usage: 'upload <local-path>... [drive-folder]',
  summary: 'upload files or folders',
  options: { to: { type: 'string' } },
  async run({ page, args, flags, out }) {
    const { locals, target } = await split(args, flags.to);
    if (locals.length === 0) throw usageError('expected: upload <local-path>... [drive-folder]');
    const base = `/${target.split('/').filter(Boolean).join('/')}`;
    const missing = (await Promise.all(locals.map(async (p) => ((await exists(p)) ? null : p)))).filter(Boolean);
    if (missing.length) throw new QuarkError(`local path not found: ${missing.join(', ')}`);

    const found = { files: [], dirs: [] };
    await Promise.all(locals.map((p) => expand(localResolve(p), basename(localResolve(p)), found)));
    found.files.sort((a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name));

    const folders = new Map();
    const dirOf = (rel) => (rel === '.' ? base : posix.join(base, rel));
    const results = [];
    const record = (file, state, extra = {}) => {
      const path = posix.join(dirOf(file.dir), file.name);
      results.push({ path, size: file.size, state, ...extra });
      const note = { ok: '', instant: ' (instant upload)', skipped: ' (skipped: already exists)', failed: ` (failed: ${extra.error})` }[state];
      if (!flags.json) console.log(`${path}\t${size(file.size)}${note}`);
    };

    await ensureFolder(page, base, folders);
    // Folder levels nest, so shortest paths go first.
    const dirs = [...new Set(found.dirs)].toSorted((a, b) => a.length - b.length);
    for (const rel of dirs) {
      // eslint-disable-next-line no-await-in-loop
      await ensureFolder(page, dirOf(rel), folders);
    }

    const byDir = Map.groupBy(found.files, (f) => f.dir);
    for (const [rel, files] of byDir) {
      // eslint-disable-next-line no-await-in-loop
      const fid = await ensureFolder(page, dirOf(rel), folders);
      // eslint-disable-next-line no-await-in-loop
      const present = new Set((await listDir(page, fid)).map((f) => f.file_name));
      const folderName = basename(dirOf(rel)) || 'root';
      for (const file of files) {
        if (present.has(file.name)) {
          record(file, 'skipped');
          continue;
        }
        process.stderr.write(`uploading ${file.name} (${size(file.size)})\n`);
        try {
          // The web app's upload queue is shared, so files go one at a time.
          // eslint-disable-next-line no-await-in-loop
          const { instant } = await uploadFile(page, { fid, folderName, local: file.local, name: file.name, size: file.size });
          record(file, instant ? 'instant' : 'ok');
        } catch (e) {
          record(file, 'failed', { error: e.message });
        }
      }
    }

    const count = (s) => results.filter((r) => r.state === s).length;
    const failed = count('failed');
    const summary = `ok ${count('ok') + count('instant')} (instant ${count('instant')}), skipped ${count('skipped')}, failed ${failed}`;
    if (flags.json) out(undefined, { files: results, ok: count('ok') + count('instant'), skipped: count('skipped'), failed });
    else console.log(summary);
    if (failed) throw new QuarkError(`${failed} file(s) failed to upload`);
  },
};
