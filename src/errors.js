// Exit codes are part of the contract: FEATURES.md → F18.
export const EXIT = { ok: 0, error: 1, usage: 2, login: 3, notFound: 4, refused: 5 };

export class QuarkError extends Error {
  constructor(message, code = EXIT.error) {
    super(message);
    this.code = code;
  }
}

export const usageError = (m) => new QuarkError(m, EXIT.usage);
export const loginError = () => new QuarkError('not logged in; run `quark login`', EXIT.login);
export const notFound = (m) => new QuarkError(m, EXIT.notFound);
export const refused = (m) => new QuarkError(m, EXIT.refused);
