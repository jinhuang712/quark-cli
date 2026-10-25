import { ensureDir } from '../ops.js';
import { usageError } from '../errors.js';

export default {
  name: 'mkdir',
  usage: 'mkdir <path>',
  summary: 'create a folder, with missing parents',
  async run({ page, args, out }) {
    if (args.length !== 1) throw usageError('usage: quark mkdir <path>');
    const { node, created } = await ensureDir(page, args[0]);
    out(created ? `created ${args[0]}` : `exists ${args[0]}`, { path: args[0], fid: node.fid, created });
  },
};
