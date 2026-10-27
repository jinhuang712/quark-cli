import { resolve } from "../session.js";
import { normalize } from "../browse.js";
import { usageError } from "../errors.js";
import { EXPIRED_TYPE } from "../shares.js";
import { createShare } from "../share-create.js";

export default {
  name: "share",
  usage: "share <path>... [--days 1|7|30|0] [--code]",
  summary: "为文件或文件夹创建分享链接，默认 7 天有效",
  http: true,
  group: "share",
  options: { days: { type: "string", default: "7" }, code: { type: "boolean" } },
  args: [["<path>...", "一个或多个网盘路径，同一条链接分享它们"]],
  flags: [
    ["--days <n>", "有效期天数，可选 1、7、30、0，0 是永久，默认 7"],
    ["--code", "生成 4 位提取码，输出里同时给出链接和提取码，默认没有提取码"],
  ],
  examples: ["quark share /WORK/简历 --days 7 --code", "quark share /WORK/a.pdf /WORK/b.pdf --raw"],
  effect: { changes: true, undo: "能，quark unshare <链接> 取消分享" },
  errors: ["not_found", "refused", "network"],
  related: ["shares", "unshare", "ls"],
  async run({ page, args, flags, emit }) {
    if (args.length === 0)
      throw usageError(
        "share 需要至少一个网盘路径",
        "用法: quark share <路径>... [--days 1|7|30|0] [--code]",
      );
    const expired = EXPIRED_TYPE[flags.days];
    if (!expired)
      throw usageError(
        `--days 只能是 1、7、30、0，收到 ${flags.days}`,
        "例如 quark share /WORK/简历 --days 7",
      );

    const paths = args.map(normalize);
    const nodes = await Promise.all(paths.map((p) => resolve(page, p)));
    const made = await createShare(page, nodes, { days: Number(flags.days), withCode: flags.code });
    const { share_url: link, passcode: code } = made;
    emit({
      data: { link, ...(code && { code }), days: Number(flags.days), files: paths },
      lines: code ? [link, code] : [link],
      full: { ...made, days: Number(flags.days), files: paths },
    });
  },
};
