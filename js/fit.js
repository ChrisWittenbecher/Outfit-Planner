// @ts-check
import { BOARD, LIMITS, clamp } from './geometry.js';

/**
 * @typedef {Object} Part  ein Teil auf dem Board, mit gemessener Form
 * @property {string} id
 * @property {string} cat    Kategorie wie im Kleiderschrank
 * @property {number} aspect Höhe durch Breite des Bildes
 * @property {number} waist  Breite des oberen Randes (Bund, Halsbereich) im Verhältnis zur größten Breite, 0 bis 1
 * @property {number} hem    Breite des unteren Randes (Saum) im Verhältnis zur größten Breite, 0 bis 1
 */
/** @typedef {{ id: string, x: number, y: number, w: number }} Slot  Platz auf dem Board in Pixeln (x, y = linke obere Ecke) */

export const DEFAULTS = Object.freeze({ waist: 0.82, hem: 0.88 });

export const RULES = Object.freeze({
  margin: 24,                  // Mindestabstand zum Rand des Boards in px
  maxTopWidth: 230,            // größte Breite des Oberteils in px
  topOverlap: 0.10,            // das Oberteil deckt den Bund der Hose um diesen Anteil seiner Höhe ab
  shoeOverlap: 0.06,           // die Schuhe schieben sich um diesen Anteil ihrer Höhe unter den Saum
  jacketWidth: 1.12,           // die Jacke ist so viel breiter als das Oberteil
  jacketRise: 0.02,            // und beginnt um diesen Anteil der Oberteilhöhe weiter oben
  accessoryWidth: 0.4,         // Accessoires: Breite
  gap: 0.06,                   // Abstand zwischen Körper und Accessoires, und unter Accessoires
  bottomRatio: /** @type {[number, number]} */ ([0.55, 1.5]),   // erlaubte Breite der Hose im Verhältnis zum Oberteil
});

/**
 * @param {ArrayLike<number>} alpha
 * @param {number} w Breite der Maske
 * @param {number} h Höhe der Maske
 * @returns {{ waist: number, hem: number }}
 */
export function bandRatios(alpha, w, h) {
  const none = { waist: DEFAULTS.waist, hem: DEFAULTS.hem };
  if (!(w > 0) || !(h > 0) || alpha.length < w * h) return none;
  /** @type {number[]} */
  const ext = [];
  let maxExt = 0;
  for (let y = 0; y < h; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < w; x++) if (alpha[y * w + x] >= 128) { if (lo < 0) lo = x; hi = x; }
    const e = lo < 0 ? 0 : hi - lo + 1;
    ext.push(e);
    if (e > maxExt) maxExt = e;
  }
  if (!maxExt) return none;
  const first = ext.findIndex(e => e > 0);
  let last = h - 1;
  while (last > first && ext[last] === 0) last--;
  const n = last - first + 1;
  const band = (/** @type {number} */ a, /** @type {number} */ b) => {
    const from = first + Math.floor(n * a), to = Math.min(last + 1, Math.max(from + 1, first + Math.ceil(n * b)));
    let sum = 0, count = 0;
    for (let y = from; y < to; y++) if (ext[y] > 0) { sum += ext[y]; count++; }
    return count ? sum / count / maxExt : null;
  };
  return { waist: clamp(band(0.04, 0.14) ?? DEFAULTS.waist, 0.2, 1), hem: clamp(band(0.86, 0.97) ?? DEFAULTS.hem, 0.2, 1) };
}

/**
 * @param {Part[]} parts
 * @param {{ w: number, h: number }} [board]
 * @returns {Slot[]} in der Reihenfolge der Eingabe
 */
