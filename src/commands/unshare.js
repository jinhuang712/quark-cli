import { fail, usageError } from '../errors.js';
import { call } from '../session.js';
import { listShares, pwdId, raw, ok, tokenError } from '../shares.js';

export default {
  name: 'unshare',
  usage: 'unshare <link>',
  summary: '取消我创建的一条分享，文件本身不受影响',
  group: 'share',
  args: [['<link>', '分享链接，形如 https://pan.quark.cn/s/xxxx']],
  examples: ['quark unshare https://pan.quark.cn/s/abcdef123456'],
  effect: { changes: true, undo: '不能恢复原链接，可以重新 quark share 创建新的' },
  errors: ['share_gone', 'not_found'],
  related: ['shares', 'share'],
  async run({ page, args, emit }) {
    if (args.length !== 1) throw usageError('unshare 需要恰好一个分享链接', '用法: quark unshare <链接>');
    const link = args[0];
    const id = pwdId(link);
    if (!id) throw usageError(`不是夸克分享链接: ${link}`, '链接形如 https://pan.quark.cn/s/xxxx');

    const shares = await listShares(page);
    const mine = shares.find((s) => s.pwd_id === id);
    if (!mine) {
      // Distinguish a dead link from someone else's live link.
      const tok = await raw(page, 'POST', '/share/sharepage/token', { body: { pwd_id: id, passcode: '' } });
      if (!ok(tok)) {
        const err = tokenError(tok, link);
        if (err.code === 'share_gone') throw fail('share_gone', `分享链接已取消或已过期: ${link}`, { next: '用 quark shares 看现在有效的分享', detail: err.detail });
      }
      throw fail('not_found', `这条分享不是你创建的: ${link}`, { next: '用 quark shares 看你创建的分享' });
    }
    await call(page, 'POST', '/share/delete', { body: { share_ids: [mine.share_id] } });
    emit({ data: { link, changed: true }, lines: [link], full: { link, changed: true, ...mine } });
  },
};
