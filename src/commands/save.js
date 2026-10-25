import { call, listDir, resolve } from '../session.js';
import { size } from '../format.js';
import { QuarkError, usageError, notFound } from '../errors.js';
import { pwdId, raw, ok, rejection, tokenError, waitTask } from '../shares.js';

const DEFAULT_DIR = '/来自：分享';

async function shareItems(page, id, stoken) {
  const out = [];
  for (let p = 1; ; p++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await raw(page, 'GET', '/share/sharepage/detail', {
      query: { pwd_id: id, stoken, pdir_fid: '0', force: 0, _page: p, _size: 100, _fetch_total: 1, _sort: 'file_type:asc,updated_at:desc' },
    });
    if (!ok(r)) throw tokenError(r);
    out.push(...r.data.list);
    if (out.length >= (r.metadata?._total ?? 0) || r.data.list.length === 0) return out;
  }
}

async function targetDir(page, path) {
  try {
    return await resolve(page, path);
  } catch (e) {
    if (path !== DEFAULT_DIR) throw notFound(e.message);
    const made = await call(page, 'POST', '/file', {
      body: { pdir_fid: '0', file_name: DEFAULT_DIR.slice(1), dir_path: '', dir_init_lock: false },
    });
    return { fid: made.data.fid, file_name: DEFAULT_DIR.slice(1), dir: true };
  }
}

async function capacityError(page, needed) {
  const m = await raw(page, 'GET', '/member', { query: { fetch_subscribe: 'true', _ch: 'home' } }).catch(() => null);
  const free = m && ok(m) && m.data.total_capacity ? m.data.total_capacity - m.data.use_capacity : null;
  const lack = free === null ? '' : `: need ${size(needed)}, ${size(Math.max(free, 0))} free, short by ${size(Math.max(needed - free, 0))}`;
  return new QuarkError(`not enough drive capacity${lack}`);
}

export default {
  name: 'save',
  usage: 'save <link> [dir] [--code <code>]',
  summary: "save someone's share into my drive (default dir /来自：分享)",
  options: { code: { type: 'string' } },
  async run({ page, args, flags, out }) {
    if (args.length < 1 || args.length > 2) throw usageError('usage: quark save <link> [dir] [--code <code>]');
    const id = pwdId(args[0]);
    if (!id) throw usageError(`not a Quark share link: ${args[0]}`);

    const tok = await raw(page, 'POST', '/share/sharepage/token', { body: { pwd_id: id, passcode: flags.code ?? '' } });
    if (!ok(tok)) throw tokenError(tok);
    const stoken = tok.data.stoken;

    const [items, dir] = await Promise.all([shareItems(page, id, stoken), targetDir(page, args[1] ?? DEFAULT_DIR)]);
    const existing = new Set((await listDir(page, dir.fid)).map((f) => f.file_name));
    const skipped = items.filter((i) => existing.has(i.file_name));
    const todo = items.filter((i) => !existing.has(i.file_name));
    for (const s of skipped) console.error(`skipped (same name exists): ${s.file_name}`);
    if (todo.length === 0) throw new QuarkError(skipped.length ? 'nothing saved: every item already exists in the target' : 'the share is empty');

    const res = await raw(page, 'POST', '/share/sharepage/save', {
      body: {
        fid_list: todo.map((i) => i.fid),
        fid_token_list: todo.map((i) => i.share_fid_token),
        to_pdir_fid: dir.fid,
        pwd_id: id,
        stoken,
        pdir_fid: '0',
        scene: 'link',
      },
    });
    if (!ok(res)) {
      if (/容量|capacity/i.test(res.message ?? '') || res.code === 32003) {
        throw await capacityError(page, todo.reduce((n, i) => n + (i.size ?? 0), 0));
      }
      throw rejection('share/sharepage/save', res);
    }
    await waitTask(page, res.data.task_id);

    const saved = todo.map((i) => i.file_name);
    const human = [`saved ${saved.length} item(s) to ${args[1] ?? DEFAULT_DIR}`, ...saved.map((n) => `  ${n}`)];
    if (skipped.length) human.push(`skipped ${skipped.length} with the same name`);
    out(human.join('\n'), { saved, skipped: skipped.map((i) => i.file_name), dir: args[1] ?? DEFAULT_DIR });
  },
};
