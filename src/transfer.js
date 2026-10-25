import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { call, listDir } from './session.js';
import { QuarkError, refused } from './errors.js';

const isDir = (f) => f.dir ?? f.file_type === 0;

// Creates one folder under `pdirFid` and returns its fid.
export async function makeFolder(page, pdirFid, name) {
  const r = await call(page, 'POST', '/file', {
    body: { pdir_fid: pdirFid, file_name: name, dir_path: '', dir_init_lock: false },
  });
  return r.data.fid;
}

// Resolves a drive folder path, creating each missing level. `cache` maps path -> fid.
export async function ensureFolder(page, path, cache = new Map()) {
  let fid = '0';
  let current = '';
  for (const part of path.split('/').filter(Boolean)) {
    current += `/${part}`;
    if (cache.has(current)) {
      fid = cache.get(current);
      continue;
    }
    // Levels depend on each other, so they are resolved in order.
    // eslint-disable-next-line no-await-in-loop
    const hit = (await listDir(page, fid)).find((f) => f.file_name === part);
    if (hit && !isDir(hit)) throw new QuarkError(`${current} is a file on the drive, not a folder`);
    // eslint-disable-next-line no-await-in-loop
    fid = hit ? hit.fid : await makeFolder(page, fid, part);
    cache.set(current, fid);
  }
  return fid;
}

// Watches the web app's upload calls. A non-zero code on /file/upload/pre means the drive
// refused the file; `finish: true` on /file/update/hash means it already had the content
// (instant upload). Files go one at a time, so the hash call belongs to the current file.
function watchPre(page) {
  const seen = new Map();
  const onResponse = async (res) => {
    const url = res.url();
    const isPre = url.includes('/file/upload/pre');
    if (!isPre && !url.includes('/file/update/hash')) return;
    try {
      const body = await res.json();
      if (isPre) seen.set(JSON.parse(res.request().postData() ?? '{}').file_name, body);
      else seen.set('<hash>', body);
    } catch {
      // a navigation can discard the body; the list poll still decides the outcome
    }
  };
  page.on('response', onResponse);
  return { seen, stop: () => page.off('response', onResponse) };
}

function preError(body) {
  if (!body || (body.status === 200 && body.code === 0)) return null;
  const msg = body.message || JSON.stringify(body);
  if (/capacity/i.test(msg)) return new QuarkError(`not enough drive space (${msg}); free some space and retry`);
  if (/限制|风控|restrict/i.test(msg)) return refused(msg);
  return new QuarkError(msg);
}

// Uploads one local file into the drive folder `fid` through the web app's file input.
// Resolves to { instant }; throws when the drive refuses or the file never shows up.
export async function uploadFile(page, { fid, folderName, local, name, size }) {
  const route = `https://pan.quark.cn/list#/list/all/${fid}-${encodeURIComponent(folderName)}`;
  const watch = watchPre(page);
  try {
    await page.goto(route);
    await page.waitForSelector('input[type=file]', { state: 'attached' });
    await page.locator('input[type=file]').first().setInputFiles(local);
    const deadline = Date.now() + 60_000 + (size / (256 * 1024)) * 1000;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(1000);
      const failure = preError(watch.seen.get(name));
      if (failure) throw failure;
      // eslint-disable-next-line no-await-in-loop
      const hit = (await listDir(page, fid)).find((f) => f.file_name === name && f.size === size);
      if (hit) return { instant: watch.seen.get('<hash>')?.data?.finish === true };
    }
    throw new QuarkError(`timed out waiting for ${name} to finish uploading`);
  } finally {
    watch.stop();
  }
}

// Downloads drive file `fid` to `dest` through a signed URL fetched with the session cookies.
// Writes to `dest.part` and renames when complete; the partial file is removed on any failure.
export async function downloadFile(page, context, { fid, dest, size, onProgress }) {
  const r = await call(page, 'POST', '/file/download', { body: { fids: [fid] } });
  const url = r.data?.[0]?.download_url;
  if (!url) throw new QuarkError('the drive returned no download link for this file');
  const cookies = await context.cookies(url);
  const res = await fetch(url, {
    headers: {
      cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      referer: 'https://pan.quark.cn/',
      'user-agent': await page.evaluate(() => navigator.userAgent),
    },
  });
  if (!res.ok || !res.body) throw new QuarkError(`download failed: HTTP ${res.status}`);
  const part = `${dest}.part`;
  let received = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      onProgress?.(received, size);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(part));
    if (size && received !== size) throw new QuarkError(`download incomplete: got ${received} of ${size} bytes`);
    await rename(part, dest);
  } catch (e) {
    await rm(part, { force: true });
    throw e instanceof QuarkError ? e : new QuarkError(`download interrupted: ${e.message}`);
  }
}
