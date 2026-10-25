import { test } from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { errorOf, runQuark } from '../helpers/cli.js';
import { loadCommands } from '../helpers/commands.js';

// A profile that does not exist: anything that tried to open Chrome with it would create it, so
// these tests also prove that the paths below never reach the browser.
const env = { QUARK_PROFILE: '/nonexistent/quark-unit-profile' };
const run = (...args) => runQuark(args, { env });

const all = await loadCommands();

for (const flag of ['--help', '-h', 'help']) {
  test(`quark ${flag} prints the top help on stdout with exit 0`, async () => {
    const res = await run(flag);
    assert.equal(res.exit, 0);
    assert.equal(res.stderr, '');
    assert.match(res.stdout, /用法: quark <命令>/);
    for (const c of Object.values(all)) assert.ok(res.stdout.includes(c.usage), c.name);
  });
}

test('quark with no arguments prints the top help', async () => {
  const res = await run();
  assert.equal(res.exit, 0);
  assert.match(res.stdout, /用法: quark <命令>/);
});

test('unknown command: code unknown_command, exit 2, a next with a suggestion', async () => {
  const res = await run('lss');
  assert.equal(res.exit, 2);
  assert.equal(res.stdout, '');
  const e = errorOf(res);
  assert.equal(e.code, 'unknown_command');
  assert.equal(e.exit, 2);
  assert.match(e.error, /lss/);
  assert.match(e.next, /quark ls/);
  assert.match(e.next, /quark --help/);
});

test('unknown command far from every name has a next without a suggestion', async () => {
  const res = await run('frobnicate-everything');
  assert.equal(res.exit, 2);
  const e = errorOf(res);
  assert.equal(e.code, 'unknown_command');
  assert.match(e.next, /quark --help/);
  assert.doesNotMatch(e.next, /是不是想用/);
});

test('unknown command honours --json for its error', async () => {
  const res = await run('lss', '--json');
  assert.equal(res.exit, 2);
  assert.equal(JSON.parse(res.stderr).code, 'unknown_command');
});

test('conflicting output options are a usage error before any login or browser work', async () => {
  for (const pair of [['--json', '--raw'], ['--json', '--markdown'], ['--markdown', '--raw']]) {
    const res = await run('ls', ...pair);
    assert.equal(res.exit, 2, pair.join(' '));
    assert.equal(res.stdout, '');
    // --markdown renders the error as a key list, the others as yaml.
    assert.match(res.stderr, /code"?: "?usage/, pair.join(' '));
    assert.match(res.stderr, /next"?: /, pair.join(' '));
    assert.match(res.stderr, /exit"?: 2/, pair.join(' '));
  }
});

test('an unknown option is a usage error that points at --help', async () => {
  const res = await run('ls', '--bogus');
  assert.equal(res.exit, 2);
  const e = errorOf(res);
  assert.equal(e.code, 'usage');
  assert.match(e.next, /quark ls --help/);
});

test('an option that needs a value is a usage error', async () => {
  const res = await run('save', 'x', 'y', '--code');
  assert.equal(res.exit, 2);
  assert.equal(errorOf(res).code, 'usage');
});

test('--help wins over missing arguments', async () => {
  const res = await run('mv', '--help');
  assert.equal(res.exit, 0);
  assert.match(res.stdout, /^quark mv <src> <dest-folder>/);
});

for (const c of Object.values(all)) {
  test(`quark ${c.name} --help exits 0 and states the effect`, async () => {
    for (const flag of ['--help', '-h']) {
      const res = await run(c.name, flag);
      assert.equal(res.exit, 0, `${c.name} ${flag}`);
      assert.equal(res.stderr, '');
      assert.ok(res.stdout.startsWith(`quark ${c.usage}`));
      assert.match(res.stdout, /改动网盘: (是|否)/);
      assert.match(res.stdout, /能否撤销:/);
      assert.match(res.stdout, /需要登录: (是|否)/);
      assert.match(res.stdout, new RegExp(`改动网盘: ${c.effect.changes ? '是' : '否'}`));
      assert.match(res.stdout, new RegExp(`需要登录: ${c.effect.login === false ? '否' : '是'}`));
    }
  });
}

test('logout needs no login and no browser: it empties a throwaway profile and prints yaml', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'quark-unit-logout-'));
  const profile = join(dir, 'profile');
  mkdirSync(profile);
  writeFileSync(join(profile, 'Cookies'), 'x');
  const res = await runQuark(['logout'], { env: { QUARK_PROFILE: profile } });
  assert.equal(res.exit, 0);
  assert.deepEqual(YAML.parse(res.stdout), { logged_out: true });
  assert.equal(existsSync(profile), false);
  const raw = await runQuark(['logout', '--raw'], { env: { QUARK_PROFILE: profile } });
  assert.equal(raw.exit, 0);
  assert.equal(raw.stdout, '');
  const { rmSync } = await import('node:fs');
  rmSync(dir, { recursive: true, force: true });
});

test('logout with conflicting formats is still a usage error and removes nothing', async () => {
  const { mkdtempSync, mkdirSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'quark-unit-logout2-'));
  const profile = join(dir, 'profile');
  mkdirSync(profile);
  const res = await runQuark(['logout', '--json', '--raw'], { env: { QUARK_PROFILE: profile } });
  assert.equal(res.exit, 2);
  assert.equal(existsSync(profile), true);
  rmSync(dir, { recursive: true, force: true });
});
