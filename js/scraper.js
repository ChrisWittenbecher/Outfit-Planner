// @ts-check
import { sanitizeHistory } from './prices.js';
import { sanitizePieces } from './geometry.js';
import { sanitizePlans, sanitizeWears } from './wear.js';
import { COLOR_NAMES } from './color.js';
import { sanitizeTags } from './search.js';

export const LIMITS = Object.freeze({ url: 2048, title: 120, price: 100_000 });
export const IMAGE_LIMITS = Object.freeze({ bytes: 25_000_000, pixels: 60_000_000 });
/** Grenzen für Backup-Dateien. */
export const BACKUP_LIMITS = Object.freeze({ bytes: 200_000_000, items: 2000, outfits: 500, pieces: 200 });
export const CURRENCIES = Object.freeze(['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN']);

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/g;

/**
 * @param {unknown} v
 * @param {number} [max]
 * @returns {string}
 */
export function sanitizeText(v, max = LIMITS.title) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
export function parsePrice(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const text = String(v);
  const m = text.match(/\d{1,3}(?:[\s\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d[\d.,]*/);
  if (!m) return null;
  if (/[-\u2212\u2013]$/.test(text.slice(0, m.index).trim())) return null; // negative Preise sind ungültig
  let s = m[0].replace(/[\s\u00a0\u202f]/g, '').replace(/[.,]+$/, '');
  const lc = s.lastIndexOf(',');
  const ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  else if (ld > -1 && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Erlaubt nur plausible Preise (0 bis 100 000), auf Cent gerundet.
 * @param {unknown} n
 * @returns {number | null}
 */
export function sanitizePrice(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= LIMITS.price ? Math.round(n * 100) / 100 : null;
}

/**
 * @param {unknown} v
 * @param {string} [fallback]
 * @returns {string} bekannter Währungscode oder `fallback`
 */
export function normalizeCurrency(v, fallback = '') {
  const c = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return CURRENCIES.includes(c) ? c : fallback;
}

/**
 * @param {string} host Hostname so, wie ihn `new URL()` liefert
 * @returns {boolean}
 */
export function isPrivateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || /\.(localhost|local|internal|lan|home\.arpa)$/.test(h)) return true;
  if (!h.includes('.') && !h.includes(':')) return true; // Hostname ohne Punkt = Intranet
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(':')) return h === '::' || h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
  return false;
}

/** @typedef {{ ok: true, url: string } | { ok: false, error: string }} UrlResult */

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeLinkInput(raw) {
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(text) ? 'https://' + text : text;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function looksLikeImageUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (/\.(?:jpe?g|png|webp|gif|avif|bmp)$/i.test(u.pathname)) return true;
  for (const key of ['format', 'fmt', 'fm', 'ext', 'f']) {
    if (/^(?:jpe?g|png|webp|gif|avif)$/i.test(u.searchParams.get(key) || '')) return true;
  }
  return false;
}

/**
 * @param {unknown} raw
 * @param {{ allowLocal?: boolean }} [opts] allowLocal nur für die lokale Entwicklung
 * @returns {UrlResult}
 */
export function validateUrl(raw, opts = {}) {
  if (typeof raw !== 'string' || raw.trim() === '') return { ok: false, error: 'Bitte einen Link einfügen.' };
  const text = raw.trim();
  if (text.length > LIMITS.url) return { ok: false, error: 'Der Link ist zu lang.' };
  if (CONTROL.test(text)) { CONTROL.lastIndex = 0; return { ok: false, error: 'Der Link enthält ungültige Zeichen.' }; }
  CONTROL.lastIndex = 0;
  /** @type {URL} */
  let u;
  try { u = new URL(text); } catch { return { ok: false, error: 'Das ist kein gültiger Link.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Nur http(s)-Links sind erlaubt.' };
  if (u.username || u.password) return { ok: false, error: 'Links mit Benutzername oder Passwort werden nicht angenommen.' };
  if (!opts.allowLocal) {
    if (isPrivateHost(u.hostname)) return { ok: false, error: 'Dieser Link zeigt auf eine lokale oder interne Adresse.' };
    if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) return { ok: false, error: 'Dieser Port ist nicht erlaubt.' };
  }
  u.hash = '';
  return { ok: true, url: u.href };
}

/**
 * @param {unknown} v
 * @returns {string} die Quelle, oder leer, wenn sie nicht erlaubt ist
 */
export function sanitizeImageSrc(v) {
  if (typeof v !== 'string' || v.length > 14_000_000) return '';
  return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v) ? v : '';
}

