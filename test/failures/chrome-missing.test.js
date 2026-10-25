// chrome_missing: QUARK_CHROME_PATH pointing at nothing, through the real CLI.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';

const BIN = new URL('../../bin/quark.js', import.meta.url).pathname;

function quark(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QUARK_CHROME_PATH: '/nonexistent/chrome', QUARK_PROFILE: join(tmpdir(), 'quark-fail-chrome-missing-profile') },
  });
}

describe('chrome_missing', () => {
  for (const cmd of [['whoami'], ['login']]) {
    it(`quark ${cmd[0]} fails with chrome_missing, exit 1`, () => {
      const r = quark(cmd);
      assert.equal(r.status, 1, r.stderr);
      const err = YAML.parse(r.stderr);
      assert.equal(err.code, 'chrome_missing');
      assert.equal(err.exit, 1);
      assert.match(err.next, /Chrome/);
      assert.match(err.next, /QUARK_CHROME_PATH|安装/);
      assert.equal(r.stdout, '');
    });
  }
});
