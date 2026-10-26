import { PROFILE } from "./jar.js";
import { QuarkError, fail, notFound, refused } from "./errors.js";
import { FORBIDDEN, sameName } from "./names.js";

// Chrome in a non-standard location.
const CHROME_PATH = process.env.QUARK_CHROME_PATH;
const HOME = "https://pan.quark.cn/list";
const API = "https://drive-pc.quark.cn/1/clouddrive";

export async function open({ headed = false } = {}) {
  // Loaded here: playwright takes ~100 ms to import, and most commands never start Chrome.
  const { chromium } = await import("playwright-core");
  const context = await chromium.launchPersistentContext(PROFILE, {
    ...(CHROME_PATH ? { executablePath: CHROME_PATH } : { channel: "chrome" }),
    headless: !headed,
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(HOME, { waitUntil: "domcontentloaded" });
  return { context, page };
}

// One JSON request. With an HttpSession it goes straight out from Node; with a Chrome page it
// runs inside the logged-in page so cookies and CORS behave like the web app.
export async function fetchJson(page, url, { method = "GET", body } = {}) {
  if (page.http) return page.fetchJson(url, { method, body });
  return page.evaluate(
    async ({ href, verb, payload }) => {
      const init = { method: verb, credentials: "include" };
      if (payload)
        Object.assign(init, {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      const r = await fetch(href, init);
      return r.json();
    },
    { href: url, verb: method, payload: body },
  );
}

export async function call(page, method, path, { query = {}, body } = {}) {
  const qs = new URLSearchParams({ pr: "ucpro", fr: "pc", ...query });
  const res = await fetchJson(page, `${API}${path}?${qs}`, { method, body });
  if (res.status !== 200 || res.code !== 0) {
    const message = `${path}: ${res.message || JSON.stringify(res)}`;
    if (/bad file name/.test(res.message ?? "")) {
      throw fail("invalid_name", "夸克不接受这个名字", {
        next: `名字里不能有 ${FORBIDDEN}，换一个名字`,
        detail: res.message.trim(),
      });
    }
    // Quark's own refusals (restricted account, risk control) get their own exit code.
    throw Object.assign(
      /限制|风控|违规|封禁/.test(res.message ?? "") ? refused(message) : new QuarkError(message),
      {
        apiCode: res.code,
      },
    );
  }
  return res;
}

export async function isLoggedIn(page) {
  try {
    await call(page, "GET", "/file/sort", { query: { pdir_fid: "0", _page: 1, _size: 1 } });
    return true;
  } catch {
    return false;
  }
}

// Turns whatever launching Chrome threw into the error a caller can act on.
export function openError(e) {
  const first = String(e.message).split("\n")[0];
  // Chrome allows one process per profile directory.
  if (
    /ProcessSingleton|SingletonLock|profile.*(in use|already)|user data directory is already in use/i.test(
      e.message,
    )
  ) {
    return fail("profile_busy", "另一条 quark 命令正在用同一份登录态", {
      next: "同一时间只跑一条 quark 命令，等前一条结束再重试；确实没有别的命令在跑，就等几秒，是上一条被强行打断后 Chrome 还没退干净",
      detail: first,
    });
  }
  if (/Executable doesn't exist|executable|ENOENT|distribution .* is not found/i.test(e.message)) {
    return fail("chrome_missing", "本机没有找到 Google Chrome", {
      next: "请用户安装 Google Chrome；已安装在非标准位置时，设置环境变量 QUARK_CHROME_PATH 指向它",
      detail: first,
    });
  }
  return e;
}

// Quark serves at most 10,200 rows per sort order (offset 10200 fails with "query fail [61004]").
const PAGE = 200;
const MAX_PAGES = 51;

// Pages after the first are read a few at a time: the first page says how many there are.
const PAGE_WORKERS = 3;

async function listPages(page, fid, sort) {
  const get = (p) =>
    call(page, "GET", "/file/sort", {
      query: { pdir_fid: fid, _page: p, _size: PAGE, _fetch_total: 1, _sort: sort },
    });
  const first = await get(1);
  const total = first.metadata?._total ?? 0;
  const pages = Math.min(Math.ceil(total / PAGE), MAX_PAGES);
  const rest = Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => i + 2);
  const byPage = new Map([[1, first.data.list]]);
  const worker = async () => {
    while (rest.length) {
      const p = rest.shift();
      // eslint-disable-next-line no-await-in-loop
      byPage.set(p, (await get(p)).data.list);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PAGE_WORKERS, rest.length) }, worker));
  const rows = [...byPage.entries()].toSorted((x, y) => x[0] - y[0]).flatMap(([, list]) => list);
  return { rows, total };
}

export async function listDir(page, fid) {
  // Right after a write, Quark's `_total` can run ahead of the rows it returns. Below the
  // 10,200-row cap that is never a real shortfall, so read again.
  const readForward = () => listPages(page, fid, "file_type:asc,updated_at:desc");
  const short = (r) => r.rows.length < r.total && r.total <= PAGE * MAX_PAGES;
  let forward = await readForward();
  for (let i = 0; i < 8 && short(forward); i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((done) => setTimeout(done, 300));
    // eslint-disable-next-line no-await-in-loop
    forward = await readForward();
  }
  if (forward.rows.length >= forward.total) return forward.rows;
  // Past the cap: read from the other end too, and merge. That reaches 2 x 10,200 rows.
  const backward = await listPages(page, fid, "file_type:desc,updated_at:asc");
  const byFid = new Map([...forward.rows, ...backward.rows].map((f) => [f.fid, f]));
  if (byFid.size < forward.total) {
    throw fail("error", `这个文件夹有 ${forward.total} 项，夸克只让读到其中 ${byFid.size} 项`, {
      next: "用 quark search 按名字找，或者请用户在夸克里把这个文件夹拆小",
    });
  }
  return [...byFid.values()];
}

// Resolves "/WORK/简历" to the fid of that folder (or file when `last` is a file).
export async function resolve(page, path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { fid: "0", file_name: "/", dir: true };
  // path_list answers for folders only, in one request however deep the path is.
  const folderAt = async (ps) =>
    (
      await call(page, "POST", "/file/info/path_list", {
        body: { file_path: [`/${ps.join("/")}`], namespace: "0" },
      })
    ).data[0];
  const folder = await folderAt(parts);
  if (folder) return folder;
  // Not a folder: it may be a file, found by listing its parent folder.
  const parent = parts.length === 1 ? { fid: "0" } : await folderAt(parts.slice(0, -1));
  const hit =
    parent && (await listDir(page, parent.fid)).find((f) => sameName(f.file_name, parts.at(-1)));
  if (hit) return hit;
  // Missing: point `next` at the deepest folder that does exist.
  let depth = parts.length - 1;
  // eslint-disable-next-line no-await-in-loop
  while (depth > 0 && !(await folderAt(parts.slice(0, depth)))) depth--;
  throw notFound(
    `网盘里没有 /${parts.join("/")}`,
    `用 quark ls /${parts.slice(0, depth).join("/")} 看这个目录里有什么`,
  );
}
