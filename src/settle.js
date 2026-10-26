import { call, listDir } from "./session.js";
import { fail } from "./errors.js";
import { sameName } from "./names.js";
import { listShares } from "./shares.js";

// Quark takes a moment (measured: 0.3 to 1 s) to show a write in listings. A write command must
// not return before its effect can be seen, or the next command (ls, mv, share) works on stale
// data. The waits below use the same listings the other commands read.
const TRIES = 60;
const EVERY_MS = 150;

async function until(what, check) {
  for (let i = 0; i < TRIES; i++) {
    // eslint-disable-next-line no-await-in-loop
    if (await check()) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((done) => setTimeout(done, EVERY_MS));
  }
  throw fail("network", `${what}已经提交，但夸克很久都没有把结果显示出来`, {
    next: "先用 quark ls 看操作有没有生效，再决定要不要重试",
  });
}

// What changed most recently in a folder: new, renamed and moved-in items sort first.
const newest = async (page, dir) =>
  (
    await call(page, "GET", "/file/sort", {
      query: { pdir_fid: dir, _page: 1, _size: 100, _sort: "updated_at:desc" },
    })
  ).data.list;

// An item (optionally with this name) shows in folder `dir`.
export const waitSeen = (page, dir, fid, name) =>
  until("操作", async () =>
    (await newest(page, dir)).some(
      (f) => f.fid === fid && (name === undefined || sameName(f.file_name, name)),
    ),
  );

// None of `fids` shows in folder `dir` any more.
export const waitGone = (page, dir, fids) =>
  until("删除或移动", async () => {
    const left = new Set((await listDir(page, dir)).map((f) => f.fid));
    return fids.every((fid) => !left.has(fid));
  });

// Every name shows in folder `dir`.
export const waitNamed = (page, dir, names) =>
  until("转存", async () => {
    const have = (await listDir(page, dir)).map((f) => f.file_name);
    return names.every((n) => have.some((h) => sameName(h, n)));
  });

export const waitShare = (page, shareId, present) =>
  until(
    "分享",
    async () => (await listShares(page)).some((s) => s.share_id === shareId) === present,
  );
