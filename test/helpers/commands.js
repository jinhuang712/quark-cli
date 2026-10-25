import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../src/commands/', import.meta.url);

// Every command module's default export, keyed by command name.
export async function loadCommands() {
  const files = readdirSync(fileURLToPath(dir)).filter((n) => n.endsWith('.js'));
  const all = {};
  for (const f of files) {
    const { default: c } = await import(new URL(f, dir));
    all[c.name] = c;
  }
  return all;
}
