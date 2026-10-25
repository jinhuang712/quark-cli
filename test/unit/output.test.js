import { test } from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { pickFormat, render, renderError } from '../../src/output.js';
import { QuarkError } from '../../src/errors.js';

test('pickFormat defaults to yaml', () => {
  assert.equal(pickFormat({}), 'yaml');
  assert.equal(pickFormat({ full: true }), 'yaml');
});

test('pickFormat returns the one format given', () => {
  assert.equal(pickFormat({ json: true }), 'json');
  assert.equal(pickFormat({ markdown: true }), 'markdown');
  assert.equal(pickFormat({ raw: true, full: true }), 'raw');
});

test('pickFormat rejects every pair and the triple as a usage error', () => {
  for (const flags of [{ json: true, raw: true }, { json: true, markdown: true }, { markdown: true, raw: true }, { json: true, markdown: true, raw: true }]) {
    assert.throws(
      () => pickFormat(flags),
      (e) => e instanceof QuarkError && e.code === 'usage' && e.exit === 2 && Boolean(e.next),
    );
  }
});

test('yaml quotes values a strict parser would misread', () => {
  const text = render('yaml', { data: { a: 'yes', b: 'no', c: '2024', d: 'on' } });
  assert.match(text, /^a: "yes"$/m);
  assert.match(text, /^b: "no"$/m);
  assert.match(text, /^c: "2024"$/m);
  assert.match(text, /^d: "on"$/m);
});

test('yaml keeps real numbers, booleans, null and Chinese readable', () => {
  const data = { count: 2024, flag: true, none: null, name: '简历 2024 版' };
  const text = render('yaml', { data });
  assert.match(text, /^count: 2024$/m);
  assert.match(text, /^flag: true$/m);
  assert.match(text, /^none: null$/m);
  assert.match(text, /^name: 简历 2024 版$/m);
  assert.deepEqual(YAML.parse(text), data);
});

test('yaml never wraps long lines and has no trailing newline', () => {
  const long = 'x'.repeat(300);
  const text = render('yaml', { data: { v: long } });
  assert.equal(text, `v: ${long}`);
});

test('json is the data, pretty printed, and round trips', () => {
  const data = [{ name: '简历', size: null }];
  const text = render('json', { data });
  assert.equal(text, JSON.stringify(data, null, 2));
  assert.deepEqual(JSON.parse(text), data);
});

test('markdown renders an array of objects as a table', () => {
  const text = render('markdown', { data: [{ name: 'a', n: 1 }, { name: 'b', n: null }] });
  assert.equal(text, ['| name | n |', '| --- | --- |', '| a | 1 |', '| b |  |'].join('\n'));
});

test('markdown escapes pipes and flattens newlines in cells', () => {
  const text = render('markdown', { data: [{ name: 'a|b', note: 'x\ny' }] });
  assert.match(text, /\| a\\\|b \| x y \|/);
  assert.equal(text.split('\n').length, 3);
});

test('markdown renders an object as a key list and nests arrays of objects as tables', () => {
  const text = render('markdown', { data: { total: 2, truncated: false, results: [{ name: 'a' }] } });
  assert.match(text, /^- total: 2$/m);
  assert.match(text, /^- truncated: false$/m);
  assert.match(text, /\*\*results\*\*\n\n\| name \|\n\| --- \|\n\| a \|/);
});

test('markdown: empty array, scalar list and nulls', () => {
  assert.equal(render('markdown', { data: [] }), '（空）');
  assert.equal(render('markdown', { data: ['a', 'b|c'] }), '- a\n- b\\|c');
  assert.equal(render('markdown', { data: { k: null } }), '- k: ');
});

test('raw prints the lines, one per line, and nothing when there are none', () => {
  assert.equal(render('raw', { data: {}, lines: ['/a', '/b'] }), '/a\n/b');
  assert.equal(render('raw', { data: {} }), '');
  assert.equal(render('raw', { data: {}, lines: [] }), '');
});

test('--full chooses `full` over `data` in every structured format, only when present', () => {
  const result = { data: { a: 1 }, full: { a: 1, extra: 'yes' } };
  assert.deepEqual(JSON.parse(render('json', result, { full: true })), { a: 1, extra: 'yes' });
  assert.match(render('yaml', result, { full: true }), /extra: "yes"/);
  assert.match(render('markdown', result, { full: true }), /- extra: yes/);
  assert.deepEqual(JSON.parse(render('json', result)), { a: 1 });
  assert.deepEqual(JSON.parse(render('json', { data: { a: 1 } }, { full: true })), { a: 1 });
});

test('--full does not change what --raw prints', () => {
  assert.equal(render('raw', { data: {}, lines: ['x'], full: { y: 1 } }, { full: true }), 'x');
});

test('renderError drops undefined fields and falls back to yaml for raw', () => {
  const fields = { error: 'boom', code: 'usage', exit: 2, next: undefined, detail: undefined };
  const text = renderError('raw', fields);
  assert.deepEqual(YAML.parse(text), { error: 'boom', code: 'usage', exit: 2 });
  assert.deepEqual(JSON.parse(renderError('json', fields)), { error: 'boom', code: 'usage', exit: 2 });
});

test('renderError keeps structured extras such as the rm plan', () => {
  const plan = { paths: ['/a'], folders: 1, files: 2 };
  const parsed = JSON.parse(renderError('json', { error: 'e', code: 'confirmation_required', exit: 2, plan }));
  assert.deepEqual(parsed.plan, plan);
});
