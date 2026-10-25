import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODES,
  EXIT,
  QuarkError,
  fail,
  loginError,
  notFound,
  refused,
  usageError,
} from "../../src/errors.js";

test("EXIT values are the documented contract", () => {
  assert.deepEqual(EXIT, { ok: 0, error: 1, usage: 2, login: 3, notFound: 4, refused: 5 });
});

test("every code in CODES maps to its exit through fail()", () => {
  for (const [code, exit] of Object.entries(CODES)) {
    const e = fail(code, "m");
    assert.equal(e.code, code);
    assert.equal(e.exit, exit, `${code} should exit ${exit}`);
    assert.ok(Object.values(EXIT).includes(exit));
  }
});

test("the codes agents rely on keep their exits", () => {
  assert.equal(CODES.unknown_command, 2);
  assert.equal(CODES.confirmation_required, 2);
  assert.equal(CODES.not_logged_in, 3);
  assert.equal(CODES.not_found, 4);
  assert.equal(CODES.local_not_found, 4);
  assert.equal(CODES.share_gone, 4);
  assert.equal(CODES.bad_code, 4);
  assert.equal(CODES.refused, 5);
  assert.equal(CODES.already_exists, 1);
  assert.equal(CODES.not_a_folder, 1);
});

test("QuarkError with a number is an exit code and derives the code", () => {
  assert.equal(new QuarkError("m", 2).code, "usage");
  assert.equal(new QuarkError("m", 3).code, "not_logged_in");
  assert.equal(new QuarkError("m", 4).exit, 4);
  assert.equal(new QuarkError("m", 5).code, "refused");
});

test("QuarkError with no options is a generic error", () => {
  const e = new QuarkError("m");
  assert.equal(e.code, "error");
  assert.equal(e.exit, 1);
  assert.equal(e.next, undefined);
  assert.equal(e.message, "m");
  assert.ok(e instanceof Error);
});

test("QuarkError with a code derives the exit; an explicit exit wins", () => {
  assert.equal(new QuarkError("m", { code: "not_found" }).exit, 4);
  assert.equal(new QuarkError("m", { code: "not_found", exit: 1 }).exit, 1);
  assert.equal(new QuarkError("m", { code: "made_up" }).exit, 1);
});

test("QuarkError carries next, detail and extra", () => {
  const extra = { plan: { paths: ["/a"] } };
  const e = new QuarkError("m", { code: "confirmation_required", next: "n", detail: "d", extra });
  assert.equal(e.next, "n");
  assert.equal(e.detail, "d");
  assert.deepEqual(e.extra, extra);
});

test("fail() passes next, detail and extra through", () => {
  const e = fail("refused", "m", { next: "n", detail: "d", extra: { x: 1 } });
  assert.deepEqual([e.code, e.exit, e.next, e.detail, e.extra], ["refused", 5, "n", "d", { x: 1 }]);
});

test("shortcut constructors", () => {
  assert.deepEqual(
    [usageError("m", "n").code, usageError("m", "n").exit, usageError("m", "n").next],
    ["usage", 2, "n"],
  );
  assert.equal(loginError().code, "not_logged_in");
  assert.equal(loginError().exit, 3);
  assert.ok(loginError().next);
  assert.equal(notFound("m", "n").exit, 4);
  const r = refused("m", { detail: "d" });
  assert.deepEqual([r.code, r.exit, r.detail], ["refused", 5, "d"]);
  assert.ok(r.next);
});
