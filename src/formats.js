const TOKEN = /⟦(\d+)⟧/g;

const SHARED_SPANS = [
  '<[^<>]*>',
  '&(?:[A-Za-z][A-Za-z0-9]*|#\\d+|#[xX][0-9A-Fa-f]+);',
  '%(?:\\d+\\$)?[-#+0,(]*\\d*(?:\\.\\d+)?[sdifgxXeEocb]',
  '\\{\\d+\\}',
  '\\$\\{[^{}]*\\}',
  '\\\\u[0-9A-Fa-f]{4}',
  "\\\\[ntr'\"\\\\]",
];

export const MARKDOWN_SPANS = [
  '```[\\s\\S]*?```',
  '`[^`\\n]+`',
  'https?://[^\\s<>()\\]]+',
  '\\]\\([^()\\s]*\\)',
];

export function protect(text, extra = []) {
  const spans = [];
  const value = text.replace(new RegExp([...extra, ...SHARED_SPANS].join('|'), 'g'), (match) => `⟦${spans.push(match) - 1}⟧`);
  return { value, spans };
}

export function tokensBalanced(source, translated, spans) {
  if (typeof translated !== 'string' || !translated.trim()) return false;
  const seen = new Set();
  for (const match of translated.matchAll(TOKEN)) {
    const index = Number(match[1]);
    if (index >= spans.length || seen.has(index)) return false;
    seen.add(index);
  }
  if (seen.size !== spans.length) return false;
  return !/[⟦⟧]/.test(translated.replace(TOKEN, ''));
}

export function restore(translated, spans) {
  return translated.replace(TOKEN, (_, index) => spans[Number(index)] ?? '');
}

const STRING_RE = /<string\b([^>]*)>([\s\S]*?)<\/string\s*>/g;
const GROUP_RE = /<(string-array|plurals)\b([^>]*)>([\s\S]*?)<\/\1\s*>/g;
const ITEM_RE = /<item\b([^>]*)>([\s\S]*?)<\/item\s*>/g;
const OPTED_OUT = /(?:^|\s)translatable\s*=\s*"false"/i;
const NAME_RE = /\bname\s*=\s*"([^"]*)"/i;

function trimmed(raw, base) {
  const value = raw.trim();
  const start = base + raw.length - raw.trimStart().length;
  return { start, end: start + value.length, value };
}

export function parseAndroid(content) {
  const entries = [];
  const add = (attrs, raw, base, name) => {
    if (OPTED_OUT.test(attrs)) return;
    const { start, end, value } = trimmed(raw, base);
    if (!value || value.startsWith('@') || value.startsWith('?') || value.startsWith('<![CDATA[')) return;
    entries.push({ index: entries.length, name, start, end, value });
  };
  for (const match of content.matchAll(STRING_RE)) {
    add(match[1], match[2], match.index + match[0].indexOf('>') + 1, NAME_RE.exec(match[1])?.[1] || 'string');
  }
  for (const group of content.matchAll(GROUP_RE)) {
    if (OPTED_OUT.test(group[2])) continue;
    const base = group.index + group[0].indexOf('>') + 1;
    const groupName = NAME_RE.exec(group[2])?.[1] || group[1];
    for (const item of group[3].matchAll(ITEM_RE)) {
      add(item[1], item[2], base + item.index + item[0].indexOf('>') + 1, groupName);
    }
  }
  entries.sort((a, b) => a.start - b.start);
  entries.forEach((entry, index) => { entry.index = index; });
  return { format: 'xml', content, entries };
}

function blockName(part) {
  const line = part.trim().split('\n').find((item) => item.trim()) || '';
  const cleaned = line.replace(/^#{1,6}\s*/, '').trim();
  return cleaned.slice(0, 70) || 'Đoạn văn';
}

export function parsePlain(content) {
  const parts = content.split(/(\r?\n[ \t]*(?:\r?\n[ \t]*)+)/);
  const entries = [];
  parts.forEach((part, partIndex) => {
    if (partIndex % 2 === 1 || !part.trim()) return;
    entries.push({ index: entries.length, part: partIndex, name: blockName(part), value: part });
  });
  return { format: 'text', parts, entries };
}

export function parseFile(filename, content) {
  const extension = (/\.([a-z0-9]+)$/i.exec(filename)?.[1] || '').toLowerCase();
  if (extension === 'xml') return parseAndroid(content);
  if (extension === 'txt' || extension === 'md' || extension === 'markdown') return parsePlain(content);
  throw Object.assign(new Error('Chỉ hỗ trợ tệp .xml, .txt hoặc .md.'), { status: 400 });
}

export function renderFile(parsed, translations) {
  if (parsed.format === 'xml') {
    let output = parsed.content;
    for (const entry of [...parsed.entries].sort((a, b) => b.start - a.start)) {
      const value = translations.get(entry.index);
      if (value !== undefined) output = output.slice(0, entry.start) + value + output.slice(entry.end);
    }
    return output;
  }
  const parts = [...parsed.parts];
  for (const entry of parsed.entries) {
    const value = translations.get(entry.index);
    if (value !== undefined) parts[entry.part] = value;
  }
  return parts.join('');
}
