// @ts-check

export const WEAR_LIMITS = Object.freeze({ wears: 20000, plans: 5000, itemsPerWear: 60, idLength: 64 });
export const DAY_MS = 86400000;

/** @typedef {{ id: string, d: string, o?: string, n: string, items: string[] }} Wear  d = Tag (JJJJ-MM-TT), o = Outfit, n = Name zum Zeitpunkt des Eintrags */
/** @typedef {Record<string, string>} Plans  Tag → Outfit-Kennung */

/** @param {unknown} s @returns {s is string} */
export function isDay(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Lokaler Kalendertag eines Datums. @param {Date} date */
export const dayKey = date => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** @param {string} key @returns {number} Tag als fortlaufende Zahl (nur für Abstände) */
const ordinal = key => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY_MS); };

/** Tage zwischen zwei Tagen (b − a). @param {string} a @param {string} b */
export const daysBetween = (a, b) => ordinal(b) - ordinal(a);

/** @param {string} key @param {number} n */
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Gleicher Tag im Nachbarmonat; der Tag rutscht auf den Monatsletzten, wenn es ihn dort nicht gibt. @param {string} key @param {number} n */
export function shiftMonth(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${String(first.getUTCFullYear()).padStart(4, '0')}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * 6 Wochen ab Montag, die den Monat enthalten.
 * @param {number} year @param {number} month 0 = Januar
 * @returns {{ key: string, inMonth: boolean }[]}
 */
export function monthGrid(year, month) {
  const first = Date.UTC(year, month, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const t = new Date(first + (i - lead) * DAY_MS);
    const key = `${String(t.getUTCFullYear()).padStart(4, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
    return { key, inMonth: t.getUTCMonth() === month };
  });
}

/**
 * @param {unknown} raw
 * @param {ReadonlySet<string>} itemIds bekannte Teile (unbekannte werden entfernt)
 * @param {(v: unknown) => string} clean Textreiniger für den Namen (sanitizeText aus scraper.js)
 * @returns {Wear[]}
 */
export function sanitizeWears(raw, itemIds, clean) {
  if (!Array.isArray(raw)) return [];
  /** @type {Wear[]} */
  const out = [];
  const seen = new Set();
  for (const r of raw) {
    if (out.length >= WEAR_LIMITS.wears) break;
    if (!r || typeof r !== 'object') continue;
    const w = /** @type {Record<string, any>} */ (r);
    if (!isDay(w.d) || !Array.isArray(w.items)) continue;
    const items = [...new Set(w.items.filter((/** @type {unknown} */ i) => typeof i === 'string' && itemIds.has(i)))].slice(0, WEAR_LIMITS.itemsPerWear);
    if (!items.length) continue;
    let id = typeof w.id === 'string' && w.id !== '' && w.id.length <= WEAR_LIMITS.idLength ? w.id : 'w' + out.length.toString(36) + Date.now().toString(36);
    if (seen.has(id)) id += out.length.toString(36);
    seen.add(id);
    /** @type {Wear} */
    const wear = { id, d: w.d, n: clean(w.n) || 'Outfit', items: /** @type {string[]} */ (items) };
    if (typeof w.o === 'string' && w.o !== '' && w.o.length <= WEAR_LIMITS.idLength) wear.o = w.o;
    out.push(wear);
  }
  return out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

/**
 * @param {unknown} raw
 * @param {ReadonlySet<string>} outfitIds
 * @returns {Plans}
 */
export function sanitizePlans(raw, outfitIds) {
  /** @type {Plans} */
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let n = 0;
  for (const [d, o] of Object.entries(raw)) {
    if (n >= WEAR_LIMITS.plans) break;
    if (isDay(d) && typeof o === 'string' && outfitIds.has(o)) { out[d] = o; n++; }
  }
  return out;
}

/**
 * Trägt einen Tag ein. Dasselbe Outfit am selben Tag zählt nur einmal.
 * @param {Wear[]} wears
 * @param {{ id: string, d: string, o?: string, n: string, items: string[] }} entry
 * @returns {Wear[] | null} neue Liste, oder null wenn es den Eintrag schon gibt oder er ungültig ist
 */
export function addWear(wears, entry) {
  if (!isDay(entry.d) || !entry.items.length) return null;
  if (entry.o && wears.some(w => w.d === entry.d && w.o === entry.o)) return null;
  if (wears.length >= WEAR_LIMITS.wears) return null;
  return [...wears, { ...entry, items: [...new Set(entry.items)].slice(0, WEAR_LIMITS.itemsPerWear) }].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

/** Entfernt ein gelöschtes Teil aus allen Einträgen (leere Einträge fallen weg). @param {Wear[]} wears @param {string} itemId */
export const withoutItem = (wears, itemId) => wears.map(w => (w.items.includes(itemId) ? { ...w, items: w.items.filter(i => i !== itemId) } : w)).filter(w => w.items.length);

/** Entfernt Pläne für ein gelöschtes Outfit. @param {Plans} plans @param {string} outfitId @returns {Plans} */
export const withoutOutfit = (plans, outfitId) => Object.fromEntries(Object.entries(plans).filter(([, o]) => o !== outfitId));

/**
 * Wie oft (an wie vielen verschiedenen Tagen) jedes Teil getragen wurde und wann zuletzt.
 * @param {readonly Wear[]} wears
 * @param {string} [until] nur Einträge bis zu diesem Tag zählen (Standard: alle)
 * @returns {Map<string, { count: number, last: string }>}
 */
export function wearStats(wears, until) {
  /** @type {Map<string, Set<string>>} */
  const days = new Map();
  for (const w of wears) {
    if (until && w.d > until) continue;
    for (const id of w.items) { if (!days.has(id)) days.set(id, new Set()); /** @type {Set<string>} */ (days.get(id)).add(w.d); }
  }
  return new Map([...days].map(([id, set]) => [id, { count: set.size, last: [...set].sort().pop() ?? '' }]));
}

/** Kosten pro Tragen oder null (kein Preis oder noch nie getragen). @param {number | null | undefined} price @param {number} count */
export const costPerWear = (price, count) => (typeof price === 'number' && Number.isFinite(price) && price >= 0 && count > 0 ? price / count : null);

/**
 * Besessene Teile, die seit `idleDays` nicht (oder nie) getragen wurden. Längste Pause zuerst, nie getragene am Ende nach Preis.
 * @template {{ id: string, status?: string, price?: number | null }} T
 * @param {readonly T[]} items @param {readonly Wear[]} wears @param {string} today @param {number} [idleDays]
 * @returns {{ item: T, last: string | null, idle: number | null }[]}
 */
export function dormant(items, wears, today, idleDays = 90) {
  const stats = wearStats(wears, today);
  const rows = items.filter(i => i.status !== 'wish').map(item => {
    const s = stats.get(item.id);
    return { item, last: s ? s.last : null, idle: s ? daysBetween(s.last, today) : null };
  }).filter(r => r.idle === null || r.idle >= idleDays);
  return rows.sort((a, b) => (a.idle === null ? 1 : 0) - (b.idle === null ? 1 : 0) || (b.idle ?? 0) - (a.idle ?? 0) || (b.item.price ?? 0) - (a.item.price ?? 0));
}

/** @param {number} days */
export const idleText = days => (days <= 0 ? 'heute' : days === 1 ? 'gestern' : days < 60 ? 'vor ' + days + ' Tagen' : 'vor ' + Math.round(days / 30.4) + ' Monaten');
