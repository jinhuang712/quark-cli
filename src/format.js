export function size(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)}K`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)}M`;
  return `${(n / 1073741824).toFixed(2)}G`;
}

const pad = (n) => String(n).padStart(2, '0');

export function time(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// One line of `ls`/`search` output; `file` is an entry from the drive's list API.
export function row(file, { path } = {}) {
  const dir = file.dir ?? file.file_type === 0;
  const name = `${path ?? file.file_name}${dir ? '/' : ''}`;
  return `${dir ? 'd' : '-'} ${dir ? '-' : size(file.size)}\t${time(file.l_updated_at)}\t${name}`;
}
