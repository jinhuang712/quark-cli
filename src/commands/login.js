import { open, isLoggedIn } from '../session.js';

// Placeholder: F1 replaces this with the small QR-only window.
export default {
  name: 'login',
  usage: 'login [--force]',
  summary: 'scan a QR code to log in',
  auth: false,
  async run() {
    const { context, page } = await open({ headed: true });
    console.error('Scan the QR code in the browser window; waiting for login...');
    while (!(await isLoggedIn(page))) await page.waitForTimeout(2000);
    await context.close();
  },
};
