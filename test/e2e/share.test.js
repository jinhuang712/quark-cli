// Real drive: share, shares, unshare, save. Slow; needs a logged-in profile.
// Only shares created here are ever listed in assertions or cancelled; other shares of the account
// are never printed (assertions look up the test's own link in the list and nothing else).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../helpers/cli.js";

const LINK = /^https:\/\/pan\.quark\.cn\/s\/[0-9a-zA-Z]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

describe("e2e share", { timeout: 600_000 }, () => {
  const s = createSession("share");
  const R = s.root;
  const stamp = Date.now();
  const fileName = `quark-e2e-${stamp}.txt`; // the share title is the file name; cleanup sweeps this prefix
  let plain;
  let coded;

  // Looks up one of the test's own shares without exposing any other entry.
  const mine = async (link) => (await s.json("shares")).find((x) => x.link === link);

  before(async () => {
    const f = s.localFile(fileName, `share ${stamp}\n`);
    assert.equal((await s.q("mkdir", `${R}/s`)).exit, 0);
    const up = await s.q("upload", f, `${R}/s`);
    assert.equal(up.exit, 0, up.stderr);
  });
  after(() => s.cleanup());

  describe("share", () => {
    test("creates a 1-day link: yaml has link, days and files, and no code by default", async () => {
      const res = await s.q("share", `${R}/s/${fileName}`, "--days", "1");
      assert.equal(res.exit, 0, res.stderr);
      const out = s.yaml(res);
      assert.match(out.link, LINK);
      s.track(out.link);
      assert.equal(out.days, 1);
      assert.deepEqual(out.files, [`${R}/s/${fileName}`]);
      assert.ok(!("code" in out));
      plain = out.link;
    });

    test("--raw prints just the link; --code adds a 4 character code on the second line", async () => {
      const res = await s.q("share", `${R}/s/${fileName}`, "--days", "1", "--code", "--raw");
      assert.equal(res.exit, 0, res.stderr);
      const [link, code, extra] = res.stdout.split("\n");
      assert.match(link, LINK);
      s.track(link);
      assert.match(code, /^[0-9a-zA-Z]{4}$/);
      assert.equal(extra, "");
      coded = { link, code };
      const raw = await s.q("share", `${R}/s/${fileName}`, "--days", "1", "--raw");
      const lines = raw.stdout.trim().split("\n");
      assert.equal(lines.length, 1);
      assert.match(lines[0], LINK);
      s.track(lines[0]);
    });

    test("--code in json shows link and code; --full adds the drive fields", async () => {
      const out = await s.json("share", `${R}/s/${fileName}`, "--days", "1", "--code", "--full");
      s.track(out.share_url ?? "");
      assert.match(out.share_url, LINK);
      assert.match(out.passcode, /^[0-9a-zA-Z]{4}$/);
      assert.equal(out.days, 1);
      assert.ok(out.share_id && out.task_id);
    });

    test("--days validation: only 1, 7, 30 and 0 are accepted, before anything is created", async () => {
      for (const days of ["2", "abc", "-1", "", "07"]) {
        const res = await s.q("share", `${R}/s/${fileName}`, "--days", days);
        assert.equal(res.exit, 2, `--days ${JSON.stringify(days)}`);
        const e = s.err(res);
        assert.equal(e.code, "usage");
        assert.match(e.error, /--days/);
      }
    });

    test("a missing path is not_found (exit 4); no path is usage (exit 2)", async () => {
      const gone = await s.q("share", `${R}/s/nope.txt`, "--days", "1");
      assert.equal(gone.exit, 4);
      assert.equal(s.err(gone).code, "not_found");
      const none = await s.q("share", "--days", "1");
      assert.equal(none.exit, 2);
      assert.equal(s.err(none).code, "usage");
    });
  });

  describe("shares", () => {
    test("lists the new share with name, link, created and remaining (and code when set)", async () => {
      const all = await s.json("shares");
      const a = all.find((x) => x.link === plain);
      assert.ok(a, "the plain share is listed");
      assert.deepEqual(Object.keys(a), ["name", "link", "created", "remaining"]);
      assert.equal(a.name, fileName);
      assert.match(a.created, ISO);
      assert.match(a.remaining, /^(1d|\d+h)$/);
      const c = all.find((x) => x.link === coded.link);
      assert.ok(c, "the coded share is listed");
      assert.equal(c.code, coded.code);
      assert.deepEqual(Object.keys(c), ["name", "link", "code", "created", "remaining"]);
    });

    test("yaml equals json for the same entry; markdown is a table row; raw has links", async () => {
      const yaml = s.yaml(await s.q("shares")).find((x) => x.link === plain);
      assert.deepEqual(yaml, await mine(plain));
      const md = (await s.q("shares", "--markdown")).stdout.split("\n");
      assert.equal(md[0].startsWith("| name | link |"), true);
      assert.ok(md.some((l) => l.includes(plain)));
      const raw = (await s.q("shares", "--raw")).stdout.split("\n");
      assert.ok(raw.includes(plain));
      assert.ok(raw.every((l) => l === "" || LINK.test(l)));
    });

    test("--full entries carry the drive fields", async () => {
      const full = (await s.json("shares", "--full")).find(
        (x) => x.pwd_id && plain.endsWith(x.pwd_id),
      );
      assert.ok(full);
      assert.ok("share_id" in full);
    });
  });

  describe("save", () => {
    before(async () => {
      assert.equal((await s.q("mkdir", `${R}/in`)).exit, 0);
      assert.equal((await s.q("mkdir", `${R}/in-clash`)).exit, 0);
      assert.equal((await s.q("upload", s.local(fileName), `${R}/in-clash`)).exit, 0);
    });

    test("your own share is refused by Quark (exit 5) and nothing is saved", async () => {
      const res = await s.q("save", plain, `${R}/in`);
      assert.equal(res.exit, 5, res.stderr);
      assert.equal(s.err(res).code, "refused");
      assert.deepEqual(await s.names(`${R}/in`), []);
    });

    test("a same-name item is already_exists, reported before anything is saved", async () => {
      const res = await s.q("save", plain, `${R}/in-clash`);
      assert.equal(res.exit, 1);
      const e = s.err(res);
      assert.equal(e.code, "already_exists");
      assert.ok(e.error.includes(fileName));
      assert.deepEqual(await s.names(`${R}/in-clash`), [fileName]);
    });

    test("a missing target folder is not_found (exit 4); a file as target is not_a_folder", async () => {
      const gone = await s.q("save", plain, `${R}/no-such-dir`);
      assert.equal(gone.exit, 4);
      const e = s.err(gone);
      assert.equal(e.code, "not_found");
      assert.match(e.next, /quark mkdir/);
      const file = await s.q("save", plain, `${R}/in-clash/${fileName}`);
      assert.equal(file.exit, 1);
      assert.equal(s.err(file).code, "not_a_folder");
    });

    test("usage errors: wrong argument count, not a Quark link, --code without a value", async () => {
      for (const args of [
        [],
        [plain],
        [plain, `${R}/in`, `${R}/in`],
        ["https://example.com/x", `${R}/in`],
        ["not a link", `${R}/in`],
      ]) {
        const res = await s.q("save", ...args);
        assert.equal(res.exit, 2, JSON.stringify(args));
        assert.equal(s.err(res).code, "usage");
      }
      const noValue = await s.q("save", plain, `${R}/in`, "--code");
      assert.equal(noValue.exit, 2);
    });
  });

  describe("unshare", () => {
    test("cancels a share: changed true, gone from shares, the file is untouched", async () => {
      const res = await s.q("unshare", plain);
      assert.equal(res.exit, 0, res.stderr);
      assert.deepEqual(s.yaml(res), { link: plain, changed: true });
      assert.equal(await mine(plain), undefined);
      assert.ok((await s.names(`${R}/s`)).includes(fileName));
    });

    test("unsharing it again is share_gone (exit 4), and so is saving it", async () => {
      const again = await s.q("unshare", plain);
      assert.equal(again.exit, 4);
      const e = s.err(again);
      assert.equal(e.code, "share_gone");
      assert.match(e.next, /quark shares/);
      const save = await s.q("save", plain, `${R}/in`);
      assert.equal(save.exit, 4);
      assert.equal(s.err(save).code, "share_gone");
    });

    test("--raw prints the link; the second created share is cancelled too", async () => {
      const res = await s.q("unshare", coded.link, "--raw");
      assert.equal(res.stdout, `${coded.link}\n`);
      assert.equal(await mine(coded.link), undefined);
    });

    test("usage errors: no link, two links, not a Quark link", async () => {
      for (const args of [[], [plain, plain], ["https://example.com/x"], ["nonsense"]]) {
        const res = await s.q("unshare", ...args);
        assert.equal(res.exit, 2, JSON.stringify(args));
        assert.equal(s.err(res).code, "usage");
      }
    });
  });
});
