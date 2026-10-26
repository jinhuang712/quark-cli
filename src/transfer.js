import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { call, listDir } from "./session.js";
import { QuarkError, fail, refused } from "./errors.js";
import { sameName, stored } from "./names.js";
import { waitSeen } from "./settle.js";
import { directUpload } from "./direct-upload.js";

// Creates one folder under `pdirFid` and returns its fid.
export async function makeFolder(page, pdirFid, name) {
  const r = await call(page, "POST", "/file", {
    body: { pdir_fid: pdirFid, file_name: name, dir_path: "", dir_init_lock: false },
  }).catch((e) => {
    if (e.apiCode !== 23008) throw e;
    throw fail("already_exists", `这里已经有 ${name}，什么都没建`, {
      next: "换一个名字或目录，或者先看 quark ls",
    });
  });
  await waitSeen(page, pdirFid, r.data.fid, name);
  return r.data.fid;
}

// Anything that is not already a QuarkError came from the browser or the socket, not from Quark.
export function asNetworkError(e, what) {
  if (e instanceof QuarkError) return e;
  return fail("network", `${what}时网络中断`, {
    next: "检查网络后重试",
    detail: String(e.message).split("\n")[0],
  });
}

// Watches the web app's upload calls. A non-zero code on /file/upload/pre means the drive
// refused the file; `finish: true` on /file/update/hash means it already had the content
// (instant upload). Files go one at a time, so the hash call belongs to the current file.
function watchPre(page) {
  const seen = new Map();
  const onResponse = async (res) => {
    const url = res.url();
    const isPre = url.includes("/file/upload/pre");
    if (!isPre && !url.includes("/file/update/hash")) return;
    try {
      const body = await res.json();
      if (isPre) seen.set(JSON.parse(res.request().postData() ?? "{}").file_name, body);
      else seen.set("<hash>", body);
    } catch {
      // a navigation can discard the body; the list poll still decides the outcome
    }
  };
  page.on("response", onResponse);
  return { seen, stop: () => page.off("response", onResponse) };
}

function preError(body, name) {
  if (!body || (body.status === 200 && body.code === 0)) return null;
  const msg = body.message || JSON.stringify(body);
  if (/capacity/i.test(msg)) {
    return fail("no_space", `网盘容量不够，传不了 ${name}`, {
      next: "请用户清理网盘空间后重试",
      detail: msg,
    });
  }
  if (/限制|风控|restrict/i.test(msg)) return refused(`夸克拒绝了 ${name} 的上传`, { detail: msg });
  return fail("error", `夸克拒绝了 ${name} 的上传`, { detail: msg });
}

// Quark's own answers that a retry through the web uploader cannot change.
const FINAL = new Set(["no_space", "refused", "invalid_name"]);
let directBroken = false;
let webQueue = Promise.resolve();

// Uploads one local file into the drive folder `fid`. Goes straight to Quark's upload API;
// when that private protocol misbehaves, drops to the web app's file input for this and every
// later file. Resolves to { instant, name }; throws a QuarkError when the drive refuses.
export async function uploadFile(page, file) {
  if (!directBroken) {
    try {
      return await directUpload(page, file);
    } catch (e) {
      if (e instanceof QuarkError && FINAL.has(e.code)) throw e;
      directBroken = true;
    }
  }
  // The web page is one shared tab, so fallback uploads take turns.
  const turn = webQueue.then(() => webUpload(page, file));
  webQueue = turn.catch(() => {});
  return turn;
}

// Uploads one local file into the drive folder `fid` through the web app's file input.
async function webUpload(page, { fid, folderName, local, name, size }) {
  // A direct attempt that died after Quark stored the file must not be uploaded twice.
  const already = (await listDir(page, fid).catch(() => [])).find(
    (f) => sameName(f.file_name, name) && f.size === size,
  );
  if (already) return { instant: false, name: already.file_name };
  const route = `https://pan.quark.cn/list#/list/all/${fid}-${encodeURIComponent(folderName)}`;
  const browser = page.http ? await page.chrome() : page;
  const watch = watchPre(browser);
  try {
    await browser.goto(route);
    await browser.waitForSelector("input[type=file]", { state: "attached" });
    await browser.locator("input[type=file]").first().setInputFiles(local);
    const deadline = Date.now() + 60_000 + (size / (256 * 1024)) * 1000;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await browser.waitForTimeout(1000);
      const failure = preError(watch.seen.get(name) ?? watch.seen.get(stored(name)), name);
      if (failure) throw failure;
      // eslint-disable-next-line no-await-in-loop
      const hit = (await listDir(page, fid)).find(
        (f) => sameName(f.file_name, name) && f.size === size,
      );
      // `name` is what Quark ended up storing, which differs from the local name for ' " < >.
      if (hit)
        return { instant: watch.seen.get("<hash>")?.data?.finish === true, name: hit.file_name };
    }
    throw fail("network", `等了很久 ${name} 还没传完`, { next: "检查网络后重试" });
  } catch (e) {
    throw asNetworkError(e, `上传 ${name}`);
  } finally {
    watch.stop();
  }
}

// Downloads drive file `fid` to `dest` through a signed URL fetched with the session cookies.
// Writes to `dest.part` and renames when complete; the partial file is removed on any failure.
export async function downloadFile(page, context, { fid, dest, size, onProgress }) {
  const part = `${dest}.part`;
  try {
    const r = await call(page, "POST", "/file/download", { body: { fids: [fid] } }).catch((e) => {
      if (/size limit/i.test(e.message)) {
        throw refused(
          `夸克网页版不让下载这么大的文件（${size ? `${(size / 1048576).toFixed(0)}MB` : "大文件"}），实测 50MB 能下、60MB 起不行`,
          {
            next: "请用户在夸克客户端里下载；或者用 quark share 给这个文件建一个分享链接，让用户打开链接下载",
            detail: e.message,
          },
        );
      }
      throw e;
    });
    const url = r.data?.[0]?.download_url;
    if (!url)
      throw fail("error", "夸克没有给出这个文件的下载链接", {
        next: "稍后重试；反复失败请让用户在夸克客户端确认文件能正常下载",
      });
    const cookie = page.http
      ? page.cookieHeader(url)
      : (await context.cookies(url)).map((c) => `${c.name}=${c.value}`).join("; ");
    const res = await fetch(url, {
      headers: {
        cookie,
        referer: "https://pan.quark.cn/",
        "user-agent": page.http ? page.userAgent() : await page.evaluate(() => navigator.userAgent),
      },
    });
    if (!res.ok || !res.body) {
      throw fail("error", `下载被拒绝，HTTP ${res.status}`, {
        next: "稍后重试",
        detail: `HTTP ${res.status}`,
      });
    }
    let received = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length;
        onProgress?.(received, size);
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(part));
    if (size && received !== size) {
      throw fail("network", `下载不完整，只收到 ${received} / ${size} 字节`, { next: "重试" });
    }
    await rename(part, dest);
  } catch (e) {
    await rm(part, { force: true });
    if (e.code === "ENOSPC") {
      throw fail("no_space", `本机磁盘空间不够，写不下 ${dest}`, {
        next: "请用户清理本机磁盘后重试",
      });
    }
    throw asNetworkError(e, "下载");
  }
}
