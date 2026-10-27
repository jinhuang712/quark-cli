import { mkdir, stat } from "node:fs/promises";
import { join, resolve as localResolve } from "node:path";
import { listDir, resolve } from "../session.js";
import { normalize, isDir } from "../browse.js";
import { downloadFile } from "../transfer.js";
import { createShare } from "../share-create.js";
import { fail } from "../errors.js";
import { size } from "../format.js";

// Folders download a couple of files at once; each big file already uses several connections.
const CONCURRENCY = 2;

async function statOrNull(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

// Every file under folder `node`, with its path relative to that folder, plus the folders.
async function walk(page, node, rel, found) {
  found.dirs.push(rel);
  const kids = await listDir(page, node.fid);
  await Promise.all(
    kids.map((k) => {
      const at = [...rel, k.file_name];
      if (isDir(k)) return walk(page, k, at, found);
      found.files.push({ node: k, rel: at });
      return undefined;
    }),
  );
}

export default {
  name: "download",
  usage: "download <drive-path> <local-dir> [--share-big]",
  summary: "把一个网盘文件或文件夹下载到已有的本地目录，名字不变",
  http: true,
  group: "transfer",
  options: { "share-big": { type: "boolean" } },
  args: [
    ["<drive-path>", "网盘文件或文件夹路径；文件夹连内容一起下载"],
    ["<local-dir>", "已存在的本地目录，不会自动新建"],
  ],
  flags: [
    [
      "--share-big",
      "夸克网页版不让下载的大文件（约 60MB 起）改为建一条 7 天、带提取码的分享链接，不报错",
    ],
  ],
  examples: [
    "quark download /WORK/report.pdf ./downloads",
    "quark download /WORK/photos ./downloads --share-big",
  ],
  effect: {
    changes: false,
    undo: "删掉下载下来的本地文件即可；用了 --share-big 建的分享用 quark unshare 取消",
  },
  errors: ["not_found", "local_not_found", "already_exists", "no_space", "network", "refused"],
  related: ["ls", "info", "upload", "share"],
  async run({ page, context, args, flags, emit, progress }) {
    if (args.length !== 2) {
      throw fail("usage", "需要两个参数：网盘路径和本地目录", {
        next: "用法：quark download <网盘路径> <本地目录>",
      });
    }
    const path = normalize(args[0]);
    const dir = localResolve(args[1]);
    const node = await resolve(page, path);
    const dirStat = await statOrNull(dir);
    if (!dirStat) {
      throw fail("local_not_found", `本地没有目录 ${dir}`, {
        next: `先建好目录，或换一个已有的目录`,
      });
    }
    if (!dirStat.isDirectory()) {
      throw fail("not_a_folder", `${dir} 是文件，不是目录`, { next: "换一个已有的本地目录" });
    }

    const shared = [];
    // One file: downloaded to `dest`, or, with --share-big and a file Quark will not hand
    // out, shared instead. Resolves to the local size, or null when it was shared.
    const fetchOne = async (file, dest, drivePath) => {
      let step = -1;
      const onProgress = (got, total) => {
        const pct = total ? Math.floor((got / total) * 10) * 10 : 0;
        if (total && pct === step) return;
        step = pct;
        progress(
          `${file.file_name}: ${size(got)}${total ? ` / ${size(total)} ${Math.floor((got / total) * 100)}%` : ""}`,
        );
      };
      try {
        await downloadFile(page, context, {
          fid: file.fid,
          dest,
          size: file.size,
          updated: file.updated_at ?? file.l_updated_at,
          onProgress,
        });
        return file.size;
      } catch (e) {
        if (!e.tooBig || !flags["share-big"]) throw e;
        progress(`${drivePath} 太大，改为建分享链接`);
        const made = await createShare(page, [file], { days: 7, withCode: true });
        shared.push({ path: drivePath, link: made.share_url, code: made.passcode });
        return null;
      }
    };

    if (!isDir(node)) {
      const dest = join(dir, node.file_name);
      if (await statOrNull(dest)) {
        throw fail("already_exists", `本地已有 ${dest}`, {
          next: "先删掉或改名本地的同名文件，或者换一个目录",
        });
      }
      const got = await fetchOne(node, dest, path);
      const data = got === null ? { shared } : { path: dest, size: node.size };
      emit({
        data,
        lines: got === null ? shared.map((s) => s.link) : [dest],
        full: { ...node, ...data },
      });
      return;
    }

    // A folder: the same-named local folder may already exist, so a second run picks up where
    // the first stopped. Files already there at full size are kept; any other clash is refused.
    const top = join(dir, node.file_name);
    const found = { files: [], dirs: [] };
    await walk(page, node, [], found);
    const todo = [];
    const kept = [];
    const clashes = [];
    const ordered = found.files.toSorted((a, b) => a.rel.join("/").localeCompare(b.rel.join("/")));
    for (const f of ordered) {
      const dest = join(top, ...f.rel);
      // eslint-disable-next-line no-await-in-loop
      const have = await statOrNull(dest);
      if (!have) todo.push({ ...f, dest });
      else if (have.isFile() && have.size === f.node.size) kept.push({ ...f, dest });
      else clashes.push(dest);
    }
    if (clashes.length) {
      throw fail(
        "already_exists",
        `本地已有内容不同的同名文件：${clashes.slice(0, 5).join("、")}`,
        {
          next: "先删掉或改名这些本地文件，或者换一个目录",
        },
      );
    }
    for (const rel of found.dirs) {
      // eslint-disable-next-line no-await-in-loop
      await mkdir(join(top, ...rel), { recursive: true });
    }

    const done = [];
    const queue = [...todo];
    let failure = null;
    const worker = async () => {
      while (!failure && queue.length) {
        const f = queue.shift();
        const drivePath = [path, ...f.rel].join("/");
        try {
          // eslint-disable-next-line no-await-in-loop
          const got = await fetchOne(f.node, f.dest, drivePath);
          if (got !== null) done.push({ path: f.dest, size: got });
        } catch (e) {
          failure ??= e;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
    if (failure) {
      const said = done.length ? `已下载 ${done.length} 个文件` : "还没有下载好的文件";
      throw fail(failure.code, `${failure.message}；${said}，在 ${top}`, {
        next: `再运行一次同样的命令会跳过已下载的文件，没下完的从断点继续；${failure.next ?? ""}`.replace(
          /；$/,
          "",
        ),
        detail: failure.detail,
      });
    }
    const files = [...kept, ...done].map((f) => f.path);
    const data = {
      path: top,
      count: done.length,
      skipped: kept.length,
      ...(shared.length && { shared }),
    };
    emit({ data, lines: [top], full: { ...data, files } });
  },
};