/**
 * @param {unknown} raw
 * @param {readonly string[]} cats erlaubte Kategorien
 * @returns {Record<string, unknown> | null} null, wenn der Eintrag unbrauchbar ist
 */
export function sanitizeItem(raw, cats) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, any>} */ (raw);
  if (typeof o.id !== 'string' || o.id === '' || o.id.length > 64) return null;
  const img = sanitizeImageSrc(o.img);
  if (!img) return null;
  const link = validateUrl(o.link, { allowLocal: true });
  /** @type {Record<string, unknown>} */
  const item = {
    id: o.id,
    name: sanitizeText(o.name) || 'Ohne Namen',
    cat: cats.includes(o.cat) ? o.cat : cats[0],
    img,
    alpha: !!o.alpha,
    cut: !!o.cut,
    mirror: !!o.mirror,
    link: link.ok ? link.url : '',
    price: sanitizePrice(o.price),
    cur: normalizeCurrency(o.cur, 'EUR'),
    status: o.status === 'wish' ? 'wish' : 'own',
    priceHistory: sanitizeHistory(o.priceHistory, LIMITS.price),
    tags: sanitizeTags(o.tags, sanitizeText),
  };
  if (typeof o.color === 'string' && COLOR_NAMES.includes(/** @type {any} */ (o.color))) item.color = o.color;
  const orig = sanitizeImageSrc(o.orig);
  if (orig) item.orig = orig;
  if (typeof o.ean === 'string' && /^\d{8,14}$/.test(o.ean)) item.ean = o.ean;
  return item;
}

/**
 * @param {unknown} raw
 * @param {number} index Position (für eine Ersatz-Kennung)
 * @returns {{ id: string, name: string, pieces: import('./geometry.js').Piece[] } | null}
 */
export function sanitizeOutfit(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, any>} */ (raw);
  const id = typeof o.id === 'string' && o.id !== '' && o.id.length <= 64 ? o.id : 'o' + Date.now().toString(36) + index;
  return { id, name: sanitizeText(o.name) || 'Outfit', pieces: sanitizePieces(o.pieces).slice(0, BACKUP_LIMITS.pieces) };
}

/**
 * @param {string} text Inhalt der Datei
 * @param {readonly string[]} cats erlaubte Kategorien
 * @returns {{ ok: true, items: Record<string, unknown>[], outfits: NonNullable<ReturnType<typeof sanitizeOutfit>>[], board: import('./geometry.js').Piece[], wears: import('./wear.js').Wear[], plans: import('./wear.js').Plans, skipped: number } | { ok: false, error: string }}
 */
export function parseBackup(text, cats) {
  if (typeof text !== 'string' || text.length > BACKUP_LIMITS.bytes) return { ok: false, error: 'Die Datei ist zu groß für ein Backup.' };
  /** @type {any} */
  let j;
  try { j = JSON.parse(text); } catch { return { ok: false, error: 'Diese Datei ist kein gültiges Outfit-Planner-Backup.' }; }
  if (!j || typeof j !== 'object' || !Array.isArray(j.items)) return { ok: false, error: 'Diese Datei ist kein gültiges Outfit-Planner-Backup.' };
  if (j.items.length > BACKUP_LIMITS.items) return { ok: false, error: 'Das Backup enthält zu viele Teile (höchstens ' + BACKUP_LIMITS.items + ').' };
  const rawOutfits = Array.isArray(j.outfits) ? j.outfits.slice(0, BACKUP_LIMITS.outfits) : [];
  const seen = new Set();
  /** @type {Record<string, unknown>[]} */
  const items = [];
  let skipped = 0;
  for (const r of j.items) {
    const it = sanitizeItem(r, cats);
    if (!it || seen.has(it.id)) { skipped++; continue; }
    seen.add(it.id);
    items.push(it);
  }
  const outfits = rawOutfits.map((/** @type {unknown} */ o, /** @type {number} */ i) => sanitizeOutfit(o, i)).filter((/** @type {unknown} */ o) => o);
  const wears = sanitizeWears(j.wears, seen, sanitizeText);
  const plans = sanitizePlans(j.plans, new Set(outfits.map((/** @type {{ id: string }} */ o) => o.id)));
  return { ok: true, items, outfits, board: sanitizePieces(j.board).slice(0, BACKUP_LIMITS.pieces), wears, plans, skipped };
}
