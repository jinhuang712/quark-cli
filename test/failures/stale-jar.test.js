// A saved session that Quark no longer accepts: the command renews it through Chrome and still
// succeeds, with the real CLI on a copy of the logged-in profile.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { copyProfile, removeProfiles } from "../helpers/failures-profile.js";

const BIN = new URL("../../bin/quark.js", import.meta.url).pathname;
after(removeProfiles);

const quark = (profile, ...args) =>
  spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    env: { ...process.env, QUARK_PROFILE: profile },
  });

describe("stale session file", () => {
  it("expired cookies: a read command renews the file through Chrome and succeeds", () => {
    const profile = copyProfile();
    const jar = `${profile}.cookies.json`;
    // First run: no jar yet, so Chrome starts once and writes it.
    assert.equal(quark(profile, "whoami").status, 0);
    assert.ok(existsSync(jar), "the first Chrome run saves the session file");
    const good = JSON.parse(readFileSync(jar, "utf8"));

    for (const c of good.cookies) c.value = "expired";
    writeFileSync(jar, JSON.stringify(good));
    const res = quark(profile, "whoami");
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /^name: /m);
    const renewed = JSON.parse(readFileSync(jar, "utf8"));
    assert.ok(
      renewed.cookies.some((c) => c.value !== "expired"),
      "the file holds working cookies again",
    );
  });

  it("no session file at all: the command works and creates one", () => {
    const profile = copyProfile();
    const res = quark(profile, "whoami");
    assert.equal(res.status, 0, res.stderr);
    assert.ok(existsSync(`${profile}.cookies.json`));
  });

  it("logged out (empty profile, no file): not_logged_in, exit 3, and no file is left", () => {
    const profile = `${copyProfile()}-empty`;
    const res = quark(profile, "ls", "/");
    assert.equal(res.status, 3, res.stderr);
    assert.match(res.stderr, /code: not_logged_in/);
    assert.equal(existsSync(`${profile}.cookies.json`), false);
  });
});
