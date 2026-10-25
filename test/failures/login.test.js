// login: the scan loop of the real `quark login`, driven in-process against a logged-out profile.
// "Scanning" is simulated by injecting the cookies of a logged-in profile copy into the page.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { copyProfile, emptyProfile, removeProfiles } from '../helpers/failures-profile.js';

// An empty profile is what `quark logout` leaves behind. session.js reads this at import time.
process.env.QUARK_PROFILE = emptyProfile();
const { open, isLoggedIn } = await import('../../src/session.js');
const { nickname } = await import('../../src/account.js');
const { waitForScan } = await import('../../src/commands/login.js');

const never = () => ({ closed: new Promise(() => {}), update() {}, close() {} });

describe('login scan loop', { timeout: 180_000 }, () => {
  let context;
  let page;
  let loggedInCookies;
  let expectedName;

  before(async () => {
    // Read the cookies and the account name from a second copy of the logged-in profile.
    const ctx = await chromium.launchPersistentContext(copyProfile(), { channel: 'chrome', headless: true });
    try {
      const p = ctx.pages()[0] ?? (await ctx.newPage());
      await p.goto('https://pan.quark.cn/list', { waitUntil: 'domcontentloaded' });
      assert.equal(await isLoggedIn(p), true, 'the source profile must be logged in');
      expectedName = await nickname(p);
      loggedInCookies = await ctx.cookies();
    } finally {
      await ctx.close();
    }
    ({ context, page } = await open());
  });

  after(async () => {
    await context?.close();
    removeProfiles();
  });

  it('starts logged out', async () => {
    assert.equal(await isLoggedIn(page), false);
  });

  it('a closed QR window throws login_cancelled', async () => {
    const win = { closed: Promise.resolve(), update() {}, close() {} };
    await assert.rejects(waitForScan(page, win, { timeoutMs: 30_000 }), { code: 'login_cancelled', exit: 1 });
  });

  it('nobody scanning throws login_timeout', async () => {
    const started = Date.now();
    await assert.rejects(waitForScan(page, never(), { timeoutMs: 3000 }), { code: 'login_timeout', exit: 1 });
    assert.ok(Date.now() - started >= 3000);
  });

  it('a scan (cookies appearing) resolves and the account name is readable', async () => {
    let updates = 0;
    const win = { closed: new Promise(() => {}), update: () => updates++, close() {} };
    const scan = waitForScan(page, win, { timeoutMs: 60_000 });
    setTimeout(() => context.addCookies(loggedInCookies), 3000);
    await scan;
    assert.ok(updates >= 1, 'the QR image was pushed to the window at least once before the scan');
    assert.equal(await nickname(page), expectedName);
  });
});
