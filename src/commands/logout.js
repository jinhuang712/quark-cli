import { rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export default {
  name: 'logout',
  usage: 'logout',
  summary: '退出登录，清掉本机保存的登录态',
  group: 'account',
  auth: false,
  args: [],
  examples: ['quark logout'],
  effect: { changes: false, undo: '重新运行 quark login 扫码', login: false },
  errors: [],
  related: ['login', 'whoami'],
  async run({ emit }) {
    const profile = process.env.QUARK_PROFILE || join(homedir(), '.quark-cli', 'profile');
    rmSync(profile, { recursive: true, force: true });
    emit({ data: { logged_out: true }, lines: [] });
  },
};
