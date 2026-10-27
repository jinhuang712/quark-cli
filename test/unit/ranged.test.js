import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { contiguousPrefix, rangeDownload, supportsRange } from "../../src/ranged.js";

const MB = 1024 * 1024;
const data = randomBytes(10 * MB + 123);

// A file host. `honour` turns Range support on; `breakFrom` kills any request that starts
// at or after that byte, the way a dropped connection would.
let honour = true;
let breakFrom = Infinity;
const server = createServer((req, res) => {
  const m = /^bytes=(\d+)-(\d+)?$/.exec(req.headers.range ?? "");
  if (!honour || !m) {
    res.writeHead(200, { "content-length": data.length });
    res.end(data);
    return;
  }
  const start = Number(m[1]);
  const end = Math.min(Number(m[2] ?? data.length - 1), data.length - 1);
  if (start >= breakFrom) {
    req.socket.destroy();
    return;
  }
  res.writeHead(206, {
    "content-range": `bytes ${start}-${end}/${data.length}`,
    "content-length": end - start + 1,
  });
  res.end(data.subarray(start, end + 1));
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/f`;
const dir = mkdtempSync(join(tmpdir(), "quark-ranged-"));
after(() => server.close());

describe("contiguousPrefix", () => {
  it("counts finished segments up to the first gap", () => {
    assert.equal(contiguousPrefix(0, [4, 4, undefined, 4]), 8);
    assert.equal(contiguousPrefix(100, [4, 4]), 108);
    assert.equal(contiguousPrefix(100, [undefined, 4]), 100);
    assert.equal(contiguousPrefix(0, []), 0);
  });
});

describe("ranged download", () => {
  it("supportsRange is true for a host that answers 206, false for one that ignores Range", async () => {
    honour = true;
    assert.equal(await supportsRange(url, {}), true);
    honour = false;
    assert.equal(await supportsRange(url, {}), false);
    honour = true;
  });

  it("writes every byte at its place", async () => {
    const part = join(dir, "whole.part");
    let got = 0;
    await rangeDownload(url, {}, part, data.length, (n) => (got += n));
    assert.equal(got, data.length);
    assert.ok(readFileSync(part).equals(data));
  });

  it("a broken connection leaves a finished prefix, and a second call completes the file", async () => {
    const part = join(dir, "resume.part");
    breakFrom = 6 * MB;
    await assert.rejects(rangeDownload(url, {}, part, data.length, () => {}));
    const kept = statSync(part).size;
    assert.ok(kept > 0 && kept < data.length, `kept ${kept}`);
    assert.ok(readFileSync(part).equals(data.subarray(0, kept)), "the kept bytes are right");
    breakFrom = Infinity;
    let got = 0;
    await rangeDownload(url, {}, part, data.length, (n) => (got += n), kept);
    assert.equal(got, data.length - kept);
    assert.ok(readFileSync(part).equals(data));
  });
});
