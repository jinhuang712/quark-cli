import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandHelp, nearest, topHelp } from '../../src/help.js';
import { CODES } from '../../src/errors.js';
import { loadCommands } from '../helpers/commands.js';

const all = await loadCommands();
const GROUPS = new Set(['account', 'browse', 'organize', 'transfer', 'share']);

test('every command module exports the metadata help.js needs', () => {
  for (const c of Object.values(all)) {
    const who = `command ${c.name}`;
    assert.ok(c.name && c.usage && c.summary, `${who}: name, usage, summary`);
    assert.ok(c.usage.startsWith(c.name), `${who}: usage starts with the name`);
    assert.equal(typeof c.run, 'function', `${who}: run`);
    assert.ok(GROUPS.has(c.group), `${who}: group ${c.group}`);
    assert.ok(Array.isArray(c.args), `${who}: args`);
    assert.ok(Array.isArray(c.examples) && c.examples.length > 0, `${who}: examples`);
    assert.ok(c.examples.every((x) => x.startsWith('quark ')), `${who}: examples start with quark`);
    assert.equal(typeof c.effect?.changes, 'boolean', `${who}: effect.changes`);
    assert.equal(typeof c.effect.undo === 'string' || c.effect.changes === false, true, `${who}: effect.undo for changing commands`);
    assert.ok(Array.isArray(c.errors), `${who}: errors`);
    for (const code of c.errors) assert.ok(code in CODES, `${who}: unknown error code ${code}`);
    for (const r of c.related ?? []) assert.ok(r in all, `${who}: related ${r} is a command`);
  }
});

test('there are the sixteen commands the docs promise', () => {
  assert.deepEqual(
    Object.keys(all).toSorted(),
    ['download', 'info', 'login', 'logout', 'ls', 'mkdir', 'mv', 'rename', 'rm', 'save', 'search', 'share', 'shares', 'unshare', 'upload', 'whoami'],
  );
});

test('only login and logout run without a login', () => {
  const free = Object.values(all).filter((c) => c.effect.login === false).map((c) => c.name).toSorted();
  assert.deepEqual(free, ['login', 'logout']);
  for (const n of free) assert.equal(all[n].auth, false);
});

test('commands that change the drive are the ones marked with *', () => {
  const top = topHelp(all);
  for (const c of Object.values(all)) {
    const line = top.split('\n').find((l) => l.includes(`${c.usage} `) && l.includes(c.summary));
    assert.ok(line, `topHelp lists ${c.name}`);
    assert.equal(line.trimStart().startsWith('*'), c.effect.changes, `${c.name} mark`);
  }
});

test('topHelp lists every command that exports a group, under its group', () => {
  const top = topHelp(all);
  for (const c of Object.values(all).filter((x) => x.group)) {
    assert.ok(top.includes(c.usage), `${c.name} missing from topHelp`);
    assert.ok(top.includes(c.summary), `${c.name} summary missing`);
  }
  for (const title of ['账号:', '浏览:', '整理:', '传输:', '分享:']) assert.ok(top.includes(title), title);
});

test('topHelp does not list a command that has no group', () => {
  const stray = { name: 'zzz', usage: 'zzz', summary: 'stray summary', effect: {} };
  assert.ok(!topHelp({ ...all, zzz: stray }).includes('stray summary'));
});

test('topHelp documents the output options, exit codes and profile location', () => {
  const top = topHelp(all);
  for (const s of ['--json', '--markdown', '--raw', '--full', '退出码', 'QUARK_PROFILE']) assert.ok(top.includes(s), s);
});

test('commandHelp has the three effect lines for every command', () => {
  for (const c of Object.values(all)) {
    const h = commandHelp(c);
    assert.match(h, /^改动网盘: (是|否)$/m, c.name);
    assert.match(h, /^能否撤销: .+$/m, c.name);
    assert.match(h, /^需要登录: (是|否)$/m, c.name);
    assert.ok(h.startsWith(`quark ${c.usage}`), c.name);
    assert.ok(h.includes(c.examples[0]), c.name);
  }
});

test('commandHelp reflects the effect values', () => {
  assert.match(commandHelp(all.rm), /^改动网盘: 是$/m);
  assert.match(commandHelp(all.rm), /^需要登录: 是$/m);
  assert.match(commandHelp(all.ls), /^改动网盘: 否$/m);
  assert.match(commandHelp(all.ls), /^能否撤销: 不涉及$/m);
  assert.match(commandHelp(all.login), /^需要登录: 否$/m);
});

test('commandHelp lists possible errors with exit codes, always usage, not_logged_in only when login is needed', () => {
  const rm = commandHelp(all.rm);
  assert.match(rm, /confirmation_required \(退出码 2\)/);
  assert.match(rm, /not_found \(退出码 4\)/);
  assert.match(rm, /usage \(退出码 2\)/);
  assert.match(rm, /not_logged_in \(退出码 3\)/);
  assert.doesNotMatch(commandHelp(all.login), /not_logged_in \(/);
  assert.match(commandHelp(all.login), /already_logged_in \(退出码 1\)/);
});

test('commandHelp shows args, flags and related commands when the module has them', () => {
  const rm = commandHelp(all.rm);
  assert.match(rm, /^参数:$/m);
  assert.match(rm, /^选项:$/m);
  assert.match(rm, /--yes/);
  assert.match(rm, /相关命令: quark search/);
});

test('nearest suggests the closest command for a typo', () => {
  const names = Object.keys(all);
  assert.equal(nearest('lss', names), 'ls');
  assert.equal(nearest('serach', names), 'search');
  assert.equal(nearest('uplod', names), 'upload');
  assert.equal(nearest('qqqqqq', names), undefined);
  assert.equal(nearest('xxxxxxxxxxxx', names), undefined);
  assert.equal(nearest('ls', names), 'ls');
  assert.equal(nearest('x', []), undefined);
});
