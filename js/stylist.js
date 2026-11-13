// @ts-check
import { daysBetween, wearStats } from './wear.js';

/** @typedef {'kalt' | 'mild' | 'warm' | 'regen'} Weather */
/** @typedef {{ id: string, name: string, cat: string, color?: string, tags?: string[], status?: string }} Piece */
/** @typedef {{ ids: string[], score: number, reasons: string[] }} Suggestion */

/** @type {readonly Weather[]} */
export const WEATHER = Object.freeze(['kalt', 'mild', 'warm', 'regen']);
export const WEATHER_LABEL = Object.freeze({ kalt: 'Kalt', mild: 'Mild', warm: 'Warm', regen: 'Regen' });
/** Farben, die zu fast allem passen. */
export const NEUTRAL = new Set(['Schwarz', 'Weiß', 'Grau', 'Beige', 'Braun']);
const WARM_TONES = new Set(['Rot', 'Orange', 'Gelb', 'Rosa']);
const COOL_TONES = new Set(['Blau', 'Grün', 'Lila']);
/** Anzeigereihenfolge im Outfit: von oben nach unten. */
export const ORDER = Object.freeze(['Jacke', 'Oberteil', 'Hose/Rock', 'Schuhe', 'Accessoire']);
/** @type {Record<Weather, { req: string[], opt: string[] }>} */
const NEED = {
  kalt: { req: ['Oberteil', 'Hose/Rock', 'Jacke', 'Schuhe'], opt: ['Accessoire'] },
  mild: { req: ['Oberteil', 'Hose/Rock', 'Schuhe'], opt: ['Jacke'] },
  warm: { req: ['Oberteil', 'Hose/Rock', 'Schuhe'], opt: [] },
  regen: { req: ['Oberteil', 'Hose/Rock', 'Jacke', 'Schuhe'], opt: ['Accessoire'] },
};
/** Abzug für Teile, die im vorigen Satz Vorschläge schon vorkamen (damit „Neue Vorschläge“ wirklich andere Teile nutzt). */
const AVOID = 2.5;
const POOL = 5;   // so viele Kandidaten je Kategorie kommen in die engere Wahl

