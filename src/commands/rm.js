import { callMaybeTask, isDir, need, normalize, splitPath } from "../ops.js";
import { listDir } from "../session.js";
import { waitGone } from "../settle.js";
import { fail, usageError } from "../errors.js";

// Counts everything below a folder.
async function count(page, fid) {
  const kids = await listDir(page, fid);
  const folders = kids.filter(isDir);
  const subs = await Promise.all(folders.map((k) => count(page, k.fid)));
  return subs.reduce(
    (sum, s) => ({ folders: sum.folders + s.folders, files: sum.files + s.files }),
    { folders: folders.length, files: kids.length - folders.length },
  );
}

const NOTE = "已移入回收站，30 天内可在夸克客户端找回";

export default {
  name: "rm",
  usage: "rm <path>... --yes",
  summary: "删除文件或文件夹（进回收站）；没有 --yes 就不删，只报告计划",
  http: true,
  group: "organize",
  args: [["<path>...", "要删除的网盘路径，可以给多个"]],
  flags: [["--yes", "确认删除；不加就什么都不删，退出码 2，错误里写明将要删什么"]],
  examples: [
    "quark rm /claude-test",
    "quark rm /claude-test --yes",
    "quark search 临时 --raw | xargs quark rm --yes",
  ],
  effect: { changes: true, undo: "30 天内可在夸克客户端的回收站找回（客户端 3.1.3 以上）" },
  errors: ["confirmation_required", "not_found", "usage"],
  related: ["search", "ls", "info"],
  options: { yes: { type: "boolean" } },
  async run({ page, args, flags, emit }) {
    if (args.length === 0) throw usageError("rm 需要至少一个路径", "运行 quark rm --help 看用法");
    const paths = [...new Set(args.map(normalize))];
    if (paths.some((p) => splitPath(p).length === 0)) {
      throw usageError("不能删除根目录", "给具体的文件或文件夹路径");
    }
    const nodes = await Promise.all(paths.map((p) => need(page, p)));
    const inner = await Promise.all(nodes.map((n) => (isDir(n) ? count(page, n.fid) : null)));
    const folders = nodes.filter(isDir).length + inner.reduce((s, c) => s + (c?.folders ?? 0), 0);
    const files =
      nodes.filter((n) => !isDir(n)).length + inner.reduce((s, c) => s + (c?.files ?? 0), 0);
    if (!flags.yes) {
      throw fail(
        "confirmation_required",
        `没有 --yes，什么都没删。将要删除 ${paths.join("、")}，共 ${folders} 个文件夹、${files} 个文件`,
        {
          next: "把删除计划给用户看，用户同意后加 --yes 重新运行同一条命令",
          extra: { plan: { paths, folders, files } },
        },
      );
    }
    await callMaybeTask(page, "POST", "/file/delete", {
      action_type: 2,
      filelist: nodes.map((n) => n.fid),
      exclude_fids: [],
    });
    const byParent = Map.groupBy(nodes, (n) => n.pdir_fid);
    await Promise.all(
      [...byParent].map(([parent, list]) =>
        waitGone(
          page,
          parent,
          list.map((n) => n.fid),
        ),
      ),
    );
    emit({
      data: { deleted: paths, folders, files, changed: true, note: NOTE },
      lines: paths,
      full: { deleted: nodes, folders, files, changed: true, note: NOTE },
    });
  },
};
