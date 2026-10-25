import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fail } from './errors.js';

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/microsoft-edge',
];

export const findChrome = () => CHROME_PATHS.find((p) => existsSync(p));

const qrPage = `<!doctype html>
<html lang="zh-CN" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>夸克网盘登录</title>
<style>
  body{margin:0;font:15px -apple-system,"PingFang SC",sans-serif;text-align:center;background:#fff;color:#222}
  img{width:260px;height:260px;margin-top:28px;image-rendering:pixelated}
  p{margin:14px 24px;line-height:1.5}
  small{color:#888}
</style></head><body>
<img id="qr" src="qr.png" alt="二维码">
<p>用夸克 APP 扫码<br>并在手机上确认登录</p>
<p><small>登录成功后这个窗口会自动关闭</small></p>
<script>setInterval(() => { document.getElementById('qr').src = 'qr.png?' + Date.now(); }, 2000);</script>
</body></html>`;

// Opens a small Chrome app window that shows only the QR image; Quark's own page is never shown.
// `closed` resolves when the window goes away; `update(png)` swaps the QR picture.
export function openQrWindow(png) {
  const chrome = findChrome();
  if (!chrome) throw fail('chrome_missing', '本机没有找到 Chrome，没法弹出二维码窗口', { next: '请用户安装 Google Chrome' });
  const dir = mkdtempSync(join(tmpdir(), 'quark-qr-'));
  mkdirSync(join(dir, 'profile'));
  let gone = false;
  const write = (buf) => {
    writeFileSync(join(dir, 'qr.tmp'), buf);
    renameSync(join(dir, 'qr.tmp'), join(dir, 'qr.png'));
  };
  // After the window is closed its temp dir is gone; a late update is dropped, not an error.
  const update = (buf) => {
    if (!gone) write(buf);
  };
  write(png);
  writeFileSync(join(dir, 'index.html'), qrPage);
  const proc = spawn(
    chrome,
    [
      `--app=file://${join(dir, 'index.html')}`,
      `--user-data-dir=${join(dir, 'profile')}`,
      '--window-size=340,500',
      '--lang=zh-CN',
      '--disable-features=Translate,TranslateUI',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
    ],
    { stdio: 'ignore' },
  );
  const closed = new Promise((resolve) => proc.once('exit', resolve)).then(() => {
    gone = true;
    rmSync(dir, { recursive: true, force: true });
  });
  return { closed, update, close: () => proc.kill() };
}
