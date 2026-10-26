import { parseArgs } from "node:util";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { open, isLoggedIn, openError } from "./session.js";
import { HttpSession, exportJar, loadJar } from "./jar.js";
import { EXIT, QuarkError, fail, loginError, usageError } from "./errors.js";
import { pickFormat, render, renderError } from "./output.js";
import { commandHelp, nearest, topHelp } from "./help.js";

const dir = fileURLToPath(new URL("./commands/", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

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

// Runs a read-only command from Node with the saved cookies. Returns false when there is no
// usable session (no jar, or Quark says it expired), so the caller can renew it through Chrome.
async function runOverHttp(cmd, ctx) {
  const jar = loadJar();
  if (!jar) return false;
  const page = new HttpSession(jar);
  try {
    await cmd.run({ ...ctx, page });
    return true;
  } catch (e) {
    if (e instanceof QuarkError && e.code === "not_logged_in") return false;
    throw e;
  } finally {
    await page.close();
  }
}

export async function main(argv) {
  const [name, ...rest] = argv;
  // Only the requested command is loaded; help and typos need the whole set.
  const single = name && /^[a-z]+$/.test(name) && existsSync(`${dir}${name}.js`);
  const all = single ? { [name]: (await import(`./commands/${name}.js`)).default } : await load();
  if (!name || isHelp(name) || name === "help") {
    console.log(topHelp(all));
    return EXIT.ok;
  }
  if (name === "--version") {
    console.log(`quark ${pkg.version}`);
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
    if (cmd.http && (await runOverHttp(cmd, ctx))) {
      // done without starting Chrome
    } else {
      const { context, page } = await open().catch((e) => {
        throw openError(e);
      });
      try {
        if (!(await isLoggedIn(page))) throw loginError();
        // Keep the jar fresh: it is what the Chrome-free commands use next time.
        await exportJar(context, page);
        await cmd.run({ ...ctx, page, context });
      } finally {
        await context.close();
      }
    }
  }
  const text = result ? render(format, result, { full: flags.full }) : "";
  if (text) console.log(text);
  return EXIT.ok;
}

export async function run(argv) {
  // Ctrl-C also kills Chrome, so what the command throws next is Playwright noise: swallow it.
  // The command still unwinds (partial downloads are removed); a second Ctrl-C kills at once.
  let interrupted = false;
  process.once("SIGINT", () => {
    interrupted = true;
    setTimeout(() => process.exit(130), 3000).unref();
  });
  try {
    process.exitCode = await main(argv);
  } catch (e) {
    if (interrupted) {
      process.exitCode = 130;
      return;
    }
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
