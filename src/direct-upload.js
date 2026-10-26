import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open as fopen } from "node:fs/promises";
import { call } from "./session.js";
import { fail } from "./errors.js";

// Quark's web uploader without the web page: ask Quark for a task, send the parts straight to
// its object storage with signatures Quark hands out, then tell Quark it is done. The protocol
// is private, so a failure that is not Quark answering "no" is a ProtocolError and the caller
// falls back to the web uploader.
const OSS_UA = "aliyun-sdk-js/1.0.0 Chrome 155.0.0.0 (headless) on OS X 10.15.7 64-bit";
const MIME = "application/octet-stream";
const DEFAULT_PART = 4 * 1024 * 1024;

export class ProtocolError extends Error {}

const hashFile = (path) =>
  new Promise((done, reject) => {
    const md5 = createHash("md5");
    const sha1 = createHash("sha1");
    createReadStream(path)
      .on("data", (d) => {
        md5.update(d);
        sha1.update(d);
      })
      .on("end", () => done({ md5: md5.digest("hex"), sha1: sha1.digest("hex") }))
      .on("error", reject);
  });

const signature = async (page, pre, meta) =>
  (
    await call(page, "POST", "/file/upload/auth", {
      body: { auth_info: pre.data.auth_info, auth_meta: meta, task_id: pre.data.task_id },
    })
  ).data.auth_key;

async function oss(url, method, body, headers, what) {
  const init = {
    method,
    headers: { ...headers, "x-oss-user-agent": OSS_UA, referer: "https://pan.quark.cn/" },
  };
  // `method` is only ever PUT or POST, both of which carry a body.
  init.body = body;
  const res = await fetch(url, init);
  if (res.status !== 200) {
    const text = (await res.text()).slice(0, 200);
    throw new ProtocolError(`${what}: HTTP ${res.status} ${text}`);
  }
  return res;
}

// Uploads `local` into drive folder `fid` as `name`. Resolves to { instant, name } where name is
// what Quark stored. Quark renames a clash to `name(1)` instead of failing, so the caller must
// have checked for an existing file first.
export async function directUpload(page, { fid, local, name, size }) {
  const now = Date.now();
  const pre = await call(page, "POST", "/file/upload/pre", {
    body: {
      ccp_hash_update: true,
      dir_name: "",
      file_name: name,
      format_type: MIME,
      l_created_at: now,
      l_updated_at: now,
      pdir_fid: fid,
      size,
    },
  }).catch((e) => {
    if (/capacity/i.test(e.message)) {
      throw fail("no_space", `网盘容量不够，传不了 ${name}`, {
        next: "请用户清理网盘空间后重试",
        detail: e.message,
      });
    }
    throw e;
  });
  const { task_id, bucket, obj_key, upload_id, upload_url } = pre.data;
  if (!bucket || !obj_key || !upload_id || !upload_url)
    throw new ProtocolError("/file/upload/pre 没给出上传地址");
  const partSize = pre.metadata?.part_size || DEFAULT_PART;

  const { md5, sha1 } = await hashFile(local);
  const hash = await call(page, "POST", "/file/update/hash", { body: { md5, sha1, task_id } });
  if (hash.data.finish) {
    await waitListed(page, fid, pre.data.fid, name);
    return { instant: true, name: hash.data.file_name ?? name };
  }

  const host = `https://${bucket}.${upload_url.replace(/^https?:\/\//, "")}/${obj_key}`;
  const object = `/${bucket}/${obj_key}`;
  const parts = Math.max(1, Math.ceil(size / partSize));
  const etags = [];
  const handle = await fopen(local, "r");
  try {
    for (let i = 0; i < parts; i++) {
      const length = Math.min(partSize, size - i * partSize);
      const buf = Buffer.alloc(length);
      // eslint-disable-next-line no-await-in-loop
      await handle.read(buf, 0, length, i * partSize);
      const date = new Date().toUTCString();
      const query = `partNumber=${i + 1}&uploadId=${upload_id}`;
      // eslint-disable-next-line no-await-in-loop
      const auth = await signature(
        page,
        pre,
        `PUT\n\n${MIME}\n${date}\nx-oss-date:${date}\nx-oss-user-agent:${OSS_UA}\n${object}?${query}`,
      );
      // eslint-disable-next-line no-await-in-loop
      const res = await oss(
        `${host}?${query}`,
        "PUT",
        buf,
        { authorization: auth, "content-type": MIME, "x-oss-date": date },
        `第 ${i + 1} 片`,
      );
      etags.push(res.headers.get("etag"));
    }
  } finally {
    await handle.close();
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<CompleteMultipartUpload>\n${etags
    .map((e, i) => `<Part>\n<PartNumber>${i + 1}</PartNumber>\n<ETag>${e}</ETag>\n</Part>\n`)
    .join("")}</CompleteMultipartUpload>`;
  const contentMd5 = createHash("md5").update(xml).digest("base64");
  const callback = Buffer.from(JSON.stringify(pre.data.callback)).toString("base64");
  const date = new Date().toUTCString();
  const auth = await signature(
    page,
    pre,
    `POST\n${contentMd5}\napplication/xml\n${date}\nx-oss-callback:${callback}\nx-oss-date:${date}\nx-oss-user-agent:${OSS_UA}\n${object}?uploadId=${upload_id}`,
  );
  await oss(
    `${host}?uploadId=${upload_id}`,
    "POST",
    xml,
    {
      authorization: auth,
      "content-md5": contentMd5,
      "content-type": "application/xml",
      "x-oss-callback": callback,
      "x-oss-date": date,
    },
    "提交分片",
  );
  const done = await call(page, "POST", "/file/upload/finish", { body: { obj_key, task_id } });
  await waitListed(page, fid, done.data.fid ?? pre.data.fid, name);
  return { instant: false, name: done.data.file_name ?? name };
}

// Quark says "finish" a moment before the file shows up in listings, and a command that runs
// right after `upload` (ls, mv, share) would not find it. Wait for it, newest files first.
async function waitListed(page, dir, fid, name) {
  for (let i = 0; i < 40; i++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await call(page, "GET", "/file/sort", {
      query: { pdir_fid: dir, _page: 1, _size: 50, _sort: "file_type:desc,updated_at:desc" },
    });
    if (r.data.list.some((f) => f.fid === fid)) return;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new ProtocolError(`${name} 传完 20 秒后夸克还没把它列出来`);
}
