import { time } from '../format.js';
import { listShares, shareLink } from '../shares.js';

const DAY = 86400000;
const HOUR = 3600000;

function remaining(s) {
  if (s.expired_type === 1) return 'permanent';
  const left = s.expired_left ?? s.expired_at - Date.now();
  if (left <= 0) return 'expired';
  return left >= DAY ? `${Math.floor(left / DAY)}d` : `${Math.max(1, Math.floor(left / HOUR))}h`;
}

export default {
  name: 'shares',
  usage: 'shares',
  summary: 'list my share links',
  async run({ page, out }) {
    const items = (await listShares(page)).map((s) => ({
      name: s.title,
      link: shareLink(s),
      code: s.passcode ?? null,
      created: s.created_at,
      remaining: remaining(s),
    }));
    const human = items
      .map((i) => `${i.name}\t${i.link}${i.code ? ` (${i.code})` : ''}\t${time(i.created)}\t${i.remaining}`)
      .join('\n');
    out(human, items);
  },
};
