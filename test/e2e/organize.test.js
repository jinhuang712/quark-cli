// Real drive: mkdir, mv, rename, rm. Slow; needs a logged-in profile (see test/helpers/cli.js).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../helpers/cli.js";

describe("e2e organize", { timeout: 600_000 }, () => {
  const s = createSession("organize");
  const R = s.root;
  let file;

  before(async () => {
    file = s.localFile("f.txt", `organize ${Date.now()}\n`);
  });
  after(() => s.cleanup());

  describe("mkdir", () => {
    test("creates nested folders in one go and is idempotent", async () => {
      const first = await s.q("mkdir", `${R}/a/b/c`);
      assert.equal(first.exit, 0, first.stderr);
      assert.deepEqual(s.yaml(first), { path: `${R}/a/b/c`, type: "dir", changed: true });
      const again = await s.q("mkdir", `${R}/a/b/c`);
      assert.equal(again.exit, 0, again.stderr);
      assert.equal(s.yaml(again).changed, false);
      const partial = await s.json("mkdir", `${R}/a/b/d`);
      assert.equal(partial.changed, true);
      assert.deepEqual(await s.names(`${R}/a/b`), ["c", "d"]);
    });

    test("normalizes sloppy paths and prints the path with --raw", async () => {
      const res = await s.q("mkdir", `${R}//a///raw/`, "--raw");
      assert.equal(res.exit, 0, res.stderr);
      assert.equal(res.stdout, `${R}/a/raw\n`);
    });

    test("--full adds the folder id", async () => {
      const res = await s.json("mkdir", `${R}/a/full`, "--full");
      assert.equal(res.changed, true);
      assert.match(res.fid, /^[0-9a-f]{20,}$/);
    });

    test("usage errors: no argument, two arguments, the root", async () => {
      for (const args of [[], [`${R}/x`, `${R}/y`], ["/"]]) {
        const res = await s.q("mkdir", ...args);
        assert.equal(res.exit, 2, args.join(" "));
        assert.equal(s.err(res).code, "usage");
      }
      assert.ok(!(await s.names(R)).includes("x"));
    });

    test("a file in the way is already_exists (exit 1), also in the middle of a path", async () => {
      const up = await s.q("upload", file, R);
      assert.equal(up.exit, 0, up.stderr);
      for (const path of [`${R}/f.txt`, `${R}/f.txt/deeper/still`]) {
        const res = await s.q("mkdir", path);
        assert.equal(res.exit, 1, path);
        const e = s.err(res);
        assert.equal(e.code, "already_exists");
        assert.ok(e.next);
      }
      const kids = await s.ls(R);
      assert.equal(kids.find((k) => k.name === "f.txt").type, "file");
    });
  });

  describe("rename", () => {
    test("renames in place, reports from and path, and the old name is gone", async () => {
      await s.q("mkdir", `${R}/ren`);
      await s.q("upload", file, `${R}/ren`);
      const res = await s.q("rename", `${R}/ren/f.txt`, "g.txt");
      assert.equal(res.exit, 0, res.stderr);
      assert.deepEqual(s.yaml(res), {
        from: `${R}/ren/f.txt`,
        path: `${R}/ren/g.txt`,
        type: "file",
        changed: true,
      });
      assert.deepEqual(await s.names(`${R}/ren`), ["g.txt"]);
      const raw = await s.q("rename", `${R}/ren/g.txt`, "h.txt", "--raw");
      assert.equal(raw.stdout, `${R}/ren/h.txt\n`, raw.stderr);
    });

    test("renames a folder", async () => {
      await s.q("mkdir", `${R}/ren/dir1`);
      const res = await s.json("rename", `${R}/ren/dir1`, "dir2");
      assert.equal(res.type, "dir");
      assert.deepEqual(await s.names(`${R}/ren`), ["dir2", "h.txt"]);
    });

    test("a name that is already taken is already_exists and changes nothing", async () => {
      await s.q("mkdir", `${R}/ren/taken`);
      const res = await s.q("rename", `${R}/ren/dir2`, "taken");
      assert.equal(res.exit, 1, res.stderr);
      assert.equal(s.err(res).code, "already_exists");
      assert.deepEqual(await s.names(`${R}/ren`), ["dir2", "h.txt", "taken"]);
    });

    test("a slash, an empty name, or the wrong argument count is usage (exit 2)", async () => {
      for (const args of [
        [`${R}/ren/h.txt`, "a/b"],
        [`${R}/ren/h.txt`, "  "],
        [`${R}/ren/h.txt`],
        [],
      ]) {
        const res = await s.q("rename", ...args);
        assert.equal(res.exit, 2, JSON.stringify(args));
        assert.equal(s.err(res).code, "usage");
      }
      assert.ok((await s.names(`${R}/ren`)).includes("h.txt"));
    });

    test("a missing path is not_found (exit 4); the root is usage", async () => {
      const res = await s.q("rename", `${R}/ren/nope`, "x");
      assert.equal(res.exit, 4, res.stderr);
      assert.equal(s.err(res).code, "not_found");
      const root = await s.q("rename", "/", "x");
      assert.equal(root.exit, 2);
    });
  });

  describe("mv", () => {
    before(async () => {
      await s.q("mkdir", `${R}/mv/src/inner`);
      await s.q("mkdir", `${R}/mv/dest`);
      await s.q("upload", file, `${R}/mv/src`);
    });

    test("moves a file into an existing folder; name unchanged", async () => {
      const res = await s.q("mv", `${R}/mv/src/f.txt`, `${R}/mv/dest`);
      assert.equal(res.exit, 0, res.stderr);
      assert.deepEqual(s.yaml(res), {
        from: `${R}/mv/src/f.txt`,
        path: `${R}/mv/dest/f.txt`,
        type: "file",
        changed: true,
      });
      assert.deepEqual(await s.names(`${R}/mv/dest`), ["f.txt"]);
      assert.deepEqual(await s.names(`${R}/mv/src`), ["inner"]);
    });

    test("moves a folder, and --raw prints the new path", async () => {
      const res = await s.q("mv", `${R}/mv/src/inner`, `${R}/mv/dest`, "--raw");
      assert.equal(res.stdout, `${R}/mv/dest/inner\n`);
    });

    test("same name at the destination is already_exists and nothing moves", async () => {
      const mk = await s.q("mkdir", `${R}/mv/src/f.txt`);
      assert.equal(mk.exit, 0, `mkdir: ${mk.stderr}`);
      const res = await s.q("mv", `${R}/mv/src/f.txt`, `${R}/mv/dest`);
      assert.equal(res.exit, 1, res.stderr);
      assert.equal(s.err(res).code, "already_exists");
      assert.deepEqual(await s.names(`${R}/mv/src`), ["f.txt"]);
      assert.deepEqual(await s.names(`${R}/mv/dest`), ["f.txt", "inner"]);
    });

    test("moving a folder into itself or its own child is usage (exit 2)", async () => {
      await s.q("mkdir", `${R}/mv/self/child`);
      for (const dest of [`${R}/mv/self`, `${R}/mv/self/child`]) {
        const res = await s.q("mv", `${R}/mv/self`, dest);
        assert.equal(res.exit, 2, `${dest}\n${res.stderr}`);
        assert.equal(s.err(res).code, "usage");
      }
      assert.deepEqual(await s.names(`${R}/mv/self`), ["child"]);
    });

    test("a file as destination is not_a_folder (exit 1)", async () => {
      const res = await s.q("mv", `${R}/mv/src/f.txt`, `${R}/mv/dest/f.txt`);
      assert.equal(res.exit, 1, res.stderr);
      assert.equal(s.err(res).code, "not_a_folder");
    });

    test("a missing source or destination is not_found (exit 4)", async () => {
      const a = await s.q("mv", `${R}/mv/nope`, `${R}/mv/dest`);
      assert.equal(a.exit, 4);
      assert.equal(s.err(a).code, "not_found");
      const b = await s.q("mv", `${R}/mv/src/f.txt`, `${R}/mv/nowhere`);
      assert.equal(b.exit, 4);
      assert.equal(s.err(b).code, "not_found");
      assert.deepEqual(await s.names(`${R}/mv/src`), ["f.txt"]);
    });

    test("the wrong argument count is usage (exit 2)", async () => {
      for (const args of [[], [`${R}/mv/src`], [`${R}/a`, `${R}/b`, `${R}/c`]]) {
        const res = await s.q("mv", ...args);
        assert.equal(res.exit, 2);
        assert.equal(s.err(res).code, "usage");
      }
    });
  });

  describe("rm", () => {
    before(async () => {
      await s.q("mkdir", `${R}/rm/one/sub`);
      await s.q("mkdir", `${R}/rm/two`);
      await s.q("upload", file, `${R}/rm/one/sub`);
      await s.q("upload", file, `${R}/rm/two`);
    });

    test("without --yes nothing is deleted: confirmation_required, exit 2, with the plan", async () => {
      const res = await s.q("rm", `${R}/rm/one`, "--json");
      assert.equal(res.exit, 2);
      assert.equal(res.stdout, "");
      const e = s.err(res);
      assert.equal(e.code, "confirmation_required");
      assert.equal(e.exit, 2);
      assert.deepEqual(e.plan, { paths: [`${R}/rm/one`], folders: 2, files: 1 });
      assert.match(e.next, /--yes/);
      assert.deepEqual(await s.names(`${R}/rm`), ["one", "two"]);
    });

    test("a path without the leading / is a usage error and deletes nothing, even with --yes", async () => {
      // `xargs` splits "my file" into two words; a word must never be read as /my.
      const res = await s.q("rm", "one", "--yes");
      assert.equal(res.exit, 2);
      assert.equal(s.err(res).code, "usage");
      assert.deepEqual(await s.names(`${R}/rm`), ["one", "two"]);
      const top = await s.q("rm", R.slice(1), "--yes");
      assert.equal(top.exit, 2);
      assert.equal((await s.q("info", R, "--raw")).exit, 0, "the test root must still exist");
    });

    test("the plan is in yaml too and counts several paths", async () => {
      const res = await s.q("rm", `${R}/rm/one`, `${R}/rm/two`);
      assert.equal(res.exit, 2);
      const e = s.err(res);
      assert.deepEqual(e.plan, { paths: [`${R}/rm/one`, `${R}/rm/two`], folders: 3, files: 2 });
    });

    test("the root is refused, with or without --yes, as usage", async () => {
      for (const args of [["/"], ["/", "--yes"], ["//", "--yes"], [`${R}/rm/two`, "/", "--yes"]]) {
        const res = await s.q("rm", ...args);
        assert.equal(res.exit, 2, args.join(" "));
        assert.equal(s.err(res).code, "usage");
      }
      assert.deepEqual(await s.names(`${R}/rm`), ["one", "two"]);
    });

    test("no path is usage", async () => {
      const res = await s.q("rm", "--yes");
      assert.equal(res.exit, 2);
      assert.equal(s.err(res).code, "usage");
    });

    test("nothing is deleted when one of several paths is missing", async () => {
      const res = await s.q("rm", `${R}/rm/two`, `${R}/rm/missing`, "--yes");
      assert.equal(res.exit, 4, res.stderr);
      assert.equal(s.err(res).code, "not_found");
      assert.deepEqual(await s.names(`${R}/rm`), ["one", "two"]);
    });

    test("with --yes it deletes several paths at once and reports them", async () => {
      const res = await s.q("rm", `${R}/rm/one`, `${R}/rm/two`, "--yes", "--json");
      assert.equal(res.exit, 0, res.stderr);
      const out = JSON.parse(res.stdout);
      assert.deepEqual(out.deleted, [`${R}/rm/one`, `${R}/rm/two`]);
      assert.equal(out.folders, 3);
      assert.equal(out.files, 2);
      assert.equal(out.changed, true);
      assert.match(out.note, /回收站/);
      assert.deepEqual(await s.names(`${R}/rm`), []);
    });

    test("--raw prints one deleted path per line; a second delete is not_found", async () => {
      await s.q("mkdir", `${R}/rm/x`);
      await s.q("mkdir", `${R}/rm/y`);
      const res = await s.q("rm", `${R}/rm/x`, `${R}/rm/y`, "--yes", "--raw");
      assert.equal(res.stdout, `${R}/rm/x\n${R}/rm/y\n`);
      const again = await s.q("rm", `${R}/rm/x`, "--yes");
      assert.equal(again.exit, 4);
    });
  });
});
