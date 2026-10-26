import { listDir, resolve } from "../session.js";
import { stored } from "../names.js";
import { waitNamed } from "../settle.js";
import { isDir, normalize } from "../browse.js";
import { size } from "../format.js";
import { fail, usageError } from "../errors.js";
import { pwdId, raw, ok, rejection, tokenError, waitTask } from "../shares.js";

async function shareItems(page, id, stoken, link) {
  const out = [];
  for (let p = 1; ; p++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await raw(page, "GET", "/share/sharepage/detail", {
      query: {
        pwd_id: id,
        stoken,
        pdir_fid: "0",
        force: 0,
        _page: p,
        _size: 100,
        _fetch_total: 1,
        _sort: "file_type:asc,updated_at:desc",
      },
    });
    if (!ok(r)) throw tokenError(r, link, { hasCode: true });
    out.push(...r.data.list);
    if (out.length >= (r.metadata?._total ?? 0) || r.data.list.length === 0) return out;
  }
}

async function capacityError(page, needed, res) {
  const m = await raw(page, "GET", "/member", {
    query: { fetch_subscribe: "true", _ch: "home" },
  }).catch(() => null);
  const free =
    m && ok(m) && m.data.total_capacity ? m.data.total_capacity - m.data.use_capacity : null;
  const lack =
    free === null
      ? ""
      : `，需要 ${size(needed)}，剩余 ${size(Math.max(free, 0))}，差 ${size(Math.max(needed - free, 0))}`;
  return fail("no_space", `网盘容量不够${lack}`, {
    next: "请用户清理网盘空间后重试",
    detail: res.message || JSON.stringify(res),
  });
}

const OWN_SHARE = /自己|本人|own|yourself/i;

export default {
  name: "save",
  usage: "save <link> <drive-dir> [--code <code>]",
  summary: "把别人分享的内容转存进已有的网盘目录",
  group: "share",
  options: { code: { type: "string" } },
  args: [
    ["<link>", "分享链接，形如 https://pan.quark.cn/s/xxxx"],
    ["<drive-dir>", "已存在的网盘目录，不会自动新建"],
  ],
  flags: [["--code <code>", "分享的提取码，链接需要提取码时必填"]],
  examples: ["quark save https://pan.quark.cn/s/abcdef123456 /来自分享 --code a1B2"],
  effect: { changes: true, undo: "能，用 quark rm 删掉转存进来的项，进回收站" },
  errors: ["not_found", "already_exists", "share_gone", "bad_code", "no_space", "refused"],
  related: ["mkdir", "ls", "rm"],
  async run({ page, args, flags, emit }) {
    if (args.length !== 2)
      throw usageError(
        "save 需要恰好两个参数：分享链接和网盘目录",
        "用法: quark save <链接> <网盘目录> [--code <提取码>]",
      );
    const [link] = args;
    const dirPath = normalize(args[1]);
    const id = pwdId(link);
    if (!id) throw usageError(`不是夸克分享链接: ${link}`, "链接形如 https://pan.quark.cn/s/xxxx");

    const dir = await resolve(page, dirPath).catch((e) => {
      throw e.code === "not_found"
        ? fail("not_found", `网盘里没有 ${dirPath}`, {
            next: `先 quark mkdir ${dirPath} 建出这个目录`,
          })
        : e;
    });
    if (!isDir(dir)) {
      throw fail("not_a_folder", `${dirPath} 是文件，不是文件夹`, {
        next: "换一个网盘目录，或用 quark mkdir 新建",
      });
    }

    const tok = await raw(page, "POST", "/share/sharepage/token", {
      body: { pwd_id: id, passcode: flags.code ?? "" },
    });
    if (!ok(tok)) throw tokenError(tok, link, { hasCode: Boolean(flags.code) });
    const { stoken } = tok.data;

    const items = await shareItems(page, id, stoken, link);
    if (items.length === 0)
      throw fail("share_gone", `这条分享里没有内容: ${link}`, { next: "请对方重新分享" });
    const existing = new Set((await listDir(page, dir.fid)).map((f) => f.file_name));
    const clash = items
      .filter((i) => existing.has(i.file_name) || existing.has(stored(i.file_name)))
      .map((i) => `${dirPath === "/" ? "" : dirPath}/${i.file_name}`);
    if (clash.length) {
      throw fail("already_exists", `${dirPath} 里已有同名项，什么都没有转存: ${clash.join("、")}`, {
        next: "要保留已有的：换一个网盘目录。要替换：先 quark rename 这些同名项留作备份，或者请用户同意后 quark rm 它们 --yes",
      });
    }

    const res = await raw(page, "POST", "/share/sharepage/save", {
      body: {
        fid_list: items.map((i) => i.fid),
        fid_token_list: items.map((i) => i.share_fid_token),
        to_pdir_fid: dir.fid,
        pwd_id: id,
        stoken,
        pdir_fid: "0",
        scene: "link",
      },
    });
    if (!ok(res)) {
      if (/容量|capacity/i.test(res.message ?? "") || res.code === 32003) {
        throw await capacityError(
          page,
          items.reduce((n, i) => n + (i.size ?? 0), 0),
          res,
        );
      }
      const own = OWN_SHARE.test(res.message ?? "");
      if (own)
        throw fail("refused", `夸克不允许转存自己创建的分享: ${link}`, {
          next: "转存要用别人的链接",
          detail: res.message,
        });
      throw rejection("转存", res);
    }
    const task = await waitTask(page, res.data.task_id);

    await waitNamed(
      page,
      dir.fid,
      items.map((i) => i.file_name),
    );
    const saved = items.map((i) => `${dirPath === "/" ? "" : dirPath}/${i.file_name}`);
    emit({
      data: { saved, count: saved.length },
      lines: saved,
      full: { saved, count: saved.length, items, task },
    });
  },
};
