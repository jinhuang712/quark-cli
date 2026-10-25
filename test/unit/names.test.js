import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameName, stored } from '../../src/names.js';

test("stored() turns ' \" < > into the entities Quark keeps, and leaves everything else alone", () => {
  assert.equal(stored("it's"), 'it&#39;s');
  assert.equal(stored('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(stored('a<b>c'), 'a&lt;b&gt;c');
  assert.equal(stored('a&b #1 100% 中文 😀 yes'), 'a&b #1 100% 中文 😀 yes');
});

test('sameName() accepts the name as asked and the name as Quark stores it, nothing else', () => {
  assert.ok(sameName("it's.txt", "it's.txt"));
  assert.ok(sameName('it&#39;s.txt', "it's.txt"));
  assert.ok(sameName('it&#39;s.txt', 'it&#39;s.txt'));
  assert.ok(!sameName('its.txt', "it's.txt"));
  assert.ok(!sameName("it's.txt", 'it&#39;s.txt'));
});
