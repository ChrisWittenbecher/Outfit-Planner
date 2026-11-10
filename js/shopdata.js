// @ts-check
import { normalizeCurrency, parsePrice, sanitizePrice, sanitizeText, validateUrl } from './scraper.js';
import { COLOR_NAMES } from './color.js';
import { fold } from './search.js';

/** Kennung in der ersten Zeile dessen, was der Kurzbefehl in die Zwischenablage legt. */
export const MARK = 'ANPROBE1';
export const CLIP_LIMITS = Object.freeze({ text: 36_000_000, json: 20_000, image: 25_000_000 });

/** @typedef {{ mime: string, bytes: Uint8Array }} ClipImage */
/** @typedef {{ ok: true, name: string, price: number | null, cur: string, link: string, imageUrl: string, color: string, cat: string, brand: string, image: ClipImage | null } | { ok: false, error: string }} ShopClip */

/** @type {[string, RegExp][]} */
const CAT_WORDS = [
  ['Schuhe', /schuh|sneaker|stiefel|boot|sandal|pumps|loafer|slipper|ballerina|mokassin|trainer|espadrille|clog|pantolette/],
  ['Jacke', /jacke|jacket|mantel|coat|parka|blazer|weste|anorak|trench|windbreaker|blouson|cardigan|sakko|gilet/],
  ['Hose/Rock', /hose|jeans|rock|skirt|shorts|leggings|chino|pants|trousers|jogger|bermuda|culotte|latzhose/],
  ['Accessoire', /tasche|bag|gurtel|belt|schal|scarf|mutze|beanie|\bhut\b|\bcap\b|kappe|handschuh|glove|brille|kette|ohrring|armband|uhr\b|watch|rucksack|krawatte|socke|tuch\b|schmuck|ring\b/],
  ['Oberteil', /shirt|bluse|top\b|pullover|pulli|sweat|hoodie|hemd|kleid|dress|polo|tunika|body\b|strick|sweater|longsleeve|jumpsuit|overall/],
];
/** @type {[string, RegExp][]} */
const COLOR_WORDS = [
  ['Schwarz', /schwarz|black|noir|anthrazit/], ['Weiß', /weiss|white|creme|cream|ecru|offwhite|off-white|elfenbein|ivory/],
  ['Grau', /grau|grey|gray|silber|silver/], ['Beige', /beige|sand\b|camel|khaki|taupe|nude/], ['Braun', /braun|brown|cognac|schoko|mokka|tan\b/],
  ['Rot', /\brot|red\b|bordeaux|burgund|weinrot|kirsch/], ['Orange', /orange|rost|terracotta|koralle|coral/], ['Gelb', /gelb|yellow|senf|mustard|gold/],
  ['Grün', /grun|green|oliv|mint|salbei|smaragd/], ['Blau', /blau|blue|navy|marine|denim|turkis|petrol|indigo/],
  ['Lila', /lila|violett|purple|flieder|lavendel|aubergine|mauve/], ['Rosa', /rosa|pink|fuchsia|magenta|altrosa/],
];

/** Kategorie aus dem Produktnamen; leer, wenn nichts passt. @param {string} text */
export function guessCat(text) {
  const t = fold(text);
  for (const [cat, re] of CAT_WORDS) if (re.test(t)) return cat;
  return '';
}
/** Farbe der App aus einer Farbangabe des Shops („Dark Navy“ → Blau); leer, wenn nichts passt. @param {string} text */
export function guessColor(text) {
  const t = fold(text);
  if (!t) return '';
  const exact = COLOR_NAMES.find(c => fold(c) === t);
  if (exact) return exact;
  for (const [c, re] of COLOR_WORDS) if (re.test(t)) return c;
  return '';
}

/** @param {Uint8Array} b */
function sniff(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'image/avif';   // ftyp: AVIF/HEIC, der Browser entscheidet beim Dekodieren
  return '';
}

/** @param {string} b64 @returns {ClipImage | null} */
function decodeImage(b64) {
  const clean = b64.replace(/\s+/g, '');
  if (!clean || clean.length > CLIP_LIMITS.image * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  let bin;
  try { bin = atob(clean); } catch { return null; }
  if (bin.length > CLIP_LIMITS.image) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = sniff(bytes);
  return mime ? { mime, bytes } : null;
}

/** Erkennt schnell, ob ein Text vom Kurzbefehl stammt. @param {unknown} text */
export const isShopClip = text => typeof text === 'string' && text.slice(0, 40).trimStart().startsWith(MARK);

/**
 * Liest, was der Kurzbefehl in die Zwischenablage gelegt hat. Alles wird wie fremde Eingabe behandelt und geprüft.
 * Aufbau: Zeile 1 „ANPROBE1“, Zeile 2 JSON mit name/price/currency/url/image/color/brand, danach optional das Bild als Base64.
 * @param {unknown} text
 * @returns {ShopClip}
 */
export function parseShopClip(text) {
  if (!isShopClip(text)) return { ok: false, error: 'In der Zwischenablage liegen keine Shop-Daten. Starte zuerst den Kurzbefehl auf der Produktseite.' };
  const all = /** @type {string} */ (text);
  if (all.length > CLIP_LIMITS.text) return { ok: false, error: 'Die Daten aus der Zwischenablage sind zu groß.' };
  const body = all.trimStart().slice(MARK.length).replace(/^[ \t]*\r?\n/, '');
  const nl = body.search(/\r?\n/);
  const jsonLine = (nl < 0 ? body : body.slice(0, nl)).trim(), rest = nl < 0 ? '' : body.slice(nl);
  if (!jsonLine || jsonLine.length > CLIP_LIMITS.json) return { ok: false, error: 'Die Shop-Daten sind unvollständig. Bitte den Kurzbefehl noch einmal ausführen.' };
  /** @type {any} */
  let raw;
  try { raw = JSON.parse(jsonLine); } catch { return { ok: false, error: 'Die Shop-Daten sind nicht lesbar. Bitte den Kurzbefehl noch einmal ausführen.' }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Die Shop-Daten sind nicht lesbar. Bitte den Kurzbefehl noch einmal ausführen.' };
  return normalizeShop(raw, rest);
}

/**
 * Prüft Produktdaten aus fremder Quelle (Zwischenablage oder Hilfsdienst) und macht daraus saubere Werte.
 * @param {any} raw
 * @param {string} [imageB64]
 * @returns {ShopClip}
 */
export function normalizeShop(raw, imageB64 = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Die Shop-Daten sind nicht lesbar.' };
  const str = (/** @type {unknown} */ v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  const url = (/** @type {unknown} */ v) => { const r = validateUrl(str(v)); return r.ok ? r.url : ''; };
  const name = sanitizeText(str(raw.name)), brand = sanitizeText(str(raw.brand), 30);
  const price = sanitizePrice(typeof raw.price === 'number' ? raw.price : parsePrice(str(raw.price)));
  const colorText = sanitizeText(str(raw.color), 60);
  const image = decodeImage(imageB64);
  const imageUrl = url(raw.image);
  return {
    ok: true, name, brand, price,
    cur: normalizeCurrency(str(raw.currency), 'EUR'),
    link: url(raw.url),
    imageUrl: imageUrl.startsWith('https:') ? imageUrl : '',
    color: guessColor(colorText) || guessColor(name),
    cat: guessCat(name),
    image,
  };
}
