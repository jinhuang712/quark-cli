import { createInterface } from 'node:readline/promises';
import { callMaybeTask, isDir, need, splitPath } from '../ops.js';
import { listDir } from '../session.js';
import { QuarkError, usageError } from '../errors.js';

// Counts everything below a folder.
async function count(page, fid) {
  const kids = await listDir(page, fid);
  const folders = kids.filter(isDir);
  const subs = await Promise.all(folders.map((k) => count(page, k.fid)));
  return subs.reduce(
    (sum, s) => ({ folders: sum.folders + s.folders, files: sum.files + s.files }),
    { folders: folders.length, files: kids.length - folders.length },
  );
}

const describe = (path, node, inner) => {
  if (!isDir(node)) return `${path}（1 个文件）`;
  return `${path}（1 个文件夹，含 ${inner.folders} 个文件夹、${inner.files} 个文件）`;
};

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim() === 'y';
  } finally {
    rl.close();
  }
}

export default {
  name: 'rm',
  usage: 'rm [--yes] <path>...',
  summary: 'delete files or folders (to the recycle bin)',
  options: { yes: { type: 'boolean' } },
  async run({ page, args, flags, out }) {
    if (args.length === 0) throw usageError('usage: quark rm [--yes] <path>...');
    if (args.some((p) => splitPath(p).length === 0)) throw usageError('refusing to delete the root folder');
    if (!flags.yes && !process.stdin.isTTY) {
      throw usageError('no terminal to confirm on; add --yes to delete without asking');
    }
    const nodes = await Promise.all(args.map((p) => need(page, p)));
    const inner = await Promise.all(nodes.map((n) => (isDir(n) ? count(page, n.fid) : null)));
    const lines = args.map((p, i) => describe(p, nodes[i], inner[i]));
    if (!flags.yes && !(await confirm(`删除 ${lines.join('；')}？输入 y 确认: `))) {
      throw new QuarkError('cancelled; nothing deleted');
    }
    await callMaybeTask(page, 'POST', '/file/delete', {
      action_type: 2,
      filelist: nodes.map((n) => n.fid),
      exclude_fids: [],
    });
    const note = '已移入回收站，30 天内可在夸克客户端找回';
    out(`${lines.map((l) => `已删除 ${l}`).join('\n')}\n${note}`, {
      deleted: args.map((p, i) => ({ path: p, fid: nodes[i].fid, folder: isDir(nodes[i]) })),
      recycle_bin_days: 30,
    });
  },
};
