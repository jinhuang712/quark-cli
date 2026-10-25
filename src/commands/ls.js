import { listDir } from '../session.js';
import { row } from '../format.js';
import { byDisplayOrder, entry, isDir, normalize, resolveOrFail } from '../browse.js';

export default {
  name: 'ls',
  usage: 'ls [path]',
  summary: 'list a folder',
  async run({ page, args, out }) {
    const path = normalize(args[0] ?? '/');
    const node = await resolveOrFail(page, path);
    const folder = isDir(node);
    const files = folder ? (await listDir(page, node.fid)).toSorted(byDisplayOrder) : [node];
    const pathOf = (f) => (folder ? `${path === '/' ? '' : path}/${f.file_name}` : path);
    out(
      files.map((f) => row(f)).join('\n'),
      files.map((f) => entry(f, pathOf(f))),
    );
  },
};
