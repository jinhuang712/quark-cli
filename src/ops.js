import { call, listDir } from './session.js';
import { QuarkError, fail, usageError } from './errors.js';
import { isDir, normalize } from './browse.js';

export { isDir, normalize };

export const splitPath = (path) => path.split('/').filter(Boolean);

export const ROOT = { fid: '0', file_name: '/', dir: true };

export const join = (dir, name) => `${dir === '/' ? '' : dir}/${name}`;

// Resolves an absolute path to its node, or null when any part is missing.
export async function find(page, path) {
  let node = ROOT;
  for (const part of splitPath(path)) {
    if (!isDir(node)) return null;
    // eslint-disable-next-line no-await-in-loop -- each step needs the previous folder's fid
    const hit = (await listDir(page, node.fid)).find((f) => f.file_name === part);
    if (!hit) return null;
    node = hit;
  }
  return node;
}

export const missing = (path) => {
  const { parent } = parentOf(path);
  return fail('not_found', `网盘里没有 ${path}`, { next: `用 quark ls ${parent} 看这个目录里有什么` });
};

// Like find(), but a missing path is a not_found error (exit 4).
export async function need(page, path) {
  const node = await find(page, path);
  if (!node) throw missing(path);
  return node;
}

// Splits "/a/b/c" into the parent path "/a/b" and the leaf name "c".
export function parentOf(path) {
  const parts = splitPath(path);
  if (parts.length === 0) throw usageError('根目录不能用在这里', '给一个根目录以外的路径');
  return { parent: `/${parts.slice(0, -1).join('/')}`, name: parts.at(-1) };
}

export const alreadyExists = (path, what) =>
  fail('already_exists', `${path} 已经存在，${what}`, {
    next: `要保留已有的 ${path}：换个目标。要替换它：先 quark rename ${path} 新名字 留作备份，或者请用户同意后 quark rm ${path} --yes`,
  });

export async function createFolder(page, pdirFid, name) {
  const r = await call(page, 'POST', '/file', {
    body: { pdir_fid: pdirFid, file_name: name, dir_path: '', dir_init_lock: false },
  });
  return r.data.fid;
}

// Creates every missing folder along the path. Returns {node, created}.
export async function ensureDir(page, path) {
  let node = ROOT;
  let created = false;
  let walked = '/';
  for (const part of splitPath(path)) {
    walked = join(walked, part);
    // eslint-disable-next-line no-await-in-loop -- each level depends on the previous fid
    const hit = (await listDir(page, node.fid)).find((f) => f.file_name === part);
    if (hit && !isDir(hit)) {
      throw fail('already_exists', `${walked} 是文件，不能在它的位置建文件夹`, {
        next: `换个名字，或者先 quark rename ${walked} 新名字`,
      });
    }
    if (hit) {
      node = hit;
    } else {
      // eslint-disable-next-line no-await-in-loop
      const fid = await createFolder(page, node.fid, part);
      node = { fid, file_name: part, dir: true };
      created = true;
    }
  }
  return { node, created };
}

// Polls an async task until it finishes; returns the final task data.
export async function waitTask(page, taskId) {
  for (let i = 0; i < 60; i++) {
    // eslint-disable-next-line no-await-in-loop -- polling is sequential by nature
    const r = await call(page, 'GET', '/task', { query: { task_id: taskId, retry_index: i } });
    if (r.data.status === 2) return r.data;
    if (r.data.status >= 3) {
      throw fail('error', '夸克的任务失败了', { next: '重试一次；仍然失败就请用户看夸克客户端', detail: r.data.message ?? JSON.stringify(r.data) });
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new QuarkError(`夸克的任务 ${taskId} 太久没有完成`, { code: 'network', next: '先用 quark ls 看操作有没有生效，再决定要不要重试' });
}

// Runs a request that may be async (returns task_id) and waits for it.
export async function callMaybeTask(page, method, path, body) {
  const r = await call(page, method, path, { body });
  return r.data?.task_id ? waitTask(page, r.data.task_id) : r.data;
}
