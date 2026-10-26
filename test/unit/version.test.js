import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BIN = new URL("../../bin/quark.js", import.meta.url).pathname;
const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);

describe("--version", () => {
  it("prints the package version without starting Chrome", () => {
    const r = spawnSync(process.execPath, [BIN, "--version"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), `quark ${version}`);
  });
});
