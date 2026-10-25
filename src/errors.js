// Exit codes and error codes are part of the contract: FEATURES.md → F18, F20.
export const EXIT = { ok: 0, error: 1, usage: 2, login: 3, notFound: 4, refused: 5 };

// Every error code maps to one exit code, so a caller can rely on either.
export const CODES = {
  error: EXIT.error,
  usage: EXIT.usage,
  unknown_command: EXIT.usage,
  confirmation_required: EXIT.usage,
  not_logged_in: EXIT.login,
  already_logged_in: EXIT.error,
  chrome_missing: EXIT.error,
  profile_busy: EXIT.error,
  login_cancelled: EXIT.error,
  login_timeout: EXIT.error,
  not_found: EXIT.notFound,
  local_not_found: EXIT.notFound,
  share_gone: EXIT.notFound,
  bad_code: EXIT.notFound,
  not_a_folder: EXIT.error,
  invalid_name: EXIT.error,
  already_exists: EXIT.error,
  no_space: EXIT.error,
  network: EXIT.error,
  refused: EXIT.refused,
};

// opts is an exit code (number) or { code, exit, next, detail, extra }.
// `extra` holds structured fields printed beside the standard ones, such as rm's `plan`.
export class QuarkError extends Error {
  constructor(message, opts = {}) {
    super(message);
    const o = typeof opts === 'number' ? { exit: opts } : opts;
    this.code = o.code ?? Object.keys(CODES).find((k) => CODES[k] === o.exit) ?? 'error';
    this.exit = o.exit ?? CODES[this.code] ?? EXIT.error;
    this.next = o.next;
    this.detail = o.detail;
    this.extra = o.extra;
  }
}

// fail('not_found', 'no such path', { next: 'run quark ls' })
export const fail = (code, message, extra = {}) => new QuarkError(message, { code, ...extra });

export const usageError = (m, next) => fail('usage', m, { next });
export const loginError = () =>
  fail('not_logged_in', '没有登录，或登录已过期', { next: '请用户运行 `quark login` 扫码登录，然后重试' });
export const notFound = (m, next) => fail('not_found', m, { next });
export const refused = (m, extra) => fail('refused', m, { next: '请用户确认账号状态；不要重试', ...extra });
