// @ts-check

/** @typedef {{ t: number, v: number }} PricePoint  Zeitpunkt (ms seit 1970) und Preis */
/** @typedef {{ prev: number, now: number, pct: number, dir: 'down' | 'up' }} PriceChange */

export const MAX_POINTS = 50;

export const LEGACY_T = 1;

/**
 * @param {PricePoint[]} history
 * @param {number | null | undefined} price bisheriger Preis des Teils
 * @returns {PricePoint[]}
 */
export function baseHistory(history, price) {
  if (history.length || price === null || price === undefined || !Number.isFinite(price)) return history;
  return [{ t: LEGACY_T, v: price }];
}

/**
 * @param {unknown} raw
 * @param {number} [maxPrice]
 * @returns {PricePoint[]}
 */
export function sanitizeHistory(raw, maxPrice = 100_000) {
  if (!Array.isArray(raw)) return [];
  /** @type {PricePoint[]} */
  const out = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const { t, v } = /** @type {Record<string, unknown>} */ (p);
    if (typeof t !== 'number' || typeof v !== 'number' || !Number.isFinite(t) || !Number.isFinite(v)) continue;
    if (t <= 0 || t > 8.64e15 || v < 0 || v > maxPrice) continue;
    out.push({ t: Math.round(t), v: Math.round(v * 100) / 100 });
  }
  out.sort((a, b) => a.t - b.t);
  return out.slice(-MAX_POINTS);
}

/**
 * @param {PricePoint[]} history bisheriger Verlauf
 * @param {number | null} price neuer Preis
 * @param {number} [now] Zeitpunkt (für Tests)
 * @returns {PricePoint[]} neuer Verlauf (das Original wird nicht verändert)
 */
export function recordPrice(history, price, now = Date.now()) {
  if (price === null || !Number.isFinite(price) || price < 0) return history;
  const last = history[history.length - 1];
  if (last && last.v === price) return history;
  return [...history, { t: now, v: price }].slice(-MAX_POINTS);
}

/**
 * Letzte Preisänderung (vorletzter → letzter Eintrag).
 * @param {PricePoint[]} history
 * @returns {PriceChange | null} null, wenn es weniger als zwei Einträge gibt oder sich nichts geändert hat
 */
export function priceChange(history) {
  if (history.length < 2) return null;
  const prev = history[history.length - 2].v;
  const now = history[history.length - 1].v;
  if (prev === now) return null;
  const pct = prev > 0 ? Math.round(Math.abs((now - prev) / prev) * 100) : 100;
  return { prev, now, pct, dir: now < prev ? 'down' : 'up' };
}

/**
 * @param {{ price: number | null, cur?: string }[]} items
 * @returns {{ by: Record<string, number>, missing: number }}
 */
export function sumPrices(items) {
  /** @type {Record<string, number>} */
  const by = {};
  let missing = 0;
  for (const it of items) {
    if (it.price === null || it.price === undefined) { missing++; continue; }
    const c = it.cur || 'EUR';
    by[c] = Math.round(((by[c] || 0) + it.price) * 100) / 100;
  }
  return { by, missing };
}
