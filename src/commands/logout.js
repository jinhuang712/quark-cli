import { rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export default {
  name: 'logout',
  usage: 'logout',
  summary: 'forget the saved login on this machine',
  auth: false,
  async run({ out }) {
    const profile = process.env.QUARK_PROFILE || join(homedir(), '.quark-cli', 'profile');
    rmSync(profile, { recursive: true, force: true });
    out('已退出登录', { loggedOut: true });
  },
};
