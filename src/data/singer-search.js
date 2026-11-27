import { SINGERS } from './singers.js';

export const singerSearchKey = (value) => String(value || '').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '').trim().toLocaleLowerCase().replace(/\s+/gu, ' ');

const singerIndex = SINGERS.map(([name, initials]) => ({ name, key: singerSearchKey(name), initials }));

export function singerSuggestionsFor(query, limit = 8) {
  const key = singerSearchKey(query);
  if (!key) return [];
  const prefix = [];
  const middle = [];
  const pinyin = [];
  for (const singer of singerIndex) {
    if (singer.key.startsWith(key)) {
      if (prefix.length < limit) prefix.push(singer.name);
    } else if (singer.key.includes(key)) {
      if (middle.length < limit) middle.push(singer.name);
    } else if (singer.initials.startsWith(key)) {
      if (pinyin.length < limit) pinyin.push(singer.name);
    }
  }
  return [...prefix, ...middle, ...pinyin].slice(0, limit);
}
