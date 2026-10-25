import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROFILE = process.env.QUARK_PROFILE || join(homedir(), '.quark-cli', 'profile');
const HOME = 'https://pan.quark.cn/list';
const API = 'https://drive-pc.quark.cn/1/clouddrive';

export async function open({ headed = false } = {}) {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: !headed,
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(HOME, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

// Runs a JSON request from inside the logged-in page so cookies and CORS behave like the web app.
export async function call(page, method, path, { query = {}, body } = {}) {
  const qs = new URLSearchParams({ pr: 'ucpro', fr: 'pc', ...query });
  const res = await page.evaluate(
    async ({ url, verb, payload }) => {
      const init = { method: verb, credentials: 'include' };
      if (payload) Object.assign(init, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const r = await fetch(url, init);
      return r.json();
    },
    { url: `${API}${path}?${qs}`, verb: method, payload: body },
  );
  if (res.status !== 200 || res.code !== 0) {
    throw new Error(`${path}: ${res.message || JSON.stringify(res)}`);
  }
  return res;
}

export async function isLoggedIn(page) {
  try {
    await call(page, 'GET', '/file/sort', { query: { pdir_fid: '0', _page: 1, _size: 1 } });
    return true;
  } catch {
    return false;
  }
}

export async function listDir(page, fid) {
  const out = [];
  for (let p = 1; ; p++) {
    const r = await call(page, 'GET', '/file/sort', {
      query: { pdir_fid: fid, _page: p, _size: 100, _fetch_total: 1, _sort: 'file_type:asc,updated_at:desc' },
    });
    out.push(...r.data.list);
    if (out.length >= (r.metadata?._total ?? 0) || r.data.list.length === 0) return out;
  }
}

// Resolves "/WORK/简历" to the fid of that folder (or file when `last` is a file).
export async function resolve(page, path) {
  let fid = '0';
  let node = { fid, file_name: '/', dir: true };
  for (const part of path.split('/').filter(Boolean)) {
    const hit = (await listDir(page, fid)).find((f) => f.file_name === part);
    if (!hit) throw new Error(`not found: ${path}`);
    fid = hit.fid;
    node = hit;
  }
  return node;
}
