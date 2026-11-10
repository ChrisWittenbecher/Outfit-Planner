// @ts-check
import { normalizeCurrency, parsePrice, sanitizePrice, sanitizeText, validateUrl } from './scraper.js';
import { COLOR_NAMES } from './color.js';
import { fold } from './search.js';

/** @typedef {{ ok: true, name: string, price: number | null, cur: string, link: string, imageUrl: string, color: string, cat: string, brand: string } | { ok: false, error: string }} ShopData */

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

/**
 * Prüft Produktdaten aus dem Hilfsdienst und macht daraus saubere Werte.
 * @param {any} raw
 * @returns {ShopData}
 */
export function normalizeShop(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Die Shop-Daten sind nicht lesbar.' };
  const str = (/** @type {unknown} */ v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  const url = (/** @type {unknown} */ v) => { const r = validateUrl(str(v)); return r.ok ? r.url : ''; };
  const name = sanitizeText(str(raw.name)), brand = sanitizeText(str(raw.brand), 30);
  const price = sanitizePrice(typeof raw.price === 'number' ? raw.price : parsePrice(str(raw.price)));
  const colorText = sanitizeText(str(raw.color), 60);
  const imageUrl = url(raw.image);
  return {
    ok: true, name, brand, price,
    cur: normalizeCurrency(str(raw.currency), 'EUR'),
    link: url(raw.url),
    imageUrl: imageUrl.startsWith('https:') ? imageUrl : '',
    color: guessColor(colorText) || guessColor(name),
    cat: guessCat(name),
  };
}
