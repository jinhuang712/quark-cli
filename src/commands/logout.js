import { rmSync } from "node:fs";
import { PROFILE, removeJar } from "../jar.js";

export default {
  name: "logout",
  usage: "logout",
  summary: "退出登录，清掉本机保存的登录态",
  group: "account",
  auth: false,
  args: [],
  examples: ["quark logout"],
  effect: { changes: false, undo: "重新运行 quark login 扫码", login: false },
  errors: [],
  related: ["login", "whoami"],
  async run({ emit }) {
    rmSync(PROFILE, { recursive: true, force: true });
    removeJar();
    emit({ data: { logged_out: true }, lines: [] });
  },
};
