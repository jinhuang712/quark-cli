import { chromium } from 'playwright-core';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { QuarkError, notFound, refused } from './errors.js';

const PROFILE = process.env.QUARK_PROFILE || join(homedir(), '.quark-cli', 'profile');
// Chrome in a non-standard location.
const CHROME_PATH = process.env.QUARK_CHROME_PATH;
const HOME = 'https://pan.quark.cn/list';
const API = 'https://drive-pc.quark.cn/1/clouddrive';

export async function open({ headed = false } = {}) {
  const context = await chromium.launchPersistentContext(PROFILE, {
    ...(CHROME_PATH ? { executablePath: CHROME_PATH } : { channel: 'chrome' }),
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
    const message = `${path}: ${res.message || JSON.stringify(res)}`;
    // Quark's own refusals (restricted account, risk control) get their own exit code.
    throw Object.assign(/限制|风控|违规|封禁/.test(res.message ?? '') ? refused(message) : new QuarkError(message), {
      apiCode: res.code,
    });
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
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { fid: '0', file_name: '/', dir: true };
  // path_list answers for folders only, in one request however deep the path is.
  const folderAt = async (ps) =>
    (await call(page, 'POST', '/file/info/path_list', { body: { file_path: [`/${ps.join('/')}`], namespace: '0' } })).data[0];
  const folder = await folderAt(parts);
  if (folder) return folder;
  // Not a folder: it may be a file, found by listing its parent folder.
  const parent = parts.length === 1 ? { fid: '0' } : await folderAt(parts.slice(0, -1));
  const hit = parent && (await listDir(page, parent.fid)).find((f) => f.file_name === parts.at(-1));
  if (hit) return hit;
  // Missing: point `next` at the deepest folder that does exist.
  let depth = parts.length - 1;
  // eslint-disable-next-line no-await-in-loop
  while (depth > 0 && !(await folderAt(parts.slice(0, depth)))) depth--;
  throw notFound(`网盘里没有 /${parts.join('/')}`, `用 quark ls /${parts.slice(0, depth).join('/')} 看这个目录里有什么`);
}
