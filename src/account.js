import { call, fetchJson } from "./session.js";
import { fail } from "./errors.js";

// Account nickname from the web app's own account endpoint.
export async function nickname(page) {
  const res = await fetchJson(page, "https://pan.quark.cn/account/info?fr=pc&platform=pc");
  if (!res.success) {
    throw fail("error", "读取账号信息失败", {
      next: "稍后重试；反复失败请用户运行 `quark login` 重新登录",
      detail: res.msg || JSON.stringify(res),
    });
  }
  return res.data.nickname;
}

// Membership and capacity from the drive API.
export async function member(page) {
  const { data } = await call(page, "GET", "/member", {
    query: { fetch_subscribe: "true", _ch: "home", fetch_identity: "true" },
  });
  return data;
}
