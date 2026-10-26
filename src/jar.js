import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import https from "node:https";
import { QuarkError, loginError } from "./errors.js";

// The login lives in a Chrome profile; this file is a copy of its cookies, so most commands can
// call Quark's API straight from Node and only start Chrome to log in or to renew an expired
// session. It is as sensitive as the profile itself: owner-only permissions, never printed.
export const PROFILE = process.env.QUARK_PROFILE || join(homedir(), ".quark-cli", "profile");
export const JAR_PATH = `${PROFILE}.cookies.json`;

export function loadJar() {
  try {
    const jar = JSON.parse(readFileSync(JAR_PATH, "utf8"));
    return Array.isArray(jar.cookies) && jar.ua ? jar : null;
  } catch {
    return null;
  }
}

export function saveJar(jar) {
  mkdirSync(dirname(JAR_PATH), { recursive: true });
  writeFileSync(JAR_PATH, JSON.stringify(jar), { mode: 0o600 });
  chmodSync(JAR_PATH, 0o600);
}

export function removeJar() {
  if (existsSync(JAR_PATH)) rmSync(JAR_PATH, { force: true });
}

// Copies the profile's Quark cookies into the jar file.
export async function exportJar(context, page) {
  const cookies = await context.cookies(["https://pan.quark.cn", "https://drive-pc.quark.cn"]);
  saveJar({ cookies, ua: await page.evaluate(() => navigator.userAgent), savedAt: Date.now() });
}

const domainMatches = (host, domain) => {
  const d = domain.replace(/^\./, "");
  return host === d || host.endsWith(`.${d}`);
};

// Talks to Quark like the web app does, without a browser: the jar's cookies on every request,
// and any cookie Quark sets back is kept in the jar.
const CONNECT_MS = 3000;
const READ_MS = 30_000;
const ATTEMPTS = 4;

export class HttpSession {
  http = true;

  constructor(jar) {
    this.jar = jar;
    this.dirty = false;
    this.agent = new https.Agent({ keepAlive: true, maxSockets: 6 });
  }

  cookieHeader(url) {
    const { hostname } = new URL(url);
    const now = Date.now() / 1000;
    return this.jar.cookies
      .filter((c) => domainMatches(hostname, c.domain) && (c.expires < 0 || c.expires > now))
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  }

  absorb(lines, url) {
    for (const line of lines) {
      const [pair, ...attrs] = line.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const domain = attrs.find((a) => /^domain=/i.test(a))?.slice(7) ?? new URL(url).hostname;
      const maxAge = attrs.find((a) => /^max-age=/i.test(a))?.slice(8);
      const known = this.jar.cookies.find((c) => c.name === name && c.domain === domain);
      const expires = maxAge ? Date.now() / 1000 + Number(maxAge) : (known?.expires ?? -1);
      if (known) Object.assign(known, { value, expires });
      else this.jar.cookies.push({ name, value, domain, path: "/", expires });
      this.dirty = true;
    }
    if (this.dirty) {
      saveJar(this.jar);
      this.dirty = false;
    }
  }

  // Starts Chrome the first time something needs a real page (the web-uploader fallback).
  async chrome() {
    if (!this.browser) {
      const { open } = await import("./session.js");
      this.browser = await open();
    }
    return this.browser.page;
  }

  async close() {
    this.agent.destroy();
    await this.browser?.context.close();
  }

  userAgent() {
    return this.jar.ua;
  }

  // One HTTPS exchange. Resolves { status, setCookie, text }; rejects with an Error whose
  // `sent` says whether the request may have reached Quark (false: it died while connecting).
  exchange(url, { method, headers, payload }) {
    return new Promise((resolve, reject) => {
      let sent = false;
      const req = https.request(
        url,
        { method, headers, agent: this.agent, timeout: CONNECT_MS },
        (res) => {
          req.setTimeout(READ_MS);
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              setCookie: res.headers["set-cookie"] ?? [],
              text: Buffer.concat(chunks).toString("utf8"),
            }),
          );
          res.on("error", (e) => reject(Object.assign(e, { sent: true })));
        },
      );
      req.on("socket", (socket) => {
        // A reused socket is already connected; a new one connects first.
        if (!socket.connecting) sent = true;
        else socket.once("secureConnect", () => (sent = true));
      });
      req.on("timeout", () =>
        req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
      );
      req.on("error", (e) => reject(Object.assign(e, { sent })));
      if (payload) req.write(payload);
      req.end();
    });
  }

  async fetchJson(url, { method = "GET", body } = {}) {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers = {
      cookie: this.cookieHeader(url),
      "user-agent": this.jar.ua,
      referer: "https://pan.quark.cn/",
      origin: "https://pan.quark.cn",
      accept: "application/json",
      ...(payload
        ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
        : {}),
    };
    let last;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await this.exchange(url, { method, headers, payload });
        // Quark answers 401 when the cookies are gone or expired.
        if (res.status === 401) throw loginError();
        this.absorb(res.setCookie, url);
        return JSON.parse(res.text);
      } catch (e) {
        if (e instanceof QuarkError) throw e;
        last = e;
        // Safe to try again: it never connected, or it only reads.
        if (!(e.sent === false || method === "GET")) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((done) => setTimeout(done, 150 * attempt));
      }
    }
    throw new QuarkError("访问夸克时网络出了问题", {
      code: "network",
      next:
        method === "GET" ? "检查网络后重试" : "先用 quark ls 看操作有没有生效，再决定要不要重试",
      detail: String(last?.code ?? last?.message ?? last),
    });
  }
}
