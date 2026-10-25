import { listDir, resolve } from '../session.js';
import { row } from '../format.js';

export default {
  name: 'ls',
  usage: 'ls [path]',
  summary: 'list a folder',
  async run({ page, args, out }) {
    const node = await resolve(page, args[0] ?? '/');
    const files = node.file_type === 0 || node.dir ? await listDir(page, node.fid) : [node];
    out(files.map((f) => row(f)).join('\n'), files);
  },
};
