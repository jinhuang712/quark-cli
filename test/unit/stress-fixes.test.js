import { test } from "node:test";
import assert from "node:assert/strict";
import { errorOf, runQuark } from "../helpers/cli.js";
import { normalize } from "../../src/browse.js";
import { openError } from "../../src/session.js";
import { CODES } from "../../src/errors.js";

const run = (...args) =>
  runQuark(args, { env: { QUARK_PROFILE: "/nonexistent/quark-unit-profile" } });

test("a drive path must start with /: a bare word is a usage error, never a top-level name", () => {
  assert.throws(
    () => normalize("foo"),
    (e) => e.code === "usage" && /xargs -0/.test(e.next),
  );
  assert.throws(
    () => normalize("foo/bar"),
    (e) => e.code === "usage",
  );
  assert.equal(normalize("/a//b/"), "/a/b");
  assert.equal(normalize("/"), "/");
});

test("openError tells a busy profile from a missing Chrome, and leaves other errors alone", () => {
  const busy = openError(
    new Error(
      "browserType.launchPersistentContext: Failed to create a ProcessSingleton for your profile directory",
    ),
  );
  assert.equal(busy.code, "profile_busy");
  assert.equal(busy.exit, 1);
  assert.match(busy.next, /一条 quark 命令/);

  const missing = openError(
    new Error("browserType.launchPersistentContext: Executable doesn't exist at /nope/chrome"),
  );
  assert.equal(missing.code, "chrome_missing");
  assert.match(missing.next, /QUARK_CHROME_PATH/);

  const other = new Error("something else broke");
  assert.equal(openError(other), other);
});

test("profile_busy and invalid_name have their own exit codes in the table", () => {
  assert.equal(CODES.profile_busy, 1);
  assert.equal(CODES.invalid_name, 1);
});

test('a name that starts with a dash gets a hint about -- instead of a bare "unknown option"', async () => {
  const res = await run("ls", "-x.txt");
  assert.equal(res.exit, 2);
  const e = errorOf(res);
  assert.equal(e.code, "usage");
  assert.match(e.next, /加 --/);
});
