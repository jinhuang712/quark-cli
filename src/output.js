import YAML from 'yaml';
import { usageError } from './errors.js';

export const FORMAT_FLAGS = ['json', 'markdown', 'raw'];

// FEATURES.md → F17: yaml by default; --json, --markdown and --raw are mutually exclusive.
export function pickFormat(flags) {
  const given = FORMAT_FLAGS.filter((f) => flags[f]);
  if (given.length > 1) {
    throw usageError(`输出选项只能选一个，收到了 ${given.map((f) => `--${f}`).join(' 和 ')}`, '只保留其中一个');
  }
  return given[0] ?? 'yaml';
}

// YAML 1.1 mode quotes values such as yes, no and 2024 so a strict parser reads them as strings.
const yaml = (data) => YAML.stringify(data, { version: '1.1', lineWidth: 0 }).trimEnd();

const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.replaceAll('|', String.raw`\|`).replaceAll('\n', ' ');
};

function table(rows) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(cols), line(cols.map(() => '---')), ...rows.map((r) => line(cols.map((c) => cell(r[c]))))].join('\n');
}

function markdown(data) {
  if (Array.isArray(data)) {
    if (data.length === 0) return '（空）';
    return data.every((r) => r && typeof r === 'object') ? table(data) : data.map((v) => `- ${cell(v)}`).join('\n');
  }
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([k, v]) =>
        Array.isArray(v) && v.length > 0 && v.every((r) => r && typeof r === 'object')
          ? `**${k}**\n\n${table(v)}`
          : `- ${k}: ${cell(v)}`,
      )
      .join('\n');
  }
  return String(data);
}

// result: { data, lines?, full? }. `lines` feeds --raw; `full` replaces `data` under --full.
export function render(format, result, { full = false } = {}) {
  const data = full && result.full !== undefined ? result.full : result.data;
  if (format === 'json') return JSON.stringify(data, null, 2);
  if (format === 'markdown') return markdown(data);
  if (format === 'raw') return (result.lines ?? []).join('\n');
  return yaml(data);
}

// Errors keep their own shape; --raw has no meaning for them, so it falls back to yaml.
export function renderError(format, fields) {
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  return render(format === 'raw' ? 'yaml' : format, { data: clean });
}
