import { call, listDir } from './session.js';
import { QuarkError, notFound, usageError } from './errors.js';

export const isDir = (node) => node.dir === true || node.file_type === 0;

export const splitPath = (path) => path.split('/').filter(Boolean);

export const ROOT = { fid: '0', file_name: '/', dir: true };

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

// Like find(), but a missing path is a "not found" error (exit 4).
export async function need(page, path) {
  const node = await find(page, path);
  if (!node) throw notFound(`not found: ${path}`);
  return node;
}

// Splits "/a/b/c" into the parent path "/a/b" and the leaf name "c".
export function parentOf(path) {
  const parts = splitPath(path);
  if (parts.length === 0) throw usageError('the root folder cannot be used here');
  return { parent: `/${parts.slice(0, -1).join('/')}`, name: parts.at(-1) };
}

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
  for (const part of splitPath(path)) {
    // eslint-disable-next-line no-await-in-loop -- each level depends on the previous fid
    const hit = (await listDir(page, node.fid)).find((f) => f.file_name === part);
    if (hit && !isDir(hit)) throw new QuarkError(`a file is in the way: ${hit.file_name} (in ${path})`);
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
    if (r.data.status >= 3) throw new QuarkError(`task failed: ${r.data.message ?? JSON.stringify(r.data)}`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new QuarkError(`task ${taskId} did not finish in time`);
}

// Runs a request that may be async (returns task_id) and waits for it.
export async function callMaybeTask(page, method, path, body) {
  const r = await call(page, method, path, { body });
  return r.data?.task_id ? waitTask(page, r.data.task_id) : r.data;
}
