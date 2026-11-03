// @ts-check
/**
 * Anprobe – Eingabeprüfung und Bereinigung von Texten, Preisen, Links und gespeicherten Teilen.
 *
 * Grundsatz: Alles, was von außen kommt (Eingabefeld, Webseite, Backup-Datei), gilt als unsicher.
 * Es wird geprüft, begrenzt und bereinigt, bevor es in die App gelangt. Texte werden später nur
 * als Text (textContent) eingefügt, nie als HTML.
 */

/** Grenzen, damit überlange oder manipulierte Daten nichts aufblähen. */
export const LIMITS = Object.freeze({ url: 2048, title: 120, price: 100_000 });
/** Unterstützte Währungen (entspricht dem Auswahlfeld im Dialog). */
export const CURRENCIES = Object.freeze(['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN']);

// Steuer-, Zero-Width- und Richtungszeichen (Textumkehr-Tricks) entfernen
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/g;

/**
 * Macht Text aus fremden Quellen sicher: Tags und Steuerzeichen raus, Leerraum glätten, kürzen.
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
 * Liest einen Preis aus Text wie „49,99 €“, „1.299,00“, „1,299.00“. Gibt null zurück, wenn keine Zahl erkennbar ist.
 * @param {unknown} v
 * @returns {number | null}
 */
export function parsePrice(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const text = String(v);
  // Erste Zahl im Text. Leerzeichen als Tausendertrenner nur, wenn genau drei Ziffern folgen („1 299,00“).
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
 * Erkennt lokale und interne Adressen (Schutz vor Zugriffen auf das Heimnetz).
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
 * Prüft einen eingegebenen Link. Erlaubt sind nur http(s)-Adressen ohne Zugangsdaten,
 * ohne lokale oder interne Ziele und mit üblichen Ports.
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
 * Prüft eine Bildquelle aus gespeicherten Daten: nur data:image oder https.
 * @param {unknown} v
 * @returns {string}
 */
export function sanitizeImageSrc(v) {
  if (typeof v !== 'string' || v.length > 14_000_000) return '';
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v)) return v;
  return /^https:\/\//i.test(v) && v.length <= LIMITS.url ? v : '';
}

/**
 * Prüft einen Kleiderschrank-Eintrag aus einer Backup-Datei und gibt einen bereinigten Eintrag zurück.
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
  };
  const orig = sanitizeImageSrc(o.orig);
  if (orig) item.orig = orig;
  if (typeof o.ean === 'string' && /^\d{8,14}$/.test(o.ean)) item.ean = o.ean;
  return item;
}
