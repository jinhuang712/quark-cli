// Transfer failure paths, in-process on a copy of the logged-in profile.
// Every drive write lives under /quark-cli-test-fail-<timestamp>, deleted in `after`.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  copyProfile,
  deleteTestFolder,
  removeProfiles,
  TEST_ROOT,
} from "../helpers/failures-profile.js";

process.env.QUARK_PROFILE = copyProfile();
const { open, resolve } = await import("../../src/session.js");
const { downloadFile, makeFolder, uploadFile } = await import("../../src/transfer.js");
const upload = (await import("../../src/commands/upload.js")).default;

describe("transfer failures", { timeout: 600_000 }, () => {
  let context;
  let page;
  let rootFid;
  const local = mkdtempSync(join(tmpdir(), "quark-fail-local-"));
  const realFetch = globalThis.fetch;

  before(async () => {
    assert.ok(TEST_ROOT.startsWith("quark-cli-test-fail-"));
    ({ context, page } = await open());
    rootFid = await makeFolder(page, "0", TEST_ROOT);
  });

  after(async () => {
    globalThis.fetch = realFetch;
    try {
      await context?.setOffline(false);
      if (page) await deleteTestFolder(page);
    } finally {
      await context?.close();
      removeProfiles();
    }
  });

  describe("download", () => {
    let fid;
    const size = 3 * 1024 * 1024;

    before(async () => {
      const file = join(local, "big.bin");
      writeFileSync(file, randomBytes(size));
      await uploadFile(page, {
        fid: rootFid,
        folderName: TEST_ROOT,
        local: file,
        name: "big.bin",
        size,
      });
      fid = (await resolve(page, `/${TEST_ROOT}/big.bin`)).fid;
    });

    // The download itself runs through Node's fetch, not through the browser, so
    // context.setOffline cannot cut it. Instead the real response body is wrapped so the
    // connection "drops" after 1 MB (same error undici raises on a reset: TypeError terminated),
    // or ends early without an error.
    const cutAfter = (bytes, { error }) => {
      globalThis.fetch = async (...a) => {
        const res = await realFetch(...a);
        let sent = 0;
        const reader = res.body.getReader();
        const body = new ReadableStream({
          async pull(ctrl) {
            if (sent >= bytes) {
              if (error) ctrl.error(new TypeError("terminated"));
              else ctrl.close();
              return reader.cancel().catch(() => {});
            }
            const { done, value } = await reader.read();
            if (done) return ctrl.close();
            sent += value.length;
            ctrl.enqueue(value);
          },
        });
        return { ok: res.ok, status: res.status, body };
      };
    };

    for (const [label, error] of [
      ["connection reset mid-way", true],
      ["stream ending early", false],
    ]) {
      it(`${label}: code network, exit 1, no .part left`, async () => {
        const dir = mkdtempSync(join(local, "dl-"));
        cutAfter(1024 * 1024, { error });
        try {
          await assert.rejects(
            downloadFile(page, context, { fid, dest: join(dir, "big.bin"), size }),
            {
              code: "network",
              exit: 1,
            },
          );
        } finally {
          globalThis.fetch = realFetch;
        }
        assert.deepEqual(readdirSync(dir), [], "neither big.bin nor big.bin.part may remain");
      });
    }

    it("uncut download works (control) and leaves no .part", async () => {
      const dir = mkdtempSync(join(local, "dl-"));
      await downloadFile(page, context, { fid, dest: join(dir, "big.bin"), size });
      assert.deepEqual(readdirSync(dir), ["big.bin"]);
    });
  });

  describe("upload", () => {
    it("going offline mid-tree: network error lists uploaded files and suggests rm of the new directory", async () => {
      const tree = join(local, "tree");
      mkdirSync(tree);
      const names = ["a.bin", "b.bin", "c.bin", "d.bin", "e.bin"];
      for (const n of names) writeFileSync(join(tree, n), randomBytes(4096));
      // Three files go at once, so the fourth only starts after one has finished: cutting the
      // network there leaves at least one file uploaded and the last one never started.
      const progress = (msg) => {
        if (msg.includes("d.bin")) context.setOffline(true);
      };
      let emitted;
      let reported = [];
      await assert.rejects(
        upload.run({ page, args: [tree, `/${TEST_ROOT}`], emit: (r) => (emitted = r), progress }),
        (e) => {
          console.log(
            `upload offline -> ${e.code} exit ${e.exit}\n  ${e.message}\n  next: ${e.next}\n  detail: ${e.detail}`,
          );
          assert.equal(e.code, "network");
          assert.equal(e.exit, 1);
          assert.match(e.message, /已传好 [1-4] 个文件/);
          assert.ok(!e.message.includes("e.bin"), e.message);
          assert.ok(e.next.includes(`quark rm /${TEST_ROOT}/tree --yes`), e.next);
          reported = [...e.message.matchAll(/\/tree\/([a-e])\.bin/g)].map((m) => m[1]);
          return true;
        },
      );
      assert.equal(emitted, undefined);
      assert.ok(reported.length >= 1, "at least one file was reported as uploaded");
      await context.setOffline(false);
      // The tree really is half there: every file the error lists is on the drive, and the
      // last file never started.
      await page.goto("https://pan.quark.cn/list", { waitUntil: "domcontentloaded" });
      for (const n of reported) {
        // eslint-disable-next-line no-await-in-loop
        const node = await resolve(page, `/${TEST_ROOT}/tree/${n}.bin`);
        assert.equal(node.size, 4096);
      }
      await assert.rejects(resolve(page, `/${TEST_ROOT}/tree/e.bin`), { code: "not_found" });
    });

    // This verifies OUR mapping of a guessed capacity message to no_space, not Quark's real
    // wording: the account has space, so the real refusal could not be provoked. The mapping
    // keys on /capacity/i in /file/upload/pre's message, which is an assumption.
    it("capacity refusal on /file/upload/pre maps to no_space, exit 1", async () => {
      const file = join(local, "nospace.bin");
      writeFileSync(file, randomBytes(4096));
      await page.route("**/file/upload/pre*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": "https://pan.quark.cn",
            "access-control-allow-credentials": "true",
          },
          body: JSON.stringify({
            status: 403,
            code: 23008,
            message: "capacity limit[{0}]",
            timestamp: Date.now(),
          }),
        }),
      );
      try {
        await assert.rejects(
          uploadFile(page, {
            fid: rootFid,
            folderName: TEST_ROOT,
            local: file,
            name: "nospace.bin",
            size: 4096,
          }),
          (e) => {
            assert.equal(e.code, "no_space");
            assert.equal(e.exit, 1);
            assert.match(e.detail, /capacity/);
            return true;
          },
        );
      } finally {
        await page.unroute("**/file/upload/pre*");
      }
      await assert.rejects(resolve(page, `/${TEST_ROOT}/nospace.bin`), { code: "not_found" });
      assert.ok(existsSync(file));
    });
  });
});
