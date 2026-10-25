import { test } from "node:test";
import assert from "node:assert/strict";
import { isoTime, row, size, time } from "../../src/format.js";

test("size picks the unit and rounds", () => {
  assert.equal(size(0), "0B");
  assert.equal(size(1023), "1023B");
  assert.equal(size(1024), "1.0K");
  assert.equal(size(1536), "1.5K");
  assert.equal(size(1048576), "1.0M");
  assert.equal(size(1073741824), "1.00G");
  assert.equal(size(5.5 * 1073741824), "5.50G");
});

test("size reaches terabytes", () => {
  assert.equal(size(1099511627776), "1.00T");
  assert.equal(size(2.5 * 1099511627776), "2.50T");
});

test("isoTime is null for empty input", () => {
  assert.equal(isoTime(0), null);
  assert.equal(isoTime(undefined), null);
});

test("isoTime is ISO 8601 with the local UTC offset", () => {
  const out = isoTime(Date.UTC(2026, 9, 26, 1, 30, 5));
  assert.match(out, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  assert.equal(new Date(out).getTime(), Date.UTC(2026, 9, 26, 1, 30, 5));
});

test("time is local minute precision", () => {
  assert.match(time(Date.UTC(2026, 9, 26, 1, 30)), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test("row marks folders and files", () => {
  const file = row({ file_name: "a.txt", size: 2048, file_type: 1, l_updated_at: 1 });
  const dir = row({ file_name: "d", dir: true, l_updated_at: 1 });
  assert.match(file, /^- 2\.0K\t.*\ta\.txt$/);
  assert.match(dir, /^d -\t.*\td\/$/);
});
