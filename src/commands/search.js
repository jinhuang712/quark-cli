import { call } from '../session.js';
import { row } from '../format.js';
import { usageError } from '../errors.js';
import { byDisplayOrder, entry, fullPaths } from '../browse.js';

const LIMIT = 50;

export default {
  name: 'search',
  usage: 'search <keyword>',
  summary: 'find files and folders by name',
  async run({ page, args, flags, out }) {
    const keyword = args.join(' ').trim();
    if (!keyword) throw usageError('missing keyword\nusage: quark search <keyword>');
    const res = await call(page, 'GET', '/file/search', {
      query: { q: keyword, _page: 1, _size: LIMIT, _fetch_total: 1, _sort: 'file_type:asc,updated_at:desc' },
    });
    const files = res.data.list.slice(0, LIMIT).toSorted(byDisplayOrder);
    const total = res.metadata?._total ?? files.length;
    if (!files.length) return out('没有找到', []);

    const paths = await fullPaths(page, files);
    const hint = total > files.length ? `共 ${total} 条结果，只列出前 ${files.length} 条；请换更具体的关键词` : null;
    const lines = files.map((f) => `${row(f)}\t${paths.get(f.fid)}`);
    if (hint && flags.json) console.error(hint);
    return out([...lines, ...(hint ? [hint] : [])].join('\n'), files.map((f) => entry(f, paths.get(f.fid))));
  },
};
