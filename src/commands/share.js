import { resolve } from '../session.js';
import { usageError, notFound } from '../errors.js';
import { EXPIRED_TYPE, makeCode, raw, ok, rejection, waitTask } from '../shares.js';

export default {
  name: 'share',
  usage: 'share <path>... [--days 1|7|30|0] [--code]',
  summary: 'create a share link (default 7 days; --days 0 = permanent)',
  options: { days: { type: 'string', default: '7' }, code: { type: 'boolean' } },
  async run({ page, args, flags, out }) {
    if (args.length === 0) throw usageError('usage: quark share <path>... [--days 1|7|30|0] [--code]');
    const expired = EXPIRED_TYPE[flags.days];
    if (!expired) throw usageError(`--days must be one of 1, 7, 30, 0 (got ${flags.days})`);

    const nodes = await Promise.all(
      args.map((p) =>
        resolve(page, p).catch((e) => {
          throw notFound(e.message);
        }),
      ),
    );
    const passcode = flags.code ? makeCode() : undefined;
    const body = {
      fid_list: nodes.map((n) => n.fid),
      title: nodes[0].file_name,
      url_type: passcode ? 2 : 1,
      expired_type: expired,
      ...(passcode && { passcode }),
    };
    const created = await raw(page, 'POST', '/share', { body });
    if (!ok(created)) throw rejection('share', created);
    const task = await waitTask(page, created.data.task_id);

    const info = await raw(page, 'POST', '/share/password', { body: { share_id: task.share_id } });
    if (!ok(info)) throw rejection('share/password', info);
    const { share_url: link, passcode: code } = info.data;
    const result = { link, code: code ?? null, days: Number(flags.days), share_id: task.share_id, files: nodes.map((n) => n.file_name) };
    out(code ? `${link}\n提取码: ${code}` : link, result);
  },
};
