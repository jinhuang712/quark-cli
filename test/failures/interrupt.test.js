// Ctrl-C in the middle of a command: exit 130 and no Playwright noise, through the real CLI.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyProfile, removeProfiles } from "../helpers/failures-profile.js";

const BIN = new URL("../../bin/quark.js", import.meta.url).pathname;

after(removeProfiles);

describe("interrupt", () => {
  it("SIGINT while Chrome is starting exits 130 with nothing on stderr", async () => {
    const child = spawn(process.execPath, [BIN, "ls", "/"], {
      env: { ...process.env, QUARK_PROFILE: copyProfile() },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d;
    });
    // A command takes 1.5 s or more just to start Chrome, so this lands mid-run.
    await new Promise((done) => setTimeout(done, 700));
    child.kill("SIGINT");
    const status = await new Promise((done) => child.on("close", done));
    assert.equal(status, 130, err);
    assert.equal(err, "");
  });
});
