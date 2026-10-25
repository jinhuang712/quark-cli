import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const BIN = join(ROOT, 'bin', 'quark.js');

// Runs `node bin/quark.js ...args`; resolves { stdout, stderr, exit } without ever rejecting.
export function runQuark(args, { env = {}, input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (exit) => resolve({ stdout, stderr, exit }));
    child.stdin.end(input ?? '');
  });
}

// Parses the error a failed run wrote to stderr (yaml, or json when --json was given), skipping progress lines.
export function errorOf(res) {
  const text = res.stderr;
  const brace = text.search(/^\{/m);
  if (brace !== -1) return JSON.parse(text.slice(brace));
  const at = text.search(/^error:/m);
  if (at === -1) throw new Error(`no error block on stderr: ${text.slice(0, 300)}`);
  return YAML.parse(text.slice(at));
}

const PREFIX = '/quark-cli-test-e2e-';
const SOURCE_PROFILE = process.env.QUARK_E2E_SOURCE_PROFILE || join(homedir(), '.quark-cli', 'profile');
const SKIP = /^(Singleton|Cache$|Code Cache$|GPUCache$|component_crx_cache$|extensions_crx_cache$)/;

// One e2e session: a private copy of the logged-in profile (Chrome opens a profile directory only
// once, and the original must never be used directly) and one unique top-level drive folder.
export function copyProfile(dest) {
  if (!existsSync(SOURCE_PROFILE)) throw new Error(`no logged-in profile at ${SOURCE_PROFILE}; run quark login first`);
  cpSync(SOURCE_PROFILE, dest, { recursive: true, filter: (src) => !SKIP.test(src.split('/').at(-1)) });
}

export function createSession(area) {
  const tmp = mkdtempSync(join(tmpdir(), `quark-e2e-${area}-`));
  const profile = join(tmp, 'profile');
  copyProfile(profile);
  const root = `${PREFIX}${Date.now()}-${area}`;
  const env = { QUARK_PROFILE: profile };
  const shares = new Set();

  // Runs one CLI call against the real drive. `--json` is added by the caller when wanted.
  const q = async (...args) => {
    const res = await runQuark(args.map(String), { env });
    return res;
  };
  // Same, with stdout parsed as JSON (adds --json); fails loudly when the exit is not 0.
  const json = async (...args) => {
    const res = await q(...args, '--json');
    if (res.exit !== 0) throw new Error(`quark ${args[0]} exited ${res.exit}: ${res.stderr.slice(0, 500)}`);
    return JSON.parse(res.stdout);
  };
  const yaml = (res) => YAML.parse(res.stdout);
  const err = errorOf;

  // Parsed entries of a drive folder (names, types), for checking what a command left behind.
  const ls = (path) => json('ls', path);
  const names = async (path) => (await ls(path)).map((e) => e.name).toSorted();

  const local = (name) => {
    const dir = join(tmp, 'local');
    mkdirSync(dir, { recursive: true });
    return join(dir, name);
  };
  const localFile = (name, content) => {
    const p = local(name);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
    return p;
  };

  // Cancels every share this session created, then deletes the test folder. Never touches anything else.
  const cleanup = async () => {
    try {
      for (const link of shares) await q('unshare', link);
      const all = await q('shares', '--json');
      if (all.exit === 0) {
        for (const s of JSON.parse(all.stdout)) if (s.name?.startsWith('quark-e2e-')) await q('unshare', s.link);
      }
      if (!root.startsWith(PREFIX)) throw new Error(`refusing to delete ${root}`);
      const gone = await q('rm', root, '--yes', '--raw');
      if (gone.exit !== 0 && gone.exit !== 4) console.error(`cleanup: rm ${root} exited ${gone.exit}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  };

  return { q, json, ls, names, tmp, yaml, err, root, env, shares, local, localFile, cleanup, track: (link) => shares.add(link) };
}
