import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The jar path follows QUARK_PROFILE, so point it at a throwaway directory before loading.
process.env.QUARK_PROFILE = join(mkdtempSync(join(tmpdir(), "quark-jar-")), "profile");
const { HttpSession, JAR_PATH, loadJar, removeJar, saveJar } = await import("../../src/jar.js");

const cookie = (name, domain, extra = {}) => ({
  name,
  value: `v-${name}`,
  domain,
  expires: -1,
  ...extra,
});

describe("cookie jar", () => {
  it("is absent until saved, then round-trips, then can be removed", () => {
    assert.equal(loadJar(), null);
    saveJar({ cookies: [cookie("a", ".quark.cn")], ua: "UA" });
    assert.equal(loadJar().cookies[0].name, "a");
    removeJar();
    assert.equal(loadJar(), null);
  });

  it("is only readable by its owner", async () => {
    saveJar({ cookies: [], ua: "UA" });
    const { statSync } = await import("node:fs");
    assert.equal(statSync(JAR_PATH).mode & 0o077, 0);
    removeJar();
  });

  it("a file that is not a jar counts as no jar", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(JAR_PATH, "not json");
    assert.equal(loadJar(), null);
    removeJar();
  });

  it("sends only unexpired cookies whose domain covers the host", () => {
    const now = Date.now() / 1000;
    const s = new HttpSession({
      ua: "UA",
      cookies: [
        cookie("kept", ".quark.cn"),
        cookie("exact", "drive-pc.quark.cn"),
        cookie("other", ".example.com"),
        cookie("old", ".quark.cn", { expires: now - 10 }),
        cookie("fresh", ".quark.cn", { expires: now + 1000 }),
      ],
    });
    assert.equal(
      s.cookieHeader("https://drive-pc.quark.cn/1/clouddrive/file/sort"),
      "kept=v-kept; exact=v-exact; fresh=v-fresh",
    );
  });

  it("keeps cookies Quark sets back, replacing values by name and domain", () => {
    saveJar({ cookies: [], ua: "UA" });
    const s = new HttpSession({ ua: "UA", cookies: [cookie("__puus", ".quark.cn")] });
    s.absorb(
      ["__puus=rotated; Domain=.quark.cn; Max-Age=3600; Path=/", "extra=1; Path=/"],
      "https://drive-pc.quark.cn/x",
    );
    assert.equal(s.jar.cookies.find((c) => c.name === "__puus").value, "rotated");
    assert.equal(s.jar.cookies.find((c) => c.name === "extra").domain, "drive-pc.quark.cn");
    assert.equal(loadJar().cookies.find((c) => c.name === "__puus").value, "rotated");
    removeJar();
  });
});
