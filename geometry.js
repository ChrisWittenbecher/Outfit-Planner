// @ts-check
/**
 * Anprobe – Geometrie für Drehen und Positionieren (Schritt 2).
 *
 * Reine Funktionen ohne DOM-Zugriff. Dadurch lassen sie sich in Node testen
 * (./geometry.test.mjs) und mit TypeScript prüfen (`tsc --checkJs`).
 *
 * Konventionen
 * - Board: 400 × 600 px, Ursprung oben links, x nach rechts, y nach unten.
 * - Winkel in Grad. 0° = Teil steht aufrecht, positiv = im Uhrzeigersinn (wie CSS rotate()).
 * - Die Position eines Teils ist sein MITTELPUNKT. So bleibt er beim Drehen und Skalieren stabil.
 */

/** @typedef {{ id: string, x: number, y: number, w: number, r: number, z?: number }} Piece */
/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ w: number, h: number }} Size */

/** Größe des Boards in px. */
export const BOARD = Object.freeze({ w: 400, h: 600 });
/** Grenzen für Teile: Breite in px und wie viel mindestens sichtbar bleiben muss. */
export const LIMITS = Object.freeze({ minW: 40, maxW: 560, minVisible: 40 });

/**
 * Begrenzt einen Wert auf einen Bereich.
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Bringt einen Winkel in den Bereich [0, 360). Ungültige Werte (NaN, Text, null) ergeben 0.
 * Auf zwei Nachkommastellen gerundet, damit Rechenrauschen nicht gespeichert wird.
 * @param {unknown} deg
 * @returns {number}
 */
export function normalizeAngle(deg) {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return 0;
  const r = Math.round((((deg % 360) + 360) % 360) * 100) / 100;
  return r >= 360 ? 0 : r;
}

/**
 * Winkel des Zeigers um einen Mittelpunkt. 0° = genau darüber, im Uhrzeigersinn wachsend.
 * @param {number} cx Mittelpunkt x
 * @param {number} cy Mittelpunkt y
 * @param {number} px Zeiger x
 * @param {number} py Zeiger y
 * @returns {number | null} null, wenn der Zeiger genau im Mittelpunkt liegt (Winkel undefiniert)
 */
export function angleFromCenter(cx, cy, px, py) {
  const dx = px - cx;
  const dy = py - cy;
  if (dx === 0 && dy === 0) return null;
  return normalizeAngle((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/**
 * Kürzeste vorzeichenbehaftete Winkeldifferenz von a nach b, im Bereich (-180, 180].
 * Nützlich, damit ein Ziehen über 0°/360° nicht „springt“.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function shortestDelta(a, b) {
  let d = normalizeAngle(b) - normalizeAngle(a);
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Rastet auf das nächste Vielfache von `step` ein (z. B. mit gedrückter Shift-Taste).
 * @param {number} deg
 * @param {number} [step=15]
 * @returns {number}
 */
export function snapAngle(deg, step = 15) {
  if (!(step > 0)) return normalizeAngle(deg);
  return normalizeAngle(Math.round(normalizeAngle(deg) / step) * step);
}

/**
 * Umschließendes, achsenparalleles Rechteck eines gedrehten Rechtecks.
 * @param {number} w Breite
 * @param {number} h Höhe
 * @param {number} deg Drehwinkel
 * @returns {Size}
 */
export function rotatedBounds(w, h, deg) {
  const rad = (normalizeAngle(deg) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { w: w * c + h * s, h: w * s + h * c };
}

/**
 * Begrenzt den Mittelpunkt so, dass vom (gedrehten) Teil mindestens `LIMITS.minVisible` px
 * auf dem Board sichtbar bleiben. Das Teil kann also nie unerreichbar „verloren“ gehen.
 * @param {number} cx gewünschter Mittelpunkt x
 * @param {number} cy gewünschter Mittelpunkt y
 * @param {number} bw Breite des umschließenden Rechtecks
 * @param {number} bh Höhe des umschließenden Rechtecks
 * @returns {Point}
 */
export function clampCenter(cx, cy, bw, bh) {
  const m = LIMITS.minVisible;
  return {
    x: clamp(cx, m - bw / 2, BOARD.w - m + bw / 2),
    y: clamp(cy, m - bh / 2, BOARD.h - m + bh / 2),
  };
}

/**
 * Liest einen vom Benutzer getippten Winkel („45“, „12,5“, „90°“).
 * @param {string} text
 * @returns {number | null} normalisierter Winkel oder null bei ungültiger Eingabe
 */
export function parseAngle(text) {
  const t = String(text).trim().replace(/°$/, '').replace(',', '.');
  if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return normalizeAngle(Number(t));
}

/**
 * Anzeige für Menschen, z. B. „45°“ oder „12,5°“.
 * @param {number} deg
 * @returns {string}
 */
export function formatAngle(deg) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(normalizeAngle(deg)) + '°';
}

/**
 * Text für Bildschirmleser, z. B. „45 Grad“.
 * @param {number} deg
 * @returns {string}
 */
export function angleAria(deg) {
  return formatAngle(deg).replace('°', ' Grad');
}

/**
 * Prüft ein Teil aus unsicherer Quelle (gespeicherte Daten, Backup-Datei) und gibt ein
 * bereinigtes Teil zurück. Ungültige Einträge ergeben null. Unbekannte Felder werden verworfen.
 * @param {unknown} raw
 * @returns {Piece | null}
 */
export function sanitizePiece(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (typeof o.id !== 'string' || o.id === '' || o.id.length > 64) return null;
  if (typeof o.x !== 'number' || typeof o.y !== 'number' || typeof o.w !== 'number') return null;
  if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.w)) return null;
  /** @type {Piece} */
  const piece = {
    id: o.id,
    x: clamp(o.x, -2000, 2000),
    y: clamp(o.y, -2000, 2000),
    w: clamp(o.w, LIMITS.minW, LIMITS.maxW),
    r: normalizeAngle(o.r),
  };
  // „z“ stammt aus älteren Versionen und wird nur zum Umsortieren gebraucht.
  if (typeof o.z === 'number' && Number.isFinite(o.z)) piece.z = o.z;
  return piece;
}

/**
 * Bereinigt eine ganze Liste von Teilen.
 * @param {unknown} list
 * @returns {Piece[]}
 */
export function sanitizePieces(list) {
  if (!Array.isArray(list)) return [];
  /** @type {Piece[]} */
  const out = [];
  for (const raw of list) {
    const p = sanitizePiece(raw);
    if (p) out.push(p);
  }
  return out;
}
