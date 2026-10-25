import { call } from './session.js';
import { QuarkError, fail, refused } from './errors.js';

const API = 'https://drive-pc.quark.cn/1/clouddrive';

// --days -> Quark expired_type (verified against the task's expired_timestamp).
export const EXPIRED_TYPE = { 0: 1, 1: 2, 7: 3, 30: 4 };

const CODE_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode() {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

// Accepts https://pan.quark.cn/s/<id>[#/...] or a bare id.
export function pwdId(link) {
  const m = /\/s\/([0-9a-zA-Z]+)/.exec(link) ?? /^([0-9a-f]{12})$/.exec(link.trim());
  return m?.[1];
}

// Like session.call but hands back Quark's raw JSON so callers can map error codes.
export async function raw(page, method, path, { query = {}, body } = {}) {
  const qs = new URLSearchParams({ pr: 'ucpro', fr: 'pc', ...query });
  return page.evaluate(
    async ({ url, verb, payload }) => {
      const init = { method: verb, credentials: 'include' };
      if (payload) Object.assign(init, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const r = await fetch(url, init);
      return r.json();
    },
    { url: `${API}${path}?${qs}`, verb: method, payload: body },
  );
}

export const ok = (res) => res.status === 200 && res.code === 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Polls /task until it finishes. Returns the task data; throws QuarkError on failure.
export async function waitTask(page, taskId, { tries = 60 } = {}) {
  for (let i = 0; i < tries; i++) {
    // Polling is inherently sequential.
    // eslint-disable-next-line no-await-in-loop
    const res = await raw(page, 'GET', '/task', { query: { task_id: taskId, retry_index: i } });
    if (!ok(res)) throw new QuarkError('查询夸克任务状态失败', { detail: res.message || JSON.stringify(res), next: '稍后重试' });
    const t = res.data;
    if (t.status === 2) return t;
    if (t.status > 2) throw new QuarkError('夸克任务失败', { detail: t.message || JSON.stringify(t), next: '稍后重试' });
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }
  throw new QuarkError('夸克任务超时没有完成', { next: '稍后重试' });
}

export async function listShares(page) {
  const out = [];
  for (let p = 1; ; p++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await call(page, 'GET', '/share/mypage/detail', {
      query: { _page: p, _size: 50, _order_field: 'created_at', _order_type: 'desc', _fetch_total: 1 },
    });
    out.push(...r.data.list);
    if (out.length >= (r.metadata?._total ?? 0) || r.data.list.length === 0) return out;
  }
}

export const shareLink = (s) => s.share_url ?? `https://pan.quark.cn/s/${s.pwd_id}`;

// Quark rejections (restricted account, risk control) surface as exit 5, Quark's text kept in `detail`.
export function rejection(what, res, extra = {}) {
  return refused(`夸克拒绝了请求（${what}）`, { detail: res.message || JSON.stringify(res), ...extra });
}

// Maps sharepage/token failures to share_gone / bad_code (exit 4), anything else to refused.
export function tokenError(res, link, { hasCode = false } = {}) {
  const msg = res.message || JSON.stringify(res);
  if (res.status === 404 || /取消|不存在|失效|过期|违规/.test(msg)) {
    return fail('share_gone', `分享链接已失效: ${link}`, { next: '请对方重新分享', detail: msg });
  }
  if (/提取码/.test(msg)) {
    return fail('bad_code', hasCode ? `提取码不对: ${link}` : `这条分享需要提取码: ${link}`, {
      next: '用 --code 传入正确的提取码',
      detail: msg,
    });
  }
  return rejection('share/sharepage/token', res);
}
