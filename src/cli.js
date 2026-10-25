import { parseArgs } from 'node:util';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { open, isLoggedIn } from './session.js';
import { EXIT, QuarkError, loginError, usageError } from './errors.js';

const dir = fileURLToPath(new URL('./commands/', import.meta.url));

// A command module default-exports:
//   { name, summary, usage, options?, auth?: true, run({ page, context, args, flags, out }) }
// `out(human, json)` prints `json` as one JSON document under --json, else `human`.
async function load() {
  const all = {};
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    // eslint-disable-next-line no-await-in-loop
    const { default: c } = await import(`./commands/${f}`);
    all[c.name] = c;
  }
  return all;
}

function help(all) {
  const lines = Object.values(all)
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((c) => `  ${c.usage.padEnd(36)}${c.summary}`);
  console.error(`usage: quark <command> [--json]\n\n${lines.join('\n')}`);
}

export async function main(argv) {
  const all = await load();
  const [name, ...rest] = argv;
  const cmd = all[name];
  if (!cmd) {
    help(all);
    return name ? EXIT.usage : EXIT.ok;
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { json: { type: 'boolean' }, ...cmd.options },
    });
  } catch (e) {
    throw usageError(`${e.message}\nusage: quark ${cmd.usage}`);
  }
  const { values: flags, positionals: args } = parsed;
  const out = (human, json) => {
    if (flags.json) console.log(JSON.stringify(json ?? human, null, 2));
    else if (human !== undefined) console.log(human);
  };
  if (cmd.auth === false) return (await cmd.run({ args, flags, out }), EXIT.ok);

  const { context, page } = await open();
  try {
    if (!(await isLoggedIn(page))) throw loginError();
    await cmd.run({ page, context, args, flags, out });
    return EXIT.ok;
  } finally {
    await context.close();
  }
}

export async function run(argv) {
  try {
    process.exitCode = await main(argv);
  } catch (e) {
    console.error(`quark: ${e.message}`);
    process.exitCode = e instanceof QuarkError ? e.code : EXIT.error;
  }
}
