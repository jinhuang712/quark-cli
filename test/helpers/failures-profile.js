import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';

export const REAL_PROFILE = join(homedir(), '.quark-cli', 'profile');

const made = [];

// Copies the real login profile to a temp dir. Chrome opens a profile dir only once, and the
// original must never be touched, so every test works on its own copy.
export function copyProfile() {
  const dir = mkdtempSync(join(tmpdir(), 'quark-fail-'));
  const dest = join(dir, 'profile');
  cpSync(REAL_PROFILE, dest, { recursive: true, filter: (src) => !basename(src).startsWith('Singleton') });
  made.push(dir);
  return dest;
}

// An empty profile is what `quark logout` leaves behind: Chrome starts logged out.
export function emptyProfile() {
  const dir = mkdtempSync(join(tmpdir(), 'quark-fail-'));
  made.push(dir);
  return join(dir, 'profile');
}

export function removeProfiles() {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
}

// Folder name every drive write of these tests lives under.
export const TEST_ROOT = `quark-cli-test-fail-${Date.now()}`;

// Deletes the test folder from the drive; refuses anything outside the test prefix.
export async function deleteTestFolder(page, name = TEST_ROOT) {
  const { resolve } = await import('../../src/session.js');
  const { callMaybeTask } = await import('../../src/ops.js');
  if (!name.startsWith('quark-cli-test-fail-')) throw new Error(`refusing to delete ${name}`);
  const hit = await resolve(page, `/${name}`).catch(() => null);
  if (hit) await callMaybeTask(page, 'POST', '/file/delete', { action_type: 2, filelist: [hit.fid], exclude_fids: [] });
}
