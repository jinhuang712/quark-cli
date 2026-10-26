import { resolve } from "../session.js";
import { normalize } from "../browse.js";
import { usageError } from "../errors.js";
import { waitShare } from "../settle.js";
import { EXPIRED_TYPE, makeCode, raw, ok, rejection, waitTask } from "../shares.js";

export default {
  name: "share",
  usage: "share <path>... [--days 1|7|30|0] [--code]",
  summary: "为文件或文件夹创建分享链接，默认 7 天有效",
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
    const passcode = flags.code ? makeCode() : undefined;
    const body = {
      fid_list: nodes.map((n) => n.fid),
      title: nodes[0].file_name,
      url_type: passcode ? 2 : 1,
      expired_type: expired,
      ...(passcode && { passcode }),
    };
    const created = await raw(page, "POST", "/share", { body });
    if (!ok(created)) throw rejection("创建分享", created);
    const task = await waitTask(page, created.data.task_id);

    await waitShare(page, task.share_id, true);
    const info = await raw(page, "POST", "/share/password", { body: { share_id: task.share_id } });
    if (!ok(info)) throw rejection("读取分享链接", info);
    const { share_url: link, passcode: code } = info.data;
    emit({
      data: { link, ...(code && { code }), days: Number(flags.days), files: paths },
      lines: code ? [link, code] : [link],
      full: {
        ...info.data,
        task_id: created.data.task_id,
        share_id: task.share_id,
        days: Number(flags.days),
        files: paths,
      },
    });
  },
};
