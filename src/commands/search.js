import { call } from "../session.js";
import { usageError } from "../errors.js";
import { brief, byDisplayOrder, fullPaths } from "../browse.js";

const LIMIT = 50;

export default {
  name: "search",
  usage: "search <keyword>",
  summary: "在整个网盘里按名字找文件和文件夹，最多 50 条",
  http: true,
  group: "browse",
  args: [["<keyword>", "名字里要含有的关键词"]],
  examples: ["quark search 简历", "quark search 简历 --raw | xargs quark info"],
  effect: { changes: false },
  errors: [],
  related: ["ls", "info"],
  async run({ page, args, emit }) {
    const keyword = args.join(" ").trim();
    if (!keyword) throw usageError("缺少关键词", "用法: quark search <keyword>");
    const res = await call(page, "GET", "/file/search", {
      query: {
        q: keyword,
        _page: 1,
        _size: LIMIT,
        _fetch_total: 1,
        _sort: "file_type:asc,updated_at:desc",
      },
    });
    const files = res.data.list.slice(0, LIMIT).toSorted(byDisplayOrder);
    const total = res.metadata?._total ?? files.length;
    const paths = files.length ? await fullPaths(page, files) : new Map();
    emit({
      data: {
        total,
        truncated: total > files.length,
        results: files.map((f) => brief(f, paths.get(f.fid))),
      },
      lines: files.map((f) => paths.get(f.fid)),
      full: { total, truncated: total > files.length, results: files },
    });
  },
};
