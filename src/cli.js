import { parseArgs } from "node:util";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { open, isLoggedIn, openError } from "./session.js";
import { EXIT, QuarkError, fail, loginError, usageError } from "./errors.js";
import { pickFormat, render, renderError } from "./output.js";
import { commandHelp, nearest, topHelp } from "./help.js";

const dir = fileURLToPath(new URL("./commands/", import.meta.url));

// A command module default-exports (see help.js for the help metadata):
//   { name, summary, usage, options?, auth?: false, run({ page, context, args, flags, emit, progress }) }
// run() calls `emit({ data, lines, full })` once with its result:
//   data   the curated result (an object or an array), printed as yaml, json or markdown
//   lines  what --raw prints, one value per line
//   full   the complete result, printed instead of `data` under --full
async function load() {
  const all = {};
  const files = readdirSync(dir).filter((n) => n.endsWith(".js"));
  for (const c of await Promise.all(
    files.map((f) => import(`./commands/${f}`).then((m) => m.default)),
  )) {
    all[c.name] = c;
  }
  return all;
}

const GLOBAL = {
  json: { type: "boolean" },
  markdown: { type: "boolean" },
  raw: { type: "boolean" },
  full: { type: "boolean" },
  help: { type: "boolean", short: "h" },
};

const isHelp = (a) => a === "--help" || a === "-h";

function parse(cmd, rest) {
  try {
    return parseArgs({
      args: rest,
      allowPositionals: true,
      options: { ...GLOBAL, ...cmd.options },
    });
  } catch (e) {
    const dash = /Unknown option '(-[^']*)'/.exec(e.message);
    throw usageError(
      e.message,
      dash
        ? `运行 quark ${cmd.name} --help 看有哪些选项；${dash[1]} 如果其实是名字或路径，在它前面加 --，例如 quark ${cmd.name} <路径> -- ${dash[1]}`
        : `运行 quark ${cmd.name} --help 看用法`,
    );
  }
}

export async function main(argv) {
  const all = await load();
  const [name, ...rest] = argv;
  if (!name || isHelp(name) || name === "help") {
    console.log(topHelp(all));
    return EXIT.ok;
  }
  const cmd = all[name];
  if (!cmd) {
    const guess = nearest(name, Object.keys(all));
    throw fail("unknown_command", `没有这个命令: ${name}`, {
      next: `${guess ? `是不是想用 quark ${guess}？` : ""}运行 quark --help 看所有命令`.trim(),
    });
  }
  const { values: flags, positionals: args } = parse(cmd, rest);
  if (flags.help) {
    console.log(commandHelp(cmd));
    return EXIT.ok;
  }
  const format = pickFormat(flags);
  let result;
  const ctx = {
    args,
    flags,
    emit: (r) => {
      result = r;
    },
    progress: (msg) => console.error(msg),
  };
  if (cmd.auth === false) {
    await cmd.run(ctx);
  } else {
    const { context, page } = await open().catch((e) => {
      throw openError(e);
    });
    try {
      if (!(await isLoggedIn(page))) throw loginError();
      await cmd.run({ ...ctx, page, context });
    } finally {
      await context.close();
    }
  }
  const text = result ? render(format, result, { full: flags.full }) : "";
  if (text) console.log(text);
  return EXIT.ok;
}

export async function run(argv) {
  try {
    process.exitCode = await main(argv);
  } catch (e) {
    const err = e instanceof QuarkError ? e : new QuarkError(e.message);
    const format = ["--json", "--markdown"].find((f) => argv.includes(f))?.slice(2) ?? "yaml";
    console.error(
      renderError(format, {
        error: err.message,
        code: err.code,
        exit: err.exit,
        next: err.next,
        detail: err.detail,
        ...err.extra,
      }),
    );
    process.exitCode = err.exit;
  }
}
