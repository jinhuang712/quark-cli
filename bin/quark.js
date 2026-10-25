#!/usr/bin/env node
import { open, isLoggedIn, listDir, resolve, call } from '../src/session.js';

const [cmd, ...args] = process.argv.slice(2);
const size = (n) => (n < 1024 ? `${n}B` : n < 1048576 ? `${(n / 1024).toFixed(1)}K` : n < 1073741824 ? `${(n / 1048576).toFixed(1)}M` : `${(n / 1073741824).toFixed(2)}G`);
const row = (f) => `${f.dir ? 'd' : '-'} ${f.dir ? '-' : size(f.size)}\t${new Date(f.l_updated_at).toISOString().slice(0, 16).replace('T', ' ')}\t${f.file_name}${f.dir ? '/' : ''}`;

const commands = {
  async login() {
    const { context, page } = await open({ headed: true });
    console.error('Scan the QR code in the browser window; waiting for login...');
    while (!(await isLoggedIn(page))) await page.waitForTimeout(2000);
    console.error('Logged in.');
    await context.close();
  },
  async ls([path = '/']) {
    const { context, page } = await session();
    const dir = await resolve(page, path);
    for (const f of await listDir(page, dir.fid)) console.log(row(f));
    await context.close();
  },
  async search([q]) {
    if (!q) usage();
    const { context, page } = await session();
    const r = await call(page, 'GET', '/file/search', {
      query: { q, _page: 1, _size: 50, _fetch_total: 1, _sort: 'file_type:desc,updated_at:desc' },
    });
    for (const f of r.data.list) console.log(row(f));
    await context.close();
  },
};

async function session() {
  const s = await open();
  if (!(await isLoggedIn(s.page))) {
    await s.context.close();
    throw new Error('not logged in; run `quark login`');
  }
  return s;
}

function usage() {
  console.error(`usage: quark <command>\n  login\n  ls [path]\n  search <keyword>`);
  process.exit(2);
}

if (!commands[cmd]) usage();
commands[cmd](args).catch((e) => {
  console.error(`quark: ${e.message}`);
  process.exit(1);
});
