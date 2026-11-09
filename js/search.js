// @ts-check
export const TAG_LIMITS = Object.freeze({ count: 12, length: 30 });

/** Kleinbuchstaben ohne Akzente, ß = ss: „Weiß“, „WEISS“ und „weiss“ sind gleich. @param {unknown} s */
export const fold = s => String(s ?? '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * @param {unknown} raw Liste von Tags
 * @param {(v: unknown) => string} clean Textreiniger (sanitizeText aus scraper.js)
 * @returns {string[]} ohne Doppelte (Groß- und Kleinschreibung zählt nicht), höchstens TAG_LIMITS.count
 */
export function sanitizeTags(raw, clean) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const t of raw) {
    if (out.length >= TAG_LIMITS.count) break;
    if (typeof t !== 'string') continue;
    const v = clean(t).replace(/^#+/, '').trim().slice(0, TAG_LIMITS.length).trim();
    const k = fold(v);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(v);
  }
  return out;
}

/** Tags aus einem Eingabefeld („Büro, Sommer; #Leinen“). @param {string} text @param {(v: unknown) => string} clean */
export const parseTags = (text, clean) => sanitizeTags(String(text ?? '').slice(0, 1000).split(/[,;\n]/), clean);

/**
 * @param {{ name?: string, cat?: string, color?: string, tags?: unknown, status?: string, link?: string }} it
 * @param {string} host Domain des Shop-Links
 */
function haystack(it, host) {
  const tags = Array.isArray(it.tags) ? it.tags.filter(t => typeof t === 'string') : [];
  return fold([it.name, it.cat, it.color, ...tags, it.status === 'wish' ? 'wunschliste wunsch' : 'besitze besitz', host].filter(Boolean).join(' '));
}

/**
 * Alle Suchwörter müssen vorkommen (in Name, Kategorie, Farbe, Tags, Status oder Shop).
 * @param {Parameters<typeof haystack>[0]} it
 * @param {string} query
 * @param {string} [host]
 */
export function matchItem(it, query, host = '') {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const h = haystack(it, host);
  return terms.every(t => h.includes(t));
}

/** Tags aller Teile, häufigste zuerst. @param {readonly { tags?: unknown }[]} items @returns {{ tag: string, count: number }[]} */
export function allTags(items) {
  /** @type {Map<string, { tag: string, count: number }>} */
  const m = new Map();
  for (const it of items) {
    if (!Array.isArray(it.tags)) continue;
    for (const t of it.tags) {
      if (typeof t !== 'string' || !t) continue;
      const k = fold(t), e = m.get(k);
      if (e) e.count++; else m.set(k, { tag: t, count: 1 });
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'de'));
}

/** @param {{ tags?: unknown }} it @param {string} tag */
export const hasTag = (it, tag) => Array.isArray(it.tags) && it.tags.some(t => typeof t === 'string' && fold(t) === fold(tag));
