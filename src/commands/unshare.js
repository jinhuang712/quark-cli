import { usageError, notFound } from '../errors.js';
import { call } from '../session.js';
import { listShares, pwdId } from '../shares.js';

export default {
  name: 'unshare',
  usage: 'unshare <link>',
  summary: 'cancel one of my share links',
  async run({ page, args, out }) {
    if (args.length !== 1) throw usageError('usage: quark unshare <link>');
    const id = pwdId(args[0]);
    if (!id) throw usageError(`not a Quark share link: ${args[0]}`);

    const mine = (await listShares(page)).find((s) => s.pwd_id === id);
    if (!mine) throw notFound('not one of your active shares (not created by you, or already cancelled/expired)');
    await call(page, 'POST', '/share/delete', { body: { share_ids: [mine.share_id] } });
    out(`cancelled ${args[0]}`, { cancelled: true, link: args[0], name: mine.title });
  },
};
