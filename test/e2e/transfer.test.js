// Real drive: upload (file, folder tree, instant upload) and download. Slow; needs a logged-in profile.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createSession } from "../helpers/cli.js";

describe("e2e transfer", { timeout: 600_000 }, () => {
  const s = createSession("transfer");
  const R = s.root;
  const stamp = Date.now();
  let a;
  let content;

  before(async () => {
    content = Buffer.concat([Buffer.from(`transfer ${stamp}\n`), randomBytes(2048)]);
    a = s.local("a.bin");
    mkdirSync(join(a, ".."), { recursive: true });
    writeFileSync(a, content);
    assert.equal((await s.q("mkdir", `${R}/up`)).exit, 0);
  });
  after(() => s.cleanup());

  describe("upload", () => {
    test("a file goes into an existing folder; yaml result lists path, size, instant", async () => {
      const res = await s.q("upload", a, `${R}/up`);
      assert.equal(res.exit, 0, res.stderr);
      assert.match(res.stderr, /正在上传/);
      const out = s.yaml(res);
      assert.equal(out.count, 1);
      assert.equal(out.instant_count, 0);
      assert.deepEqual(out.uploaded, [
        { path: `${R}/up/a.bin`, size: content.length, instant: false },
      ]);
      const kids = await s.ls(`${R}/up`);
      assert.deepEqual(
        kids.map((k) => [k.name, k.type, k.size]),
        [["a.bin", "file", content.length]],
      );
    });

    test("identical content under a new name is an instant upload", async () => {
      const copy = s.localFile("copy-of-a.bin", content);
      const out = await s.json("upload", copy, `${R}/up`);
      assert.equal(out.count, 1);
      assert.equal(out.instant_count, 1);
      assert.equal(out.uploaded[0].instant, true);
      assert.deepEqual(await s.names(`${R}/up`), ["a.bin", "copy-of-a.bin"]);
    });

    test("Quark stores ' \" < > as entities: the upload succeeds, reports the stored path, and the original name still finds it", async () => {
      await s.q("mkdir", `${R}/quotes`);
      const f = s.localFile(`it's "q" <a>.txt`, `quotes ${stamp}\n`);
      const out = await s.json("upload", f, `${R}/quotes`);
      const stored = `${R}/quotes/it&#39;s &quot;q&quot; &lt;a&gt;.txt`;
      assert.deepEqual(
        out.uploaded.map((u) => u.path),
        [stored],
      );
      assert.match(out.note, /&#39;/);
      // the same local file again is a clash, found through either spelling
      const again = await s.q("upload", f, `${R}/quotes`);
      assert.equal(again.exit, 1);
      assert.equal(s.err(again).code, "already_exists");
      // lookups take the name as typed
      const info = await s.q("info", `${R}/quotes/it's "q" <a>.txt`, "--raw");
      assert.equal(info.exit, 0, info.stderr);
    });

    test("a folder name Quark refuses is invalid_name (exit 1) and says which characters are not allowed", async () => {
      const res = await s.q("mkdir", `${R}/up/bad"name`);
      assert.equal(res.exit, 1);
      const e = s.err(res);
      assert.equal(e.code, "invalid_name");
      assert.match(e.next, /不能有/);
    });

    test("mkdir with an apostrophe is idempotent", async () => {
      const first = await s.json("mkdir", `${R}/up/o'neil`);
      assert.equal(first.changed, true);
      const second = await s.json("mkdir", `${R}/up/o'neil`);
      assert.equal(second.changed, false);
    });

    test("--raw prints the drive paths", async () => {
      const f = s.localFile("raw.txt", `raw ${stamp}\n`);
      const res = await s.q("upload", f, `${R}/up`, "--raw");
      assert.equal(res.stdout, `${R}/up/raw.txt\n`);
    });

    test("an existing name is already_exists before anything is uploaded", async () => {
      const namesBefore = await s.names(`${R}/up`);
      const res = await s.q("upload", a, `${R}/up`);
      assert.equal(res.exit, 1);
      assert.doesNotMatch(res.stderr, /正在上传/);
      const e = s.err(res);
      assert.equal(e.code, "already_exists");
      assert.match(e.next, /quark rename|quark rm/);
      assert.deepEqual(await s.names(`${R}/up`), namesBefore);
    });

    test("a folder tree is uploaded whole, empty folders included, nothing implicit above it", async () => {
      const root = s.local("tree");
      mkdirSync(join(root, "sub", "deep"), { recursive: true });
      mkdirSync(join(root, "empty"));
      writeFileSync(join(root, "top.txt"), `top ${stamp}\n`);
      writeFileSync(join(root, "sub", "mid.txt"), `mid ${stamp}\n`);
      writeFileSync(join(root, "sub", "deep", "low.txt"), `low ${stamp}\n`);
      const res = await s.q("upload", root, `${R}/up`, "--raw");
      assert.equal(res.exit, 0, res.stderr);
      assert.deepEqual(res.stdout.trim().split("\n").toSorted(), [
        `${R}/up/tree/sub/deep/low.txt`,
        `${R}/up/tree/sub/mid.txt`,
        `${R}/up/tree/top.txt`,
      ]);
      assert.deepEqual(await s.names(`${R}/up/tree`), ["empty", "sub", "top.txt"]);
      assert.deepEqual(await s.names(`${R}/up/tree/sub`), ["deep", "mid.txt"]);
      assert.deepEqual(await s.names(`${R}/up/tree/sub/deep`), ["low.txt"]);
      assert.deepEqual(await s.names(`${R}/up/tree/empty`), []);
    });

    test("uploading a folder whose name exists is already_exists", async () => {
      const res = await s.q("upload", s.local("tree"), `${R}/up`);
      assert.equal(res.exit, 1);
      assert.equal(s.err(res).code, "already_exists");
    });

    test("a missing local path is local_not_found (exit 4)", async () => {
      const res = await s.q("upload", join(s.tmp, "no-such-file"), `${R}/up`);
      assert.equal(res.exit, 4);
      assert.equal(s.err(res).code, "local_not_found");
    });

    test("a missing drive folder is not_found (exit 4) and nothing is created", async () => {
      const f = s.localFile("lonely.txt", "x");
      const res = await s.q("upload", f, `${R}/nope`);
      assert.equal(res.exit, 4);
      const e = s.err(res);
      assert.equal(e.code, "not_found");
      assert.match(e.next, /quark mkdir/);
      assert.ok(!(await s.names(R)).includes("nope"));
    });

    test("a file as the drive folder is not_a_folder; the wrong argument count is usage", async () => {
      const f = s.localFile("other.txt", `other ${stamp}\n`);
      const res = await s.q("upload", f, `${R}/up/a.bin`);
      assert.equal(res.exit, 1);
      assert.equal(s.err(res).code, "not_a_folder");
      for (const args of [[], [f], [f, R, R]]) {
        const bad = await s.q("upload", ...args);
        assert.equal(bad.exit, 2);
        assert.equal(s.err(bad).code, "usage");
      }
    });
  });

  describe("download", () => {
    let out;
    before(() => {
      out = s.local("out");
      mkdirSync(out, { recursive: true });
    });

    test("downloads identical bytes under the same file name", async () => {
      const res = await s.q("download", `${R}/up/a.bin`, out);
      assert.equal(res.exit, 0, res.stderr);
      const data = s.yaml(res);
      assert.equal(data.path, join(out, "a.bin"));
      assert.equal(data.size, content.length);
      assert.ok(readFileSync(join(out, "a.bin")).equals(content));
    });

    test("a multi-part file (12 MB, past the ranged-download threshold) round trips byte for byte", async () => {
      const big = Buffer.concat([Buffer.from(`big ${stamp}\n`), randomBytes(12 * 1024 * 1024)]);
      const up = await s.q("upload", s.localFile("big.bin", big), `${R}/up`);
      assert.equal(up.exit, 0, up.stderr);
      const down = await s.q("download", `${R}/up/big.bin`, out);
      assert.equal(down.exit, 0, down.stderr);
      assert.ok(readFileSync(join(out, "big.bin")).equals(big));
      assert.deepEqual(
        readdirSync(out).filter((n) => n.endsWith(".part")),
        [],
      );
    });

    test("an instantly uploaded copy downloads identical too; --raw prints the local path", async () => {
      const res = await s.q("download", `${R}/up/copy-of-a.bin`, out, "--raw");
      assert.equal(res.exit, 0, res.stderr);
      assert.equal(res.stdout, `${join(out, "copy-of-a.bin")}\n`);
      assert.ok(readFileSync(join(out, "copy-of-a.bin")).equals(content));
    });

    test("an existing local file is already_exists and is left alone", async () => {
      const res = await s.q("download", `${R}/up/a.bin`, out);
      assert.equal(res.exit, 1);
      assert.equal(s.err(res).code, "already_exists");
      assert.ok(readFileSync(join(out, "a.bin")).equals(content));
    });

    test("a missing local directory is local_not_found (exit 4) and is not created", async () => {
      const dir = join(s.tmp, "no-such-dir");
      const res = await s.q("download", `${R}/up/raw.txt`, dir);
      assert.equal(res.exit, 4);
      assert.equal(s.err(res).code, "local_not_found");
      assert.equal(existsSync(dir), false);
    });

    test("a file as the local directory is not_a_folder", async () => {
      const res = await s.q("download", `${R}/up/raw.txt`, a);
      assert.equal(res.exit, 1);
      assert.equal(s.err(res).code, "not_a_folder");
    });

    test("a drive folder is an error (exit 1) and a missing drive path is not_found (exit 4)", async () => {
      const dir = await s.q("download", `${R}/up/tree`, out);
      assert.equal(dir.exit, 1);
      const e = s.err(dir);
      assert.equal(e.code, "error");
      assert.match(e.next, /quark ls/);
      const gone = await s.q("download", `${R}/up/nope.txt`, out);
      assert.equal(gone.exit, 4);
      assert.equal(s.err(gone).code, "not_found");
      assert.deepEqual(readdirSync(out).toSorted(), ["a.bin", "big.bin", "copy-of-a.bin"]);
    });

    test("the wrong argument count is usage", async () => {
      for (const args of [[], [`${R}/up/a.bin`]]) {
        const res = await s.q("download", ...args);
        assert.equal(res.exit, 2);
        assert.equal(s.err(res).code, "usage");
      }
    });
  });
});
