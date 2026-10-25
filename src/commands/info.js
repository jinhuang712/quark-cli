import { call, listDir } from '../session.js';
import { size, time } from '../format.js';
import { usageError } from '../errors.js';
import { entry, isDir, normalize, resolveOrFail } from '../browse.js';

export default {
  name: 'info',
  usage: 'info <path>',
  summary: 'show details of a file or folder',
  async run({ page, args, out }) {
    if (!args[0]) throw usageError('missing path\nusage: quark info <path>');
    const path = normalize(args[0]);
    const node = await resolveOrFail(page, path);
    const root = path === '/';
    const detail = root ? node : (await call(page, 'GET', '/file/info', { query: { fid: node.fid } })).data;
    const folder = isDir(detail);
    const items = folder && root ? (await listDir(page, '0')).length : detail.include_items;
    const file = { ...detail, include_items: items };
    const stamp = (ms) => (ms ? time(ms) : '-');
    const lines = [
      ['名字', root ? '/' : detail.file_name],
      ['路径', path],
      ['类型', folder ? '文件夹' : '文件'],
      [folder ? '项数' : '大小', folder ? `${items ?? 0} 项` : `${size(detail.size)} (${detail.size} 字节)`],
      ['创建时间', stamp(detail.l_created_at)],
      ['修改时间', stamp(detail.l_updated_at)],
      ['ID', detail.fid],
    ];
    out(lines.map(([k, v]) => `${k.padEnd(5, '　')}${v}`).join('\n'), entry(file, path));
  },
};
