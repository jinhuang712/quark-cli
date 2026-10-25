import { call } from './session.js';

// Account nickname from the web app's own account endpoint.
export async function nickname(page) {
  const res = await page.evaluate(async () => {
    const r = await fetch('https://pan.quark.cn/account/info?fr=pc&platform=pc', { credentials: 'include' });
    return r.json();
  });
  if (!res.success) throw new Error(`account/info: ${res.msg || JSON.stringify(res)}`);
  return res.data.nickname;
}

// Membership and capacity from the drive API.
export async function member(page) {
  const { data } = await call(page, 'GET', '/member', {
    query: { fetch_subscribe: 'true', _ch: 'home', fetch_identity: 'true' },
  });
  return data;
}
