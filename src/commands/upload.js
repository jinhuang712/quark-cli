import { readdir, stat } from "node:fs/promises";
import { basename, join, posix, resolve as localResolve } from "node:path";
import { listDir, resolve } from "../session.js";
import { isDir, normalize } from "../browse.js";
import { asNetworkError, makeFolder, uploadFile } from "../transfer.js";
import { fail } from "../errors.js";
import { sameName } from "../names.js";

// Quark's account is already under a risk notice; keep the parallelism modest.
const CONCURRENCY = 3;

// Expands a local path into drive-relative file entries and the folders to create.
async function expand(local, rel, found) {
  const info = await stat(local);
  if (info.isFile()) {
    found.files.push({
      local,
      dir: posix.dirname(rel),
      name: posix.basename(rel),
      size: info.size,
    });
    return;
  }
  found.dirs.push(rel);
  const entries = await readdir(local, { withFileTypes: true });
  const usable = entries.filter((e) => e.isFile() || e.isDirectory());
  await Promise.all(usable.map((e) => expand(join(local, e.name), posix.join(rel, e.name), found)));
}

export default {
  name: "upload",
  usage: "upload <local-path> <drive-dir>",
  summary: "把一个本地文件或文件夹传到已有的网盘目录",
  http: true,
  group: "transfer",
  args: [
    ["<local-path>", "本地文件或文件夹；文件夹会在网盘目录里建同名文件夹，连内容一起传"],
    ["<drive-dir>", "已存在的网盘目录，不会自动新建；要建先 quark mkdir"],
  ],
  examples: ["quark upload ./report.pdf /WORK", "quark upload ./photos /回忆 --raw"],
  effect: { changes: true, undo: "用 quark rm <网盘路径> --yes 删掉传上去的内容" },
  errors: ["not_found", "local_not_found", "already_exists", "refused", "no_space", "network"],
  related: ["mkdir", "ls", "rm"],
  async run({ page, args, emit, progress }) {
    if (args.length !== 2) {
      throw fail("usage", "需要两个参数：本地路径和网盘目录", {
        next: "用法：quark upload <本地路径> <网盘目录>",
      });
    }
    const local = localResolve(args[0]);
    const info = await stat(local).catch(() => null);
    if (!info) throw fail("local_not_found", `本地没有 ${local}`, { next: "检查本地路径" });
    if (!info.isFile() && !info.isDirectory()) {
      throw fail("error", `${local} 既不是文件也不是文件夹`, { next: "换一个普通文件或文件夹" });
    }

    const base = normalize(args[1]);
    const target = await resolve(page, base).catch((e) => {
      if (e.code !== "not_found") throw e;
      throw fail("not_found", `网盘里没有目录 ${base}`, {
        next: `先 quark mkdir ${base}，或者换一个已有的目录`,
      });
    });
    if (!isDir(target))
      throw fail("not_a_folder", `${base} 是文件，不是文件夹`, { next: "换一个网盘目录" });

    const name = basename(local);
    const topPath = posix.join(base, name);
    if ((await listDir(page, target.fid)).some((f) => sameName(f.file_name, name))) {
      throw fail("already_exists", `${base} 里已有 ${name}`, {
        next: `要保留网盘上的 ${topPath}：换一个网盘目录，或者换一个本地文件名再传。要替换它：先 quark rename ${topPath} 新名字 留作备份，或者请用户同意后 quark rm ${topPath} --yes`,
      });
    }

    const found = { files: [], dirs: [] };
    await expand(local, name, found);
    const files = found.files.toSorted(
      (a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name),
    );
    const driveOf = (rel) => (rel === "." ? base : posix.join(base, rel));

    const uploaded = [];
    const cleanup = () => `quark rm ${topPath} --yes`;
    // After the first write, a failure leaves partial work on the drive: say what is there.
    const interrupted = (e) => {
      if (!info.isDirectory()) return e;
      const done = uploaded.length
        ? `已传好 ${uploaded.length} 个文件：${uploaded.map((u) => u.path).join("、")}`
        : "还没有传好的文件";
      return fail(e.code, `${e.message}；${done}`, {
        next: `把新建的目录 ${topPath} 给用户看过后，用 ${cleanup()} 删掉，再重试；${e.next ?? ""}`.replace(
          /；$/,
          "",
        ),
        detail: e.detail,
      });
    };

    const folders = new Map();
    try {
      if (info.isDirectory()) {
        folders.set(name, await makeFolder(page, target.fid, name));
        // Folder levels nest, so shortest paths go first.
        for (const rel of found.dirs
          .filter((d) => d !== name)
          .toSorted((a, b) => a.length - b.length)) {
          // eslint-disable-next-line no-await-in-loop
          folders.set(
            rel,
            await makeFolder(page, folders.get(posix.dirname(rel)), posix.basename(rel)),
          );
        }
      }
    } catch (e) {
      throw interrupted(asNetworkError(e, `新建文件夹 ${topPath}`));
    }

    // A few workers pull files off one queue; the first failure stops new files and the
    // ones already in flight finish, so `uploaded` is exactly what is on the drive.
    const queue = files.map((file, index) => ({ file, index }));
    const results = [];
    let failure = null;
    const worker = async () => {
      while (!failure && queue.length) {
        const { file, index } = queue.shift();
        const dir = driveOf(info.isDirectory() ? file.dir : ".");
        progress(`正在上传 ${posix.join(dir, file.name)}`);
        try {
          // eslint-disable-next-line no-await-in-loop
          const { instant, name: storedName } = await uploadFile(page, {
            fid: info.isDirectory() ? folders.get(file.dir) : target.fid,
            folderName: basename(dir) || "root",
            local: file.local,
            name: file.name,
            size: file.size,
          });
          results[index] = { path: posix.join(dir, storedName), size: file.size, instant };
        } catch (e) {
          failure ??= e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
    uploaded.push(...results.filter(Boolean));
    if (failure) throw interrupted(failure);

    const data = {
      uploaded,
      count: uploaded.length,
      instant_count: uploaded.filter((u) => u.instant).length,
    };
    // Quark rewrites ' " < > in names; say so, so the caller knows which path to use afterwards.
    if (uploaded.some((u) => /&(#39|quot|lt|gt);/.test(basename(u.path)))) {
      data.note =
        "夸克把名字里的 ' \" < > 存成了 &#39; &quot; &lt; &gt;，后续命令用上面输出的路径（也可以用原名，夸克会认）";
    }
    emit({ data, lines: uploaded.map((u) => u.path), full: data });
  },
};
