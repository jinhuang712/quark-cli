import { isoTime } from "../format.js";
import { listShares, shareLink } from "../shares.js";

const DAY = 86400000;
const HOUR = 3600000;

function remaining(s) {
  if (s.expired_type === 1) return "permanent";
  const left = s.expired_left ?? s.expired_at - Date.now();
  if (left <= 0) return "expired";
  return left >= DAY ? `${Math.floor(left / DAY)}d` : `${Math.max(1, Math.floor(left / HOUR))}h`;
}

export default {
  name: "shares",
  usage: "shares",
  summary: "列出我创建的所有分享",
  http: true,
  group: "share",
  args: [],
  examples: ["quark shares", "quark shares --raw"],
  effect: { changes: false },
  errors: [],
  related: ["share", "unshare"],
  async run({ page, emit }) {
    const shares = await listShares(page);
    const items = shares.map((s) => ({
      name: s.title,
      link: shareLink(s),
      ...(s.passcode && { code: s.passcode }),
      created: isoTime(s.created_at),
      remaining: remaining(s),
    }));
    emit({ data: items, lines: items.map((i) => i.link), full: shares });
  },
};
