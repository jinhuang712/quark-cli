import {
  alreadyExists,
  callMaybeTask,
  find,
  isDir,
  join,
  missing,
  need,
  normalize,
  parentOf,
} from "../ops.js";
import { listDir } from "../session.js";
import { sameName } from "../names.js";
import { waitGone, waitSeen } from "../settle.js";
import { fail, usageError } from "../errors.js";

export default {
  name: "mv",
  usage: "mv <src> <dest-folder>",
  summary: "把文件或文件夹移到另一个已有的文件夹里，名字不变",
  http: true,
  group: "organize",
  args: [
    ["<src>", "要移动的网盘路径"],
    ["<dest-folder>", "目标文件夹，必须已存在"],
  ],
  examples: ["quark mv /WORK/简历.pdf /归档"],
  effect: { changes: true, undo: "再 quark mv 移回原目录" },
  errors: ["not_found", "not_a_folder", "already_exists", "usage"],
  related: ["mkdir", "rename", "ls"],
  async run({ page, args, emit }) {
    if (args.length !== 2)
      throw usageError("mv 需要两个参数：来源和目标文件夹", "运行 quark mv --help 看用法");
    const src = normalize(args[0]);
    const dest = normalize(args[1]);
    const { name } = parentOf(src);
    const [node, target] = await Promise.all([need(page, src), find(page, dest)]);
    if (!target) throw missing(dest);
    if (!isDir(target)) {
      throw fail("not_a_folder", `${dest} 是文件，不是文件夹`, {
        next: "目标要是文件夹；要改名用 quark rename",
      });
    }
    if (dest === src || dest.startsWith(`${src}/`)) {
      throw usageError(`不能把 ${src} 移进它自己里面`, "换一个目标文件夹");
    }
    const to = join(dest, name);
    const clash = (await listDir(page, target.fid)).some((f) => sameName(f.file_name, name));
    if (clash) throw alreadyExists(to, "没有移动任何东西");
    await callMaybeTask(page, "POST", "/file/move", {
      action_type: 1,
      to_pdir_fid: target.fid,
      filelist: [node.fid],
      exclude_fids: [],
    });
    const [moved] = await Promise.all([
      waitSeen(page, target.fid, node.fid),
      waitGone(page, node.pdir_fid, [node.fid]),
    ]);
    // Quark does not refuse a clash on move, it renames the arrival (name(1)). The listing check
    // above can be a moment stale, so confirm the name the item really got.
    if (!sameName(moved.file_name, name)) {
      throw fail(
        "already_exists",
        `${to} 已经存在，夸克把移过去的项目改名成了 ${moved.file_name}`,
        {
          next: `项目现在在 ${join(dest, moved.file_name)}；要放回去：quark mv 它 ${parentOf(src).parent}；要保留：quark rename 它换个名字`,
        },
      );
    }
    emit({
      data: { from: src, path: to, type: isDir(node) ? "dir" : "file", changed: true },
      lines: [to],
      full: { from: src, path: to, changed: true, node },
    });
  },
};
