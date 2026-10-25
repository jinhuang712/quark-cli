import { nickname, member } from '../account.js';
import { isoTime } from '../format.js';

export default {
  name: 'whoami',
  usage: 'whoami',
  summary: '显示账号名、已用和总容量、是否会员',
  group: 'account',
  auth: true,
  args: [],
  examples: ['quark whoami', 'quark whoami --json'],
  effect: { changes: false },
  errors: ['not_logged_in'],
  related: ['login', 'logout'],
  async run({ page, emit }) {
    const [name, m] = await Promise.all([nickname(page), member(page)]);
    const isMember = Boolean(m.member_type) && m.member_type !== 'NORMAL';
    emit({
      data: {
        name,
        used: m.use_capacity,
        total: m.total_capacity,
        member: isMember,
        member_until: isMember && m.exp_at ? isoTime(m.exp_at).slice(0, 10) : null,
      },
      lines: [name],
      full: { name, ...m },
    });
  },
};
