import { nickname, member } from '../account.js';
import { size, time } from '../format.js';

const TYPES = { SUPER_VIP: '超级会员', VIP: '会员', MINI_VIP: '迷你会员', Z_VIP: 'ZVIP' };

export default {
  name: 'whoami',
  usage: 'whoami [--json]',
  summary: 'show account name, capacity and membership',
  auth: true,
  async run({ page, out }) {
    const [name, m] = await Promise.all([nickname(page), member(page)]);
    const isMember = Boolean(m.member_type) && m.member_type !== 'NORMAL';
    const type = TYPES[m.member_type] ?? m.member_type;
    const expires = m.exp_at ? time(m.exp_at).slice(0, 10) : null;
    const lines = [
      `账号: ${name}`,
      `容量: ${size(m.use_capacity)} / ${size(m.total_capacity)}`,
      `会员: ${isMember ? `是（${type}${expires ? `，${expires} 到期` : ''}）` : '否'}`,
    ];
    out(lines.join('\n'), {
      name,
      used: m.use_capacity,
      total: m.total_capacity,
      member: isMember,
      memberType: m.member_type,
      expiresAt: m.exp_at ?? null,
    });
  },
};
