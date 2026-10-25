import { call, resolve } from './session.js';

export const isDir = (file) => file.dir ?? file.file_type === 0;

// "/a//b/" -> "/a/b"; the root is "/".
export const normalize = (path) => `/${path.split('/').filter(Boolean).join('/')}`;

// session.resolve() already throws the "not found" error (exit 4).
export const resolveOrFail = resolve;

// Machine-readable shape shared by ls, search and info.
export function entry(file, path) {
  const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
  return {
    name: file.file_name,
    ...(path === undefined ? {} : { path }),
    type: isDir(file) ? 'folder' : 'file',
    size: isDir(file) ? null : file.size,
    items: isDir(file) ? (file.include_items ?? null) : null,
    created: iso(file.l_created_at),
    updated: iso(file.l_updated_at),
    fid: file.fid,
  };
}

// Folders first, then newest first.
export const byDisplayOrder = (a, b) =>
  Number(isDir(b)) - Number(isDir(a)) || b.l_updated_at - a.l_updated_at;

// Full paths for entries that only know pdir_fid. Parent folders are looked up one level at a
// time, all siblings of a level in parallel, and each folder is fetched at most once.
export async function fullPaths(page, files) {
  const folders = new Map([['0', { name: '', parent: null }]]);
  let pending = [...new Set(files.map((f) => f.pdir_fid))].filter((fid) => !folders.has(fid));
  while (pending.length) {
    const infos = await Promise.all(pending.map((fid) => call(page, 'GET', '/file/info', { query: { fid } })));
    for (const { data } of infos) folders.set(data.fid, { name: data.file_name, parent: data.pdir_fid });
    pending = [...new Set(infos.map(({ data }) => data.pdir_fid))].filter((fid) => !folders.has(fid));
  }
  const dirPath = (fid) => {
    const parts = [];
    for (let cur = folders.get(fid); cur?.parent !== null && cur; cur = folders.get(cur.parent)) parts.unshift(cur.name);
    return `/${parts.join('/')}`;
  };
  return new Map(files.map((f) => [f.fid, `${dirPath(f.pdir_fid).replace(/\/$/, '')}/${f.file_name}`]));
}
