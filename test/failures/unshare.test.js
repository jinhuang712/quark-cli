// unshare of a link that is not in my shares, through the real CLI on a profile copy.
// A random 12-hex id is a link that never existed, so Quark answers "gone", not "someone else's".
// The other branch (a live link of another account, code not_found) needs a second account's
// share and is NOT covered; see README.md.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import YAML from 'yaml';
import { copyProfile, removeProfiles } from '../helpers/failures-profile.js';

const BIN = new URL('../../bin/quark.js', import.meta.url).pathname;

describe('unshare of a link that is not mine', { timeout: 120_000 }, () => {
  after(removeProfiles);

  it('a never-existing link is share_gone, exit 4, and nothing is changed', () => {
    const link = `https://pan.quark.cn/s/${randomBytes(6).toString('hex')}`;
    const r = spawnSync(process.execPath, [BIN, 'unshare', link], {
      encoding: 'utf8',
      env: { ...process.env, QUARK_PROFILE: copyProfile() },
    });
    const err = YAML.parse(r.stderr);
    console.log(`unshare ${link} -> exit ${r.status}\n${r.stderr}`);
    assert.equal(r.status, 4, r.stderr);
    assert.equal(err.code, 'share_gone');
    assert.equal(err.exit, 4);
    assert.match(err.next, /quark shares/);
    assert.equal(r.stdout, '');
  });

  it('a malformed link is a usage error, exit 2', () => {
    const r = spawnSync(process.execPath, [BIN, 'unshare', 'https://example.com/x'], {
      encoding: 'utf8',
      env: { ...process.env, QUARK_PROFILE: copyProfile() },
    });
    assert.equal(r.status, 2, r.stderr);
    assert.equal(YAML.parse(r.stderr).code, 'usage');
  });
});
