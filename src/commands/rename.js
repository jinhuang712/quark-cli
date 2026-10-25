import { need, parentOf } from '../ops.js';
import { call, listDir } from '../session.js';
import { QuarkError, usageError } from '../errors.js';

export default {
  name: 'rename',
  usage: 'rename <path> <new-name>',
  summary: 'rename a file or folder in place',
  async run({ page, args, out }) {
    if (args.length !== 2) throw usageError('usage: quark rename <path> <new-name>');
    const [path, name] = args;
    if (name.includes('/')) throw usageError('the new name cannot contain "/"; use mv to change folders');
    const { parent } = parentOf(path);
    const [node, dir] = await Promise.all([need(page, path), need(page, parent)]);
    const clash = (await listDir(page, dir.fid)).some((f) => f.file_name === name);
    if (clash) throw new QuarkError(`${parent} already has an item named ${name}; nothing renamed`);
    await call(page, 'POST', '/file/rename', { body: { fid: node.fid, file_name: name } });
    const to = `${parent === '/' ? '' : parent}/${name}`;
    out(`renamed ${path} -> ${to}`, { from: path, to, fid: node.fid });
  },
};