/** Kleine, deterministische Zufallsfolge (gleiche Zahl → gleiche Folge). @param {number} seed */
export function rng(seed) {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Wie gut passt das Teil zum Wetter? Maßgeblich sind Tags, die man selbst vergibt (Sommer, Winter, Übergang, Regen, wasserdicht).
 * @param {Piece} it @param {Weather} weather @returns {{ score: number, tag: string }}
 */
export function weatherFit(it, weather) {
  const tags = (Array.isArray(it.tags) ? it.tags : []).filter(/** @returns {t is string} */ t => typeof t === 'string');
  const has = (/** @type {string[]} */ ...names) => tags.find(t => names.includes(t.toLowerCase())) || '';
  const summer = has('sommer'), winter = has('winter'), between = has('übergang', 'uebergang', 'frühling', 'herbst'), rain = has('regen', 'wasserdicht');
  if (weather === 'kalt') return winter ? { score: 2, tag: winter } : summer ? { score: -3, tag: summer } : { score: 0, tag: '' };
  if (weather === 'warm') return summer ? { score: 2, tag: summer } : winter ? { score: -3, tag: winter } : { score: 0, tag: '' };
  if (weather === 'regen') return rain ? { score: 3, tag: rain } : winter && it.cat !== 'Jacke' ? { score: -1, tag: winter } : { score: 0, tag: '' };
  return between ? { score: 1, tag: between } : winter || summer ? { score: -1, tag: winter || summer } : { score: 0, tag: '' };
}

/**
 * Bewertung der Farben eines Outfits. Ruhige Farben und ein einzelner Akzent sind gut, viele verschiedene Akzente nicht.
 * @param {(string | undefined)[]} colors
 * @returns {{ score: number, note: string }}
 */
export function colorHarmony(colors) {
  const accents = [...new Set(colors.filter(/** @returns {c is string} */ c => !!c && !NEUTRAL.has(c)))];
  if (accents.length === 0) return { score: 3, note: 'Ruhige Farben' };
  if (accents.length === 1) return { score: 2, note: 'Ein Farbakzent: ' + accents[0] };
  const family = accents.every(c => WARM_TONES.has(c)) || accents.every(c => COOL_TONES.has(c));
  if (accents.length === 2 && family) return { score: 0, note: 'Verwandte Farben' };
  return { score: accents.length === 2 ? -2 : -5, note: '' };
}

/**
 * Schlägt Outfits aus den vorhandenen Teilen vor. Wunschlisten-Teile zählen nicht.
 * @param {readonly Piece[]} items
 * @param {readonly { d: string, items: string[] }[]} wears
 * @param {{ weather: Weather, today: string, seed?: number, count?: number, avoid?: readonly string[] }} opts avoid: Teile, die gerade schon gezeigt wurden und diesmal zurückstehen sollen
 * @returns {{ suggestions: Suggestion[], missing: string[] }}
 */
export function suggest(items, wears, opts) {
  const { weather, today } = opts, count = Math.max(1, opts.count ?? 3), rnd = rng(opts.seed ?? 1);
  const need = NEED[weather] || NEED.mild;
  const avoid = new Set(Array.isArray(opts.avoid) ? opts.avoid : []);
  const own = items.filter(i => i && i.status !== 'wish');
  const stats = wearStats(/** @type {any} */ (wears), today);
  /** @type {Map<string, { score: number, idle: number | null }>} */
  const base = new Map();
  for (const it of own) {
    const s = stats.get(it.id), idle = s ? daysBetween(s.last, today) : null;
    const fresh = idle === null ? 2.5 : idle <= 2 ? -2 : Math.min(idle, 90) / 30;
    base.set(it.id, { score: fresh + weatherFit(it, weather).score + rnd() * 1.5 - (avoid.has(it.id) ? AVOID : 0), idle });
  }
  const top = (/** @type {string} */ cat) => own.filter(i => i.cat === cat).sort((a, b) => /** @type {number} */ (base.get(b.id)?.score) - /** @type {number} */ (base.get(a.id)?.score) || (a.id < b.id ? -1 : 1)).slice(0, POOL);
  const missing = need.req.filter(c => !own.some(i => i.cat === c));
  const slots = [...need.req.filter(c => !missing.includes(c)), ...need.opt].map(cat => ({ cat, opt: need.opt.includes(cat), pool: /** @type {(Piece | null)[]} */ (top(cat)) })).filter(s => s.pool.length);
  for (const s of slots) if (s.opt) s.pool.push(null);
  if (!slots.length) return { suggestions: [], missing };

  /** @type {{ pick: Piece[], score: number }[]} */
  const all = [];
  const walk = (/** @type {number} */ k, /** @type {Piece[]} */ pick, /** @type {number} */ sum) => {
    if (k === slots.length) {
      if (!pick.length) return;
      const h = colorHarmony(pick.map(p => p.color));
      all.push({ pick, score: sum + h.score + (need.opt.includes('Jacke') && pick.some(p => p.cat === 'Jacke') ? 1 : 0) });
      return;
    }
    for (const it of slots[k].pool) walk(k + 1, it ? [...pick, it] : pick, sum + (it ? /** @type {number} */ (base.get(it.id)?.score) : 0));
  };
  walk(0, [], 0);
  all.sort((a, b) => b.score - a.score);

  /** @type {Suggestion[]} */
  const out = [];
  const shared = (/** @type {Piece[]} */ a, /** @type {string[]} */ b) => a.filter(p => b.includes(p.id)).length;
  for (const minDiff of [2, 1]) {
    for (const c of all) {
      if (out.length >= count) break;
      if (out.some(o => o.ids.length === c.pick.length && Math.max(c.pick.length - shared(c.pick, o.ids), o.ids.length - shared(c.pick, o.ids)) < minDiff)) continue;
      out.push({ ids: ORDER.flatMap(cat => c.pick.filter(p => p.cat === cat).map(p => p.id)), score: c.score, reasons: why(c.pick, weather, base) });
    }
  }
  return { suggestions: out.slice(0, count), missing };
}

/** @param {Piece[]} pick @param {Weather} weather @param {Map<string, { score: number, idle: number | null }>} base */
function why(pick, weather, base) {
  /** @type {string[]} */
  const r = [];
  const h = colorHarmony(pick.map(p => p.color));
  if (h.note) r.push(h.note);
  const jacket = pick.find(p => p.cat === 'Jacke');
  if (weather === 'kalt' && jacket) r.push('Jacke gegen die Kälte');
  else if (weather === 'regen' && jacket) r.push('Jacke für den Regen');
  else if (weather === 'warm' && !jacket) r.push('Luftig für warme Tage');
  const fit = pick.map(p => ({ p, f: weatherFit(p, weather) })).find(x => x.f.score > 0);
  if (fit) r.push('„' + fit.p.name + '“ ist mit „' + fit.f.tag + '“ markiert');
  const idle = pick.map(p => ({ p, idle: base.get(p.id)?.idle ?? null })).sort((a, b) => (b.idle ?? 9999) - (a.idle ?? 9999))[0];
  if (idle && (idle.idle === null || idle.idle >= 60)) r.push('„' + idle.p.name + '“ ' + (idle.idle === null ? 'noch nie getragen' : 'lange nicht getragen'));
  return r.slice(0, 3);
}
