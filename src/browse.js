import { call, resolve } from "./session.js";
import { isoTime } from "./format.js";
import { usageError } from "./errors.js";

export const isDir = (file) => file.dir ?? file.file_type === 0;

// "/a//b/" -> "/a/b"; the root is "/". A drive path must start with "/": silently adding it
// would turn a word of a space-split `xargs` line into a top-level name, and `rm` would delete it.
export function normalize(path) {
  if (!path.startsWith("/")) {
    throw usageError(
      `网盘路径要从 / 开始写，收到了 ${JSON.stringify(path)}`,
      "补上开头的 /；名字里有空格时，用 `tr '\\n' '\\0' | xargs -0` 接管道，不要直接 xargs",
    );
  }
  return `/${path.split("/").filter(Boolean).join("/")}`;
}

// session.resolve() already throws the "not found" error (exit 4).
export const resolveOrFail = resolve;

// The curated fields `ls` and `search` print by default (FEATURES.md → F17).
export const brief = (file, path) => ({
  name: file.file_name,
  path,
  type: isDir(file) ? "dir" : "file",
  size: isDir(file) ? null : file.size,
  modified: isoTime(file.l_updated_at),
});

// Folders first, then newest first.
export const byDisplayOrder = (a, b) =>
  Number(isDir(b)) - Number(isDir(a)) || b.l_updated_at - a.l_updated_at;

// Full paths for entries that only know pdir_fid. Parent folders are looked up one level at a
// time, all siblings of a level in parallel, and each folder is fetched at most once.
export async function fullPaths(page, files) {
  const folders = new Map([["0", { name: "", parent: null }]]);
  let pending = [...new Set(files.map((f) => f.pdir_fid))].filter((fid) => !folders.has(fid));
  while (pending.length) {
    const infos = await Promise.all(
      pending.map((fid) => call(page, "GET", "/file/info", { query: { fid } })),
    );
    for (const { data } of infos)
      folders.set(data.fid, { name: data.file_name, parent: data.pdir_fid });
    pending = [...new Set(infos.map(({ data }) => data.pdir_fid))].filter(
      (fid) => !folders.has(fid),
    );
  }
  const dirPath = (fid) => {
    const parts = [];
    for (let cur = folders.get(fid); cur?.parent !== null && cur; cur = folders.get(cur.parent))
      parts.unshift(cur.name);
    return `/${parts.join("/")}`;
  };
  return new Map(
    files.map((f) => [f.fid, `${dirPath(f.pdir_fid).replace(/\/$/, "")}/${f.file_name}`]),
  );
}
