import { setTimeout as sleep } from 'node:timers/promises';
import { open, isLoggedIn } from '../session.js';
import { nickname } from '../account.js';
import { openQrWindow } from '../qrwindow.js';
import { QuarkError } from '../errors.js';

const QR = '.scan-area';
const POLL_MS = 2000;
const REFRESH_MS = 100_000;
const TIMEOUT_MS = 5 * 60_000;

async function qrShot(page) {
  await page.locator(QR).waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(500);
  return page.locator(QR).screenshot();
}

// Polls the hidden page until it is logged in, the window is closed, or time runs out.
async function waitForScan(page, win) {
  let closedByUser = false;
  win.closed.then(() => {
    closedByUser = true;
  });
  const deadline = Date.now() + TIMEOUT_MS;
  let refreshedAt = Date.now();
  while (Date.now() < deadline) {
    if (closedByUser) throw new QuarkError('二维码窗口被关闭，登录已取消');
    // eslint-disable-next-line no-await-in-loop
    if (await isLoggedIn(page)) return;
    if (Date.now() - refreshedAt > REFRESH_MS) {
      refreshedAt = Date.now();
      // eslint-disable-next-line no-await-in-loop
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    // eslint-disable-next-line no-await-in-loop
    await qrShot(page).then(win.update, () => {});
    // eslint-disable-next-line no-await-in-loop
    await sleep(POLL_MS);
  }
  throw new QuarkError('等待扫码超时，请重新运行 quark login');
}

export default {
  name: 'login',
  usage: 'login [--force] [--json]',
  summary: 'scan a QR code to log in',
  auth: false,
  options: { force: { type: 'boolean' } },
  async run({ flags, out }) {
    const { context, page } = await open();
    let win;
    try {
      if (!flags.force && (await isLoggedIn(page))) {
        const name = await nickname(page);
        out(`账号: ${name}`, { name, alreadyLoggedIn: true });
        return;
      }
      if (flags.force) {
        await context.clearCookies();
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
      win = openQrWindow(await qrShot(page));
      await waitForScan(page, win);
      const name = await nickname(page);
      out(`账号: ${name}`, { name, alreadyLoggedIn: false });
    } finally {
      win?.close();
      await context.close();
    }
  },
};
