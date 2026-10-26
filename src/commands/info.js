import { call, listDir } from "../session.js";
import { isoTime } from "../format.js";
import { usageError } from "../errors.js";
import { isDir, normalize, resolveOrFail } from "../browse.js";

export default {
  name: "info",
  usage: "info <path>",
  summary: "看一个文件或文件夹的大小、时间和 ID",
  http: true,
  group: "browse",
  args: [["<path>", "网盘里的文件或文件夹路径"]],
  examples: ["quark info /WORK/简历.pdf", "quark info /WORK --json"],
  effect: { changes: false },
  errors: ["not_found"],
  related: ["ls", "search"],
  async run({ page, args, emit }) {
    if (!args[0]) throw usageError("缺少路径", "用法: quark info <path>");
    const path = normalize(args[0]);
    const node = await resolveOrFail(page, path);
    const root = path === "/";
    const detail = root
      ? node
      : (await call(page, "GET", "/file/info", { query: { fid: node.fid } })).data;
    const folder = isDir(detail);
    const items = folder && root ? (await listDir(page, "0")).length : detail.include_items;
    emit({
      data: {
        name: root ? "/" : detail.file_name,
        path,
        type: folder ? "dir" : "file",
        ...(folder ? { items: items ?? 0 } : { size: detail.size }),
        created: isoTime(detail.l_created_at),
        modified: isoTime(detail.l_updated_at),
        id: detail.fid,
      },
      lines: [path],
      full: detail,
    });
  },
};
