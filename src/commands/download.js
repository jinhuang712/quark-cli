import { stat } from 'node:fs/promises';
import { join, resolve as localResolve } from 'node:path';
import { resolve } from '../session.js';
import { normalize, isDir } from '../browse.js';
import { downloadFile } from '../transfer.js';
import { fail } from '../errors.js';
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
  usage: 'download <drive-path> <local-dir>',
  summary: '把一个网盘文件下载到已有的本地目录，文件名不变',
  group: 'transfer',
  args: [
    ['<drive-path>', '网盘文件路径；文件夹暂不支持'],
    ['<local-dir>', '已存在的本地目录，不会自动新建'],
  ],
  examples: ['quark download /WORK/report.pdf ./downloads', 'quark download /WORK/report.pdf . --raw'],
  effect: { changes: false, undo: '删掉下载下来的本地文件即可' },
  errors: ['not_found', 'local_not_found', 'already_exists', 'no_space', 'network'],
  related: ['ls', 'info', 'upload'],
  async run({ page, context, args, emit, progress }) {
    if (args.length !== 2) {
      throw fail('usage', '需要两个参数：网盘路径和本地目录', { next: '用法：quark download <网盘路径> <本地目录>' });
    }
    const path = normalize(args[0]);
    const dir = localResolve(args[1]);
    const node = await resolve(page, path);
    if (isDir(node)) {
      throw fail('error', `${path} 是文件夹，暂不支持下载文件夹`, { next: `用 quark ls ${path} 列出里面的文件，逐个下载` });
    }
    const dirStat = await statOrNull(dir);
    if (!dirStat) {
      throw fail('local_not_found', `本地没有目录 ${dir}`, { next: `先建好目录，或换一个已有的目录` });
    }
    if (!dirStat.isDirectory()) {
      throw fail('not_a_folder', `${dir} 是文件，不是目录`, { next: '换一个已有的本地目录' });
    }
    const dest = join(dir, node.file_name);
    if (await statOrNull(dest)) {
      throw fail('already_exists', `本地已有 ${dest}`, { next: '先删掉或改名本地的同名文件，或者换一个目录' });
    }

    let step = -1;
    const onProgress = (got, total) => {
      const pct = total ? Math.floor((got / total) * 10) * 10 : 0;
      if (total && pct === step) return;
      step = pct;
      progress(`${node.file_name}: ${size(got)}${total ? ` / ${size(total)} ${Math.floor((got / total) * 100)}%` : ''}`);
    };
    await downloadFile(page, context, { fid: node.fid, dest, size: node.size, onProgress });
    emit({ data: { path: dest, size: node.size }, lines: [dest], full: { ...node, path: dest } });
  },
};
