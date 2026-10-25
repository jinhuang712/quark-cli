import { ensureDir, normalize } from '../ops.js';
import { usageError } from '../errors.js';

export default {
  name: 'mkdir',
  usage: 'mkdir <path>',
  summary: '新建文件夹，上级不存在时一并建出',
  group: 'organize',
  args: [['<path>', '要新建的网盘文件夹路径']],
  examples: ['quark mkdir /备份/2026'],
  effect: { changes: true, undo: '用 quark rm 删掉' },
  errors: ['already_exists', 'usage'],
  related: ['ls', 'upload', 'mv'],
  async run({ page, args, emit }) {
    if (args.length !== 1) throw usageError('mkdir 需要一个路径参数', '运行 quark mkdir --help 看用法');
    const path = normalize(args[0]);
    if (path === '/') throw usageError('根目录已经存在，不用新建', '给一个根目录以外的路径');
    const { node, created } = await ensureDir(page, path);
    emit({
      data: { path, type: 'dir', changed: created },
      lines: [path],
      full: { path, changed: created, fid: node.fid },
    });
  },
};
