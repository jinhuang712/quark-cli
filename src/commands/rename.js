import { NAME_TAKEN, alreadyExists, isDir, join, need, normalize, parentOf } from "../ops.js";
import { call, listDir } from "../session.js";
import { sameName } from "../names.js";
import { waitSeen } from "../settle.js";
import { usageError } from "../errors.js";

export default {
  name: "rename",
  usage: "rename <path> <new-name>",
  summary: "只改名字，不换目录",
  http: true,
  group: "organize",
  args: [
    ["<path>", "要改名的网盘路径"],
    ["<new-name>", "新名字，不含 /"],
  ],
  examples: ["quark rename /WORK/简历.pdf 简历-2026.pdf"],
  effect: { changes: true, undo: "再 quark rename 改回原名" },
  errors: ["not_found", "already_exists", "usage"],
  related: ["mv", "ls"],
  async run({ page, args, emit }) {
    if (args.length !== 2)
      throw usageError("rename 需要两个参数：路径和新名字", "运行 quark rename --help 看用法");
    const path = normalize(args[0]);
    const name = args[1];
    if (!name.trim() || name.includes("/")) {
      throw usageError(
        `新名字不能为空，也不能含 /（收到 ${JSON.stringify(name)}）`,
        "换目录用 quark mv",
      );
    }
    const { parent } = parentOf(path);
    const [node, dir] = await Promise.all([need(page, path), need(page, parent)]);
    const to = join(parent, name);
    const clash = (await listDir(page, dir.fid)).some((f) => sameName(f.file_name, name));
    if (clash) throw alreadyExists(to, "没有改名");
    // The listing above can be a moment stale; Quark's own refusal of a taken name is final.
    await call(page, "POST", "/file/rename", { body: { fid: node.fid, file_name: name } }).catch(
      (e) => {
        throw e.apiCode === NAME_TAKEN ? alreadyExists(to, "没有改名") : e;
      },
    );
    await waitSeen(page, dir.fid, node.fid, name);
    emit({
      data: { from: path, path: to, type: isDir(node) ? "dir" : "file", changed: true },
      lines: [to],
      full: { from: path, path: to, changed: true, node: { ...node, file_name: name } },
    });
  },
};
