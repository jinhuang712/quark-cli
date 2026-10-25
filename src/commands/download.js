import { mkdir, stat } from 'node:fs/promises';
import { join, resolve as localResolve } from 'node:path';
import { resolve } from '../session.js';
import { downloadFile } from '../transfer.js';
import { QuarkError, notFound, usageError } from '../errors.js';
import { size } from '../format.js';

async function statOrNull(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

export default {
  name: 'download',
  usage: 'download <drive-path> [local-dir]',
  summary: 'download one file',
  async run({ page, context, args, out }) {
    if (args.length < 1 || args.length > 2) throw usageError('expected: download <drive-path> [local-dir]');
    const [path, localDir = '.'] = args;
    let node;
    try {
      node = await resolve(page, path);
    } catch {
      throw notFound(`not found on the drive: ${path}`);
    }
    if (node.dir || node.file_type === 0) {
      throw new QuarkError(`${path} is a folder; downloading folders is not supported yet, download its files one by one`);
    }
    const dir = localResolve(localDir);
    const existing = await statOrNull(dir);
    if (existing && !existing.isDirectory()) throw new QuarkError(`${dir} exists and is not a directory`);
    const dest = join(dir, node.file_name);
    if (await statOrNull(dest)) throw new QuarkError(`${dest} already exists; remove it or pick another directory`);
    await mkdir(dir, { recursive: true });

    let lastTick = 0;
    const onProgress = (got, total) => {
      const now = Date.now();
      if (now - lastTick < 250 && got !== total) return;
      lastTick = now;
      const pct = total ? ` ${Math.floor((got / total) * 100)}%` : '';
      process.stderr.write(`\r${node.file_name}: ${size(got)}${total ? ` / ${size(total)}` : ''}${pct}   `);
    };
    await downloadFile(page, context, { fid: node.fid, dest, size: node.size, onProgress });
    process.stderr.write('\n');
    out(dest, { path: dest, drive_path: path, size: node.size });
  },
};
