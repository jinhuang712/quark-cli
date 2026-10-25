// Real drive: ls, search, info, whoami in every output format, plus account behaviour.
// Slow; needs a logged-in profile (see test/helpers/cli.js).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import { copyProfile, createSession, runQuark } from '../helpers/cli.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

describe('e2e browse', { timeout: 600_000 }, () => {
  const s = createSession('browse');
  const R = s.root;
  const stamp = `qe2e${Date.now()}`;
  let txt;

  before(async () => {
    txt = s.localFile(`${stamp}.txt`, `browse ${stamp}\n`);
    assert.equal((await s.q('mkdir', `${R}/dir`)).exit, 0);
    assert.equal((await s.q('mkdir', `${R}/dir/folder_${stamp}`)).exit, 0);
    const up = await s.q('upload', txt, `${R}/dir`);
    assert.equal(up.exit, 0, up.stderr);
  });
  after(() => s.cleanup());

  describe('ls', () => {
    test('yaml (default): folders first, curated fields, ISO times', async () => {
      const res = await s.q('ls', `${R}/dir`);
      assert.equal(res.exit, 0, res.stderr);
      assert.equal(res.stderr, '');
      const list = s.yaml(res);
      assert.equal(list.length, 2);
      assert.deepEqual(Object.keys(list[0]), ['name', 'path', 'type', 'size', 'modified']);
      assert.equal(list[0].type, 'dir');
      assert.equal(list[0].size, null);
      assert.equal(list[0].path, `${R}/dir/folder_${stamp}`);
      assert.equal(list[1].type, 'file');
      assert.ok(Number.isInteger(list[1].size) && list[1].size > 0);
      assert.match(list[1].modified, ISO);
    });

    test('json equals the yaml data', async () => {
      const yaml = s.yaml(await s.q('ls', `${R}/dir`));
      const json = await s.json('ls', `${R}/dir`);
      assert.deepEqual(json, yaml);
    });

    test('markdown is a table', async () => {
      const res = await s.q('ls', `${R}/dir`, '--markdown');
      assert.equal(res.exit, 0);
      const lines = res.stdout.trim().split('\n');
      assert.equal(lines[0], '| name | path | type | size | modified |');
      assert.equal(lines[1], '| --- | --- | --- | --- | --- |');
      assert.equal(lines.length, 4);
    });

    test('raw is one full path per line and nothing else', async () => {
      const res = await s.q('ls', `${R}/dir`, '--raw');
      assert.equal(res.stdout, `${R}/dir/folder_${stamp}\n${R}/dir/${stamp}.txt\n`);
      assert.equal(res.stderr, '');
    });

    test('--full returns the drive fields; --full --raw is unchanged', async () => {
      const full = await s.json('ls', `${R}/dir`, '--full');
      assert.equal(full.length, 2);
      for (const key of ['fid', 'file_name', 'pdir_fid']) assert.ok(key in full[0], key);
      assert.ok(Object.keys(full[0]).length > 5);
      const raw = await s.q('ls', `${R}/dir`, '--full', '--raw');
      assert.equal(raw.stdout.trim().split('\n').length, 2);
    });

    test('an empty folder prints an empty list / （空）', async () => {
      await s.q('mkdir', `${R}/empty`);
      assert.deepEqual(s.yaml(await s.q('ls', `${R}/empty`)), []);
      assert.equal((await s.q('ls', `${R}/empty`, '--markdown')).stdout.trim(), '（空）');
      assert.equal((await s.q('ls', `${R}/empty`, '--raw')).stdout, '');
    });

    test('the root lists, and the test folder is in it', async () => {
      const res = await s.q('ls', '/', '--raw');
      assert.equal(res.exit, 0);
      assert.ok(res.stdout.split('\n').includes(R));
    });

    test('a file is not_a_folder (exit 1) and a missing path is not_found (exit 4)', async () => {
      const file = await s.q('ls', `${R}/dir/${stamp}.txt`);
      assert.equal(file.exit, 1);
      const e = s.err(file);
      assert.equal(e.code, 'not_a_folder');
      assert.match(e.next, /quark info/);
      const gone = await s.q('ls', `${R}/dir/nope`);
      assert.equal(gone.exit, 4);
      assert.equal(s.err(gone).code, 'not_found');
      assert.match(s.err(gone).next, /quark ls/);
      assert.equal(gone.stdout, '');
    });

    test('--json --raw is a usage error', async () => {
      const res = await s.q('ls', '--json', '--raw');
      assert.equal(res.exit, 2);
      assert.equal(s.err(res).code, 'usage');
    });
  });

  describe('info', () => {
    test('a file in yaml, json, markdown and raw', async () => {
      const path = `${R}/dir/${stamp}.txt`;
      const yaml = s.yaml(await s.q('info', path));
      assert.deepEqual(Object.keys(yaml), ['name', 'path', 'type', 'size', 'created', 'modified', 'id']);
      assert.equal(yaml.name, `${stamp}.txt`);
      assert.equal(yaml.path, path);
      assert.equal(yaml.type, 'file');
      assert.ok(yaml.size > 0);
      assert.match(yaml.created, ISO);
      assert.match(yaml.modified, ISO);
      assert.match(yaml.id, /^[0-9a-f]+$/);
      assert.deepEqual(await s.json('info', path), yaml);
      const md = (await s.q('info', path, '--markdown')).stdout;
      assert.match(md, new RegExp(`^- name: ${stamp}\\.txt$`, 'm'));
      assert.match(md, /^- type: file$/m);
      assert.equal((await s.q('info', path, '--raw')).stdout, `${path}\n`);
      const full = await s.json('info', path, '--full');
      assert.equal(full.file_name, `${stamp}.txt`);
      assert.ok('fid' in full);
    });

    test('a folder has items instead of size; the root works', async () => {
      const dir = await s.json('info', `${R}/dir`);
      assert.equal(dir.type, 'dir');
      assert.equal(dir.items, 2);
      assert.ok(!('size' in dir));
      const root = await s.json('info', '/');
      assert.equal(root.name, '/');
      assert.equal(root.path, '/');
      assert.equal(root.type, 'dir');
      assert.ok(Number.isInteger(root.items));
      assert.equal(root.id, '0');
    });

    test('errors: missing path is not_found, no argument is usage', async () => {
      const gone = await s.q('info', `${R}/nope`);
      assert.equal(gone.exit, 4);
      assert.equal(s.err(gone).code, 'not_found');
      const none = await s.q('info');
      assert.equal(none.exit, 2);
      assert.equal(s.err(none).code, 'usage');
    });
  });

  describe('search', () => {
    let found;
    before(async () => {
      // The search index can lag behind an upload; wait for it once.
      for (let i = 0; i < 15 && !found; i++) {
        const res = await s.json('search', stamp);
        if (res.total >= 2) found = res;
        else await new Promise((r) => setTimeout(r, 2000));
      }
    });

    test('finds the file and the folder by a unique keyword: total, truncated, results', () => {
      assert.ok(found, 'search never found the uploaded items');
      assert.equal(found.total, 2);
      assert.equal(found.truncated, false);
      assert.deepEqual(Object.keys(found), ['total', 'truncated', 'results']);
      assert.equal(found.results[0].type, 'dir');
      assert.equal(found.results[0].path, `${R}/dir/folder_${stamp}`);
      assert.equal(found.results[1].path, `${R}/dir/${stamp}.txt`);
      assert.deepEqual(Object.keys(found.results[1]), ['name', 'path', 'type', 'size', 'modified']);
    });

    test('yaml equals json; markdown has a total line and a results table; raw is the paths', async () => {
      const yaml = s.yaml(await s.q('search', stamp));
      assert.deepEqual(yaml, found);
      const md = (await s.q('search', stamp, '--markdown')).stdout;
      assert.match(md, /^- total: 2$/m);
      assert.match(md, /^- truncated: false$/m);
      assert.match(md, /\*\*results\*\*\n\n\| name \| path \| type \| size \| modified \|/);
      const raw = await s.q('search', stamp, '--raw');
      assert.equal(raw.stdout, `${R}/dir/folder_${stamp}\n${R}/dir/${stamp}.txt\n`);
    });

    test('--full returns the drive fields for each result', async () => {
      const full = await s.json('search', stamp, '--full');
      assert.equal(full.total, 2);
      assert.ok('file_name' in full.results[0]);
      assert.ok('fid' in full.results[0]);
    });

    test('several words are one keyword; no hit is an empty result, not an error', async () => {
      const none = await s.q('search', `${stamp}-no-such-thing`);
      assert.equal(none.exit, 0);
      const data = s.yaml(none);
      assert.equal(data.total, 0);
      assert.equal(data.truncated, false);
      assert.deepEqual(data.results, []);
      assert.equal((await s.q('search', `${stamp}-no-such-thing`, '--raw')).stdout, '');
    });

    test('a broad keyword is capped at 50 and says so when truncated', async () => {
      const res = await s.json('search', 'e');
      assert.ok(res.results.length <= 50);
      assert.equal(res.truncated, res.total > res.results.length);
      assert.ok(res.total >= res.results.length);
    });

    test('no keyword is usage (exit 2)', async () => {
      const res = await s.q('search');
      assert.equal(res.exit, 2);
      assert.equal(s.err(res).code, 'usage');
    });
  });

  describe('account', () => {
    test('whoami: fields, formats and --full', async () => {
      const res = await s.q('whoami');
      assert.equal(res.exit, 0, res.stderr);
      const me = s.yaml(res);
      assert.deepEqual(Object.keys(me), ['name', 'used', 'total', 'used_human', 'total_human', 'member', 'member_until']);
      assert.equal(typeof me.name, 'string');
      assert.ok(me.name.length > 0);
      assert.ok(Number.isInteger(me.used) && me.used >= 0);
      assert.ok(Number.isInteger(me.total) && me.total >= me.used);
      assert.equal(typeof me.member, 'boolean');
      if (me.member) assert.match(me.member_until, /^\d{4}-\d{2}-\d{2}$/);
      else assert.equal(me.member_until, null);
      assert.deepEqual(await s.json('whoami'), me);
      assert.match((await s.q('whoami', '--markdown')).stdout, /^- name: .+$/m);
      assert.equal((await s.q('whoami', '--raw')).stdout, `${me.name}\n`);
      const full = await s.json('whoami', '--full');
      assert.equal(full.name, me.name);
      assert.ok(Object.keys(full).length > 5);
    });

    test('login while logged in is already_logged_in (exit 1) and opens no window', async () => {
      const res = await s.q('login');
      assert.equal(res.exit, 1);
      const e = s.err(res);
      assert.equal(e.code, 'already_logged_in');
      assert.match(e.next, /quark logout/);
      assert.equal(res.stdout, '');
    });

    test('logout (on a throwaway copy only) works, then commands say not_logged_in (exit 3)', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'quark-e2e-logout-'));
      const profile = join(dir, 'profile');
      try {
        copyProfile(profile);
        const env = { QUARK_PROFILE: profile };
        const out = await runQuark(['logout'], { env });
        assert.equal(out.exit, 0, out.stderr);
        assert.deepEqual(YAML.parse(out.stdout), { logged_out: true });
        const res = await runQuark(['ls', '/'], { env });
        assert.equal(res.exit, 3);
        const e = YAML.parse(res.stderr);
        assert.equal(e.code, 'not_logged_in');
        assert.equal(e.exit, 3);
        assert.match(e.next, /quark login/);
        assert.equal(res.stdout, '');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
