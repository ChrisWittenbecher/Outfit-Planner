// @ts-check
// Auswertung „Was trägst du wirklich?“: Zeiträume, Kennzahlen, Rangliste, Aussortieren. Reine Logik ohne Oberfläche.
import { addDays, daysBetween, isDay, wearStats } from './wear.js';

/** @typedef {import('./wear.js').Wear} Wear */
/** @typedef {{ id: string, name?: string, cat?: string, color?: string, status?: string, price?: number | null, cur?: string, keep?: string }} StatItem */

/** Zeiträume der Auswertung. days: Anzahl Tage einschließlich heute, null = alles. */
export const PERIODS = Object.freeze([
  { key: '90', label: '90 Tage', days: 90 },
  { key: 'year', label: 'Jahr', days: 365 },
  { key: 'all', label: 'Gesamt', days: null },
]);
/** @typedef {'90' | 'year' | 'all'} PeriodKey */
export const IDLE_DAYS = 90;
/** Neue Teile, die noch nie getragen wurden, gelten erst nach so vielen Tagen als „Aussortieren?“. */
export const GRACE_DAYS = 30;

/** @param {unknown} k @returns {PeriodKey} */
export const periodKey = k => (k === 'year' || k === 'all' ? k : '90');

/** Erster Tag des Zeitraums (einschließlich heute) oder null bei „Gesamt“. @param {string} today @param {unknown} key */
export function periodStart(today, key) {
  const p = PERIODS.find(x => x.key === periodKey(key));
  return p && p.days ? addDays(today, -(p.days - 1)) : null;
}

/**
 * Einträge im Zeitraum, nie nach heute (Einträge aus der Zukunft zählen nicht).
 * @param {readonly Wear[]} wears @param {string} today @param {unknown} key
 */
export function wearsIn(wears, today, key) {
  const from = periodStart(today, key);
  return wears.filter(w => isDay(w.d) && w.d <= today && (from === null || w.d >= from));
}

/**
 * Zeitpunkt, an dem das Teil angelegt wurde, aus der Kennung („i“ + Zeit in Basis 36 + Zufall). Unbekannt (null) bei anderen Kennungen.
 * @param {string} id @param {number} [now] aktuelle Zeit (ms); Kennungen aus der Zukunft gelten als unbekannt
 * @returns {string | null} Tag (JJJJ-MM-TT)
 */
export function addedDay(id, now = Date.now()) {
  const m = /^i([0-9a-z]{8})[0-9a-z]{5}$/.exec(id);
  if (!m) return null;
  const ms = parseInt(m[1], 36);
  if (!Number.isFinite(ms) || ms < Date.UTC(2020, 0, 1) || ms > now + 86400000) return null;
  const d = new Date(ms);
  const key = `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return isDay(key) ? key : null;
}

/** @param {StatItem} i */
const owned = i => i.status !== 'wish';
/** @param {unknown} p @returns {p is number} */
const hasPrice = p => typeof p === 'number' && Number.isFinite(p) && p >= 0;

/**
 * Kennzahlen für einen Zeitraum.
 * @param {readonly StatItem[]} items @param {readonly Wear[]} wears @param {string} today @param {unknown} key
 * @returns {{
 *   owned: number, worn: number, total: number,
 *   top: { item: StatItem, count: number, last: string, cost: number | null }[],
 *   color: { name: string, count: number } | null,
 *   costs: { cur: string, perWear: number, items: number }[],
 * }}
 */
export function summarize(items, wears, today, key) {
  const mine = items.filter(owned);
  const inPeriod = wearStats(wearsIn(wears, today, key), today);
  const life = wearStats(wears, today);
  const rows = mine.filter(i => inPeriod.has(i.id)).map(item => {
    const s = /** @type {{ count: number, last: string }} */ (inPeriod.get(item.id));
    const l = life.get(item.id);
    return { item, count: s.count, last: s.last, cost: hasPrice(item.price) && l && l.count > 0 ? item.price / l.count : null };
  });
  rows.sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || (a.item.id < b.item.id ? -1 : 1));

  /** @type {Map<string, number>} */
  const byColor = new Map();
  for (const r of rows) if (r.item.color) byColor.set(r.item.color, (byColor.get(r.item.color) || 0) + r.count);
  const best = [...byColor].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];

  /** Kosten pro Tragen je Währung: Preis geteilt durch Tragen über die gesamte Zeit, nur Teile, die im Zeitraum getragen wurden. @type {Map<string, { price: number, wears: number, items: number }>} */
  const money = new Map();
  for (const r of rows) {
    const l = life.get(r.item.id);
    if (!hasPrice(r.item.price) || !l || l.count < 1) continue;
    const cur = r.item.cur || 'EUR', m = money.get(cur) || { price: 0, wears: 0, items: 0 };
    m.price += r.item.price; m.wears += l.count; m.items++;
    money.set(cur, m);
  }
  const costs = [...money].map(([cur, m]) => ({ cur, perWear: m.price / m.wears, items: m.items }))
    .sort((a, b) => b.items - a.items || (a.cur < b.cur ? -1 : 1));

  return {
    owned: mine.length, worn: rows.length, total: rows.reduce((n, r) => n + r.count, 0),
    top: rows.slice(0, 5), color: best ? { name: best[0], count: best[1] } : null, costs,
  };
}

/**
 * Teile für „Aussortieren?“: besessen, seit `IDLE_DAYS` Tagen nicht getragen. Wer „Behalten“ gedrückt hat (keep), ruht `IDLE_DAYS` Tage.
 * Neu angelegte Teile ohne Tragen zählen erst nach `GRACE_DAYS` Tagen (Anlegedatum steckt in der Kennung).
 * @template {StatItem} T
 * @param {readonly T[]} items @param {readonly Wear[]} wears @param {string} today
 * @returns {{ item: T, last: string | null, idle: number | null, added: string | null }[]} längste Pause zuerst, nie getragene am Ende (teuerste zuerst)
 */
export function idleList(items, wears, today) {
  const stats = wearStats(wears, today);
  /** @type {{ item: T, last: string | null, idle: number | null, added: string | null }[]} */
  const out = [];
  for (const item of items) {
    if (!owned(item)) continue;
    if (isDay(item.keep) && item.keep <= today && daysBetween(item.keep, today) < IDLE_DAYS) continue;
    const s = stats.get(item.id), added = addedDay(item.id);
    const idle = s ? daysBetween(s.last, today) : null;
    if (idle !== null ? idle < IDLE_DAYS : added !== null && daysBetween(added, today) < GRACE_DAYS) continue;
    out.push({ item, last: s ? s.last : null, idle, added });
  }
  return out.sort((a, b) => (a.idle === null ? 1 : 0) - (b.idle === null ? 1 : 0) || (b.idle ?? 0) - (a.idle ?? 0) || (b.item.price ?? 0) - (a.item.price ?? 0) || (a.item.id < b.item.id ? -1 : 1));
}
