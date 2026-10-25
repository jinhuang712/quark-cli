import { setTimeout as sleep } from 'node:timers/promises';
import { open, isLoggedIn } from '../session.js';
import { nickname } from '../account.js';
import { openQrWindow } from '../qrwindow.js';
import { fail } from '../errors.js';

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
export async function waitForScan(page, win, { timeoutMs = TIMEOUT_MS } = {}) {
  let closedByUser = false;
  win.closed.then(() => {
    closedByUser = true;
  });
  const deadline = Date.now() + timeoutMs;
  let refreshedAt = Date.now();
  while (Date.now() < deadline) {
    if (closedByUser) throw fail('login_cancelled', '二维码窗口被关闭，登录已取消', { next: '请用户重新运行 `quark login` 扫码' });
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
  throw fail('login_timeout', '5 分钟内没有人扫码，登录超时', { next: '请用户重新运行 `quark login` 扫码' });
}

export default {
  name: 'login',
  usage: 'login',
  summary: '弹出二维码小窗，用夸克 APP 扫码登录',
  group: 'account',
  auth: false,
  args: [],
  examples: ['quark login'],
  effect: { changes: false, undo: 'quark logout', login: false },
  errors: ['already_logged_in', 'chrome_missing', 'login_cancelled', 'login_timeout'],
  related: ['logout', 'whoami'],
  async run({ emit }) {
    const { context, page } = await open().catch((e) => {
      if (/executable|chrome/i.test(e.message)) {
        throw fail('chrome_missing', '本机没有找到 Google Chrome', { next: '请用户安装 Google Chrome；已安装在非标准位置时，设置环境变量 QUARK_CHROME_PATH 指向它', detail: e.message.split('\n')[0] });
      }
      throw e;
    });
    let win;
    try {
      if (await isLoggedIn(page)) {
        const name = await nickname(page);
        throw fail('already_logged_in', `已经登录，当前账号是 ${name}`, {
          next: '直接使用即可；要换账号先运行 quark logout，再运行 quark login',
        });
      }
      win = openQrWindow(await qrShot(page));
      await waitForScan(page, win);
      const name = await nickname(page);
      emit({ data: { name }, lines: [name] });
    } finally {
      win?.close();
      await context.close();
    }
  },
};
