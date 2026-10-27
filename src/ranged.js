import { open as fopen } from "node:fs/promises";
import { fail } from "./errors.js";

// Files at least this big are fetched in ranges, a few connections at once, when Quark's
// download host honours Range. Smaller ones are not worth the extra round trips.
export const RANGE_MIN = 8 * 1024 * 1024;
const RANGE_PART = 4 * 1024 * 1024;
const RANGE_CONCURRENCY = 4;

// True when a one-byte ranged request is answered 206 with a Content-Range.
export async function supportsRange(url, headers) {
  try {
    const res = await fetch(url, { headers: { ...headers, range: "bytes=0-0" } });
    await res.body?.cancel();
    return res.status === 206 && (res.headers.get("content-range") ?? "").startsWith("bytes 0-0/");
  } catch {
    return false;
  }
}

// Bytes at the start of the file that are certainly there: `from` plus every segment that
// finished, counted up to the first one that did not. `done[i]` is segment i's length once it
// is complete.
export function contiguousPrefix(from, done) {
  let at = from;
  for (const length of done) {
    if (length === undefined) break;
    at += length;
  }
  return at;
}

// Fills `part` from byte `from` to `size` with ranged requests, RANGE_CONCURRENCY at a time,
// each written at its offset. When it fails the file is cut back to the finished prefix, so a
// later call can continue from its length.
export async function rangeDownload(url, headers, part, size, tick, from = 0) {
  const handle = await fopen(part, from > 0 ? "r+" : "w");
  const parts = Math.ceil((size - from) / RANGE_PART);
  const done = Array.from({ length: parts });
  let next = 0;
  let failure = null;
  const worker = async () => {
    while (!failure && next < parts) {
      const i = next++;
      const start = from + i * RANGE_PART;
      const end = Math.min(start + RANGE_PART, size) - 1;
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(url, { headers: { ...headers, range: `bytes=${start}-${end}` } });
        if (res.status !== 206 || !res.body) {
          throw fail("error", `下载被拒绝，HTTP ${res.status}`, {
            next: "稍后重试",
            detail: `HTTP ${res.status}`,
          });
        }
        let at = start;
        for await (const chunk of res.body) {
          // eslint-disable-next-line no-await-in-loop
          await handle.write(chunk, 0, chunk.length, at);
          at += chunk.length;
          tick(chunk.length);
        }
        if (at !== end + 1) throw new Error(`第 ${i + 1} 段只收到 ${at - start} 字节`);
        done[i] = at - start;
      } catch (e) {
        failure ??= e;
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(RANGE_CONCURRENCY, parts) }, worker));
    if (failure) await handle.truncate(contiguousPrefix(from, done));
  } finally {
    await handle.close();
  }
  if (failure) throw failure;
}
