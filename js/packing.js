// @ts-check
import { NEUTRAL, ORDER, WEATHER_LABEL, weatherFit } from './stylist.js';
import { wearStats } from './wear.js';

/** @typedef {import('./stylist.js').Weather} Weather */
/** @typedef {import('./stylist.js').Piece} Piece */
/** @typedef {{ cat: string, want: number, items: Piece[] }} Group */

export const MAX_DAYS = 30;
const MAX_ACCENTS = 2;   // mehr Farbakzente, und nicht mehr alles passt zusammen

/** Wie viele Teile je Kategorie für so viele Tage. @param {number} days @param {Weather} weather @returns {Record<string, number>} */
export function targets(days, weather) {
  return {
    'Jacke': weather === 'warm' ? 0 : 1,
    'Oberteil': days <= 2 ? 2 : Math.min(8, Math.ceil(days * 0.6)),
    'Hose/Rock': days <= 3 ? 1 : days <= 7 ? 2 : 3,
    'Schuhe': days <= 3 ? 1 : 2,
    'Accessoire': weather === 'kalt' ? 2 : 1,
  };
}

/**
 * Packliste aus dem eigenen Schrank: wenige Teile, die sich gut kombinieren lassen.
 * Basisteile (Hose, Schuhe, Jacke) zuerst und möglichst neutral, danach Oberteile; möglichst höchstens zwei Farbakzente insgesamt (reicht das Neutrale nicht, wird trotzdem aufgefüllt).
 * @param {readonly Piece[]} items
 * @param {readonly { d: string, items: string[] }[]} wears
 * @param {{ days: number, weather: Weather, today: string }} opts
 * @returns {{ days: number, groups: Group[], combos: number, short: { cat: string, want: number, have: number }[] }}
 */
export function capsule(items, wears, opts) {
  const days = Math.min(MAX_DAYS, Math.max(1, Math.floor(Number.isFinite(opts.days) ? opts.days : 1)));
  const want = targets(days, opts.weather);
  const stats = wearStats(/** @type {any} */ (wears), opts.today);
  const own = items.filter(i => i && i.status !== 'wish');
  /** @type {Set<string>} */
  const accents = new Set();
  /** @type {Map<string, Piece[]>} */
  const chosen = new Map();
  for (const cat of ['Hose/Rock', 'Schuhe', 'Jacke', 'Oberteil', 'Accessoire']) {
    const picked = /** @type {Piece[]} */ ([]);
    const pool = own.filter(i => i.cat === cat);
    for (let k = 0; k < want[cat] && pool.length; k++) {
      const score = (/** @type {Piece} */ it) => {
        const c = it.color;
        let s = weatherFit(it, opts.weather).score + Math.min(stats.get(it.id)?.count ?? 0, 10) * 0.2;
        if (!c) s += 0.5;
        else if (NEUTRAL.has(c)) s += 2;
        else if (accents.has(c)) s += 1;
        else if (accents.size >= MAX_ACCENTS) s -= 10;
        if (c && picked.some(p => p.color === c)) s -= 1.5;   // lieber Abwechslung als dreimal dasselbe
        return s;
      };
      const best = pool.map(it => ({ it, s: score(it) })).sort((a, b) => b.s - a.s || (a.it.name < b.it.name ? -1 : a.it.name > b.it.name ? 1 : a.it.id < b.it.id ? -1 : 1))[0].it;
      picked.push(best); pool.splice(pool.indexOf(best), 1);
      if (best.color && !NEUTRAL.has(best.color)) accents.add(best.color);
    }
    chosen.set(cat, picked);
  }
  const groups = ORDER.map(cat => ({ cat, want: want[cat], items: chosen.get(cat) || [] })).filter(g => g.want > 0);
  const n = (/** @type {string} */ cat) => (chosen.get(cat) || []).length;
  return {
    days, groups,
    combos: n('Oberteil') * n('Hose/Rock') * Math.max(1, n('Jacke')),
    short: groups.filter(g => g.items.length < g.want).map(g => ({ cat: g.cat, want: g.want, have: g.items.length })),
  };
}

/** Die Liste als Text zum Kopieren und Einfügen. @param {ReturnType<typeof capsule>} r @param {Weather} weather */
export function packText(r, weather) {
  const lines = [`Packliste für ${r.days} ${r.days === 1 ? 'Tag' : 'Tage'} (${WEATHER_LABEL[weather]})`];
  for (const g of r.groups) {
    if (!g.items.length) continue;
    lines.push('', g.cat);
    for (const it of g.items) lines.push('☐ ' + it.name + (it.color ? ' (' + it.color + ')' : ''));
  }
  return lines.join('\n');
}