export function layout(parts, board = BOARD) {
  const R = RULES;
  const ok = parts.filter(p => p && typeof p.id === 'string' && Number.isFinite(p.aspect) && p.aspect > 0);
  if (!ok.length) return [];
  const first = (/** @type {string} */ cat) => ok.find(p => p.cat === cat);
  const top = first('Oberteil'), jacket = first('Jacke'), bottom = first('Hose/Rock'), shoes = first('Schuhe');
  const main = new Set([top, jacket, bottom, shoes]);
  const extras = ok.filter(p => !main.has(p));   // Accessoires und überzählige Teile
  const fix = (/** @type {number} */ v, /** @type {number} */ d) => (Number.isFinite(v) && v > 0 ? clamp(v, 0.2, 1) : d);

  const hemTop = top ? fix(top.hem, DEFAULTS.hem) : DEFAULTS.hem;
  const wBottom = bottom ? clamp(hemTop / fix(bottom.waist, DEFAULTS.waist), R.bottomRatio[0], R.bottomRatio[1]) : 0;
  const wJacket = R.jacketWidth;
  const wShoes = shoes ? clamp(0.9 * (bottom ? wBottom * fix(bottom.hem, DEFAULTS.hem) : 0.8), 0.3, 1.1) : 0;

  /** @type {Map<Part, { w: number, h: number, y: number }>} */
  const rect = new Map();
  const hTop = top ? top.aspect : jacket ? jacket.aspect * wJacket * 0.85 : 1.1;   // ohne Oberteil: gedachte Höhe
  if (top) rect.set(top, { w: 1, h: top.aspect, y: 0 });
  if (jacket) rect.set(jacket, { w: wJacket, h: wJacket * jacket.aspect, y: -R.jacketRise * hTop });
  const upper = !!(top || jacket);
  let bodyEnd = upper ? hTop : 0;
  if (bottom) {
    const y = upper ? hTop * (1 - R.topOverlap) : 0;
    rect.set(bottom, { w: wBottom, h: wBottom * bottom.aspect, y });
    bodyEnd = y + wBottom * bottom.aspect;
  }
  if (shoes) {
    const h = wShoes * shoes.aspect;
    rect.set(shoes, { w: wShoes, h, y: bodyEnd - R.shoeOverlap * h });
  }
  let minY = Infinity, maxY = -Infinity, bodyW = 0;
  for (const r of rect.values()) { minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.h); bodyW = Math.max(bodyW, r.w); }
  const bodyH = rect.size ? maxY - minY : 0;

  const wA = R.accessoryWidth;
  const colH = extras.reduce((s, p) => s + wA * p.aspect, 0) + Math.max(0, extras.length - 1) * R.gap;
  const colW = extras.length ? wA + R.gap : 0;

  const stackH = Math.max(bodyH, colH), totalW = bodyW + colW;
  const availW = board.w - 2 * R.margin, availH = board.h - 2 * R.margin;
  const s = Math.min(availW / totalW, availH / stackH, R.maxTopWidth);
  const left = (board.w - totalW * s) / 2, y0 = (board.h - stackH * s) / 2;
  const bodyCx = left + (bodyW * s) / 2, accCx = left + (bodyW + R.gap) * s + (wA * s) / 2;

  /** @type {Map<Part, Slot>} */
  const out = new Map();
  const place = (/** @type {Part} */ p, /** @type {number} */ rw, /** @type {number} */ cx, /** @type {number} */ y) => {
    const w = clamp(rw * s, LIMITS.minW, Math.min(LIMITS.maxW, board.w));
    const h = w * p.aspect;
    const round = (/** @type {number} */ v) => Math.round(v * 10) / 10;
    out.set(p, { id: p.id, x: round(clamp(cx - w / 2, 0, Math.max(0, board.w - w))), y: round(clamp(y, 0, Math.max(0, board.h - h))), w: round(w) });
  };
  const bodyOff = (stackH - bodyH) / 2;
  for (const [p, r] of rect) place(p, r.w, bodyCx, y0 + (bodyOff - minY + r.y) * s);
  let cy = (stackH - colH) / 2;
  for (const p of extras) { place(p, wA, accCx, y0 + cy * s); cy += wA * p.aspect + R.gap; }
  return ok.map(p => /** @type {Slot} */ (out.get(p)));
}
