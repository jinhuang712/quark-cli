// Help text, generated from each command module's metadata. FEATURES.md → F19.
//
// A command module exports, besides name, summary, usage and run():
//   group    'account' | 'browse' | 'organize' | 'transfer' | 'share'
//   args     [[name, description], ...]
//   flags    [[flag, description], ...]  command-specific options, defaults included
//   examples ['quark ...', ...]
//   effect   { changes: boolean, undo: string, login: boolean }   (login defaults to true)
//   errors   ['not_found', ...]  error codes the command can return
//   related  ['mkdir', ...]

import { CODES, EXIT } from './errors.js';

const GROUPS = [
  ['account', '账号'],
  ['browse', '浏览'],
  ['organize', '整理'],
  ['transfer', '传输'],
  ['share', '分享'],
];

const OUTPUT = `输出（所有命令通用，结果写到 stdout，进度和提示写到 stderr）:
  默认        YAML，只有精简字段
  --json      JSON，内容和 YAML 一致
  --markdown  表格或 键: 值 列表
  --raw       只输出值，每行一个，用来接管道
  --full      和上面任一种合用，输出夸克接口返回的全部字段
  --json、--markdown、--raw 只能选一个`;

const EXITS = `退出码:
  0 成功   1 其他错误   2 用法不对   3 需要登录   4 找不到   5 夸克拒绝了请求
失败时 stderr 输出 error、code、exit、next 四个字段，next 是下一步该做什么。`;

const WORKFLOW = `典型流程:
  quark login                                    # 用户扫码，只需一次
  quark ls /                                     # 看网盘里有什么
  quark mkdir /备份/2026
  quark upload ./report.pdf /备份/2026
  quark share /备份/2026/report.pdf --days 7`;

const PRINCIPLE = `每个命令只做一件事：不自动建目录，不自动跳过、覆盖或合并同名项，不弹出提问。
需要几步就用几条命令，用 --raw 串起来: quark search 简历 --raw | xargs quark rm --yes`;

const mark = (cmd) => (cmd.effect?.changes ? '*' : ' ');

export function topHelp(all) {
  const width = Math.max(...Object.values(all).map((c) => c.usage.length)) + 2;
  const byGroup = GROUPS.map(([key, title]) => {
    const rows = Object.values(all)
      .filter((c) => c.group === key)
      .map((c) => `  ${mark(c)} ${c.usage.padEnd(width)}${c.summary}`);
    return `${title}:\n${rows.join('\n')}`;
  });
  return [
    'quark: 夸克网盘命令行。给 agent 用，人只需要扫码登录和批准有风险的操作。',
    '',
    '用法: quark <命令> [参数] [选项]',
    '      quark <命令> --help 看某个命令的详细用法',
    '',
    PRINCIPLE,
    '',
    WORKFLOW,
    '',
    `命令（带 * 的会改动网盘）:\n${byGroup.join('\n\n')}`,
    '',
    OUTPUT,
    '',
    EXITS,
    '',
    '登录态保存在 ~/.quark-cli/profile，环境变量 QUARK_PROFILE 可以换位置。登录态等于账号密码，不要外传。',
  ].join('\n');
}

export function commandHelp(cmd) {
  const e = cmd.effect ?? {};
  const lines = [`quark ${cmd.usage}`, '', cmd.summary, ''];
  if (cmd.args?.length) lines.push('参数:', ...cmd.args.map(([n, d]) => `  ${n.padEnd(16)}${d}`), '');
  if (cmd.flags?.length) lines.push('选项:', ...cmd.flags.map(([n, d]) => `  ${n.padEnd(16)}${d}`), '');
  if (cmd.examples?.length) lines.push('例子:', ...cmd.examples.map((x) => `  ${x}`), '');
  lines.push(
    `改动网盘: ${e.changes ? '是' : '否'}`,
    `能否撤销: ${e.undo ?? (e.changes ? '否' : '不涉及')}`,
    `需要登录: ${e.login === false ? '否' : '是'}`,
    '',
  );
  const codes = [...new Set([...(cmd.errors ?? []), 'usage', ...(e.login === false ? [] : ['not_logged_in'])])];
  lines.push('可能的错误:', ...codes.map((c) => `  ${c} (退出码 ${CODES[c] ?? EXIT.error})`));
  if (cmd.related?.length) lines.push('', `相关命令: ${cmd.related.map((r) => `quark ${r}`).join('、')}`);
  lines.push('', '输出选项见 quark --help（--json --markdown --raw --full）。');
  return lines.join('\n');
}

// Nearest command name by edit distance, for typos.
export function nearest(name, names) {
  const dist = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[a.length][b.length];
  };
  const best = names.map((n) => [n, dist(name, n)]).toSorted((x, y) => x[1] - y[1])[0];
  return best && best[1] <= 3 ? best[0] : undefined;
}
