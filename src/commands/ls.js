import { listDir } from "../session.js";
import { brief, byDisplayOrder, isDir, normalize, resolveOrFail } from "../browse.js";
import { fail } from "../errors.js";

export default {
  name: "ls",
  usage: "ls [path]",
  summary: "列出一个文件夹里的内容，文件夹在前，新的在前",
  group: "browse",
  args: [["[path]", "网盘文件夹路径，默认是根目录 /"]],
  examples: ["quark ls /WORK", "quark ls /WORK --raw"],
  effect: { changes: false },
  errors: ["not_found", "not_a_folder"],
  related: ["info", "search"],
  async run({ page, args, emit }) {
    const path = normalize(args[0] ?? "/");
    const node = await resolveOrFail(page, path);
    if (!isDir(node)) {
      throw fail("not_a_folder", `${path} 是文件，不是文件夹`, {
        next: `看单个文件用 quark info ${path}`,
      });
    }
    const files = (await listDir(page, node.fid)).toSorted(byDisplayOrder);
    const pathOf = (f) => `${path === "/" ? "" : path}/${f.file_name}`;
    emit({
      data: files.map((f) => brief(f, pathOf(f))),
      lines: files.map(pathOf),
      full: files,
    });
  },
};
