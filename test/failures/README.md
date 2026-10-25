# Failure-path tests

Run: `node --test "test/failures/*.test.js"` (needs a logged-in `~/.quark-cli/profile`; it is only ever copied, never opened). Takes about 40 seconds.

- `chrome-missing.test.js`: `QUARK_CHROME_PATH` pointing at nothing gives `chrome_missing`, exit 1.
- `login.test.js`: the real `waitForScan` against a logged-out profile: `login_cancelled`, `login_timeout`, and a simulated scan (cookies from a logged-in copy injected).
- `transfer.test.js`: download cut mid-way leaves no `.part`; upload cut mid-tree reports what was uploaded; `no_space` mapping. Drive writes stay under `/quark-cli-test-fail-<timestamp>`, deleted afterwards.
- `unshare.test.js`: a link that never existed gives `share_gone`.

## Not testable

`save` with `bad_code`, a successful `save`, and `unshare` of a live link owned by someone else cannot be tested with one account: Quark refuses saving your own share and ignores a wrong passcode on it, and probing other people's links is not acceptable. To cover them, we need one share link plus its passcode, created by another account (a throwaway account is fine) and kept alive while the tests run.

## Caveats

- `no_space` is tested by intercepting `/file/upload/pre` with a made-up capacity message. It checks our mapping, not Quark's real wording.
- The download is cut by wrapping Node's `fetch` response, because the download runs outside the browser and `context.setOffline` cannot reach it. The upload is cut with a real `setOffline(true)`.
