import { callMaybeTask, find, isDir, need, parentOf } from '../ops.js';
import { listDir } from '../session.js';
import { QuarkError, notFound, usageError } from '../errors.js';

export default {
  name: 'mv',
  usage: 'mv <src> <dest-folder>',
  summary: 'move a file or folder into another folder',
  async run({ page, args, out }) {
    if (args.length !== 2) throw usageError('usage: quark mv <src> <dest-folder>');
    const [src, dest] = args;
    const { name } = parentOf(src);
    const [node, target] = await Promise.all([need(page, src), find(page, dest)]);
    if (!target) throw notFound(`destination folder not found: ${dest}`);
    if (!isDir(target)) throw new QuarkError(`destination is not a folder: ${dest}`);
    const clash = (await listDir(page, target.fid)).some((f) => f.file_name === node.file_name);
    if (clash) throw new QuarkError(`${dest} already has an item named ${name}; nothing moved`);
    await callMaybeTask(page, 'POST', '/file/move', {
      action_type: 1,
      to_pdir_fid: target.fid,
      filelist: [node.fid],
      exclude_fids: [],
    });
    const to = `${dest.replace(/\/+$/, '')}/${name}`;
    out(`moved ${src} -> ${to}`, { from: src, to, fid: node.fid });
  },
};
