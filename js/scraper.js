// @ts-check
/**
 * Anprobe – Produkt-Import: Eingabeprüfung, Bereinigung und Auslesen von Produktseiten (Schritt 3).
 *
 * Grundsatz: Alles, was von außen kommt (Eingabefeld, Webseite, Backup-Datei), gilt als unsicher.
 * Es wird geprüft, begrenzt und bereinigt, bevor es in die App gelangt. Texte werden später nur
 * als Text (textContent) eingefügt, nie als HTML.
 */

/** Grenzen, damit überlange oder manipulierte Daten nichts aufblähen. */
export const LIMITS = Object.freeze({ url: 2048, title: 120, html: 3_000_000, price: 100_000, jsonLd: 20, jsonLdChars: 300_000 });
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

/** Regeln in fester Reihenfolge, der erste Treffer gewinnt. Deutsche Zusammensetzungen („Zopfpullover“) brauchen Teilwort-Treffer. */
const CATEGORY_RULES = /** @type {[RegExp, string][]} */ ([
  [/schuh|sneaker|stiefel|\bboots?\b|loafer|sandale|\bsandals?\b|\bslides?\b|slipper|\bpumps\b|\btrainers?\b|ballerina|\bmules?\b|\bclogs?\b|espadrille|\bshoes?\b|\bheels?\b/i, 'Schuhe'],
  [/jacke|jacket|mantel\b|mäntel|\bcoat\b|blazer|sakko|parka|anorak|\bweste\b|westen\b|\bvests?\b|gilet|bomber|windbreaker|\bpuffer\b|\btrench\b|\bcape\b|poncho|overshirt|outerwear/i, 'Jacke'],
  [/hose\b|hosen\b|jeans|denim|\bpants\b|\btrousers?\b|\bchinos?\b|\bjoggers?\b|shorts?\b|\bjorts?\b|\bcargos?\b|leggings?|\btights\b|rock\b|röcke|\bskirts?\b|trackpants|bermuda|culotte|jumpsuit|overall/i, 'Hose/Rock'],
  [/shirt|\btees?\b|\btops?\b|\btank\b|tanktop|polo|pullover|sweater|sweatshirt|hoodie|jersey|longsleeve|long sleeve|langarm|flannel|\bknit(?!\s*(beanie|cap|hat|scarf|gloves?))|strick(?!muster)|cardigan|blouse|bluse|hemd|oberteil|\bbody(suit)?\b|\bsweat\b|jumper|crew ?neck|rollkragen|turtleneck|henley|kleid|\bdress\b/i, 'Oberteil'],
  [/\bcaps?\b|\bhats?\b|beanie|mütze|muetze|\bschal\b|scarf|handschuh|\bgloves?\b|gürtel|\bbelt\b|sunglasses|sonnenbrille|brille|\bshades\b|\bwatch\b|\buhr\b|schmuck|jewell?ery|\bring\b|necklace|\bkette\b|bracelet|armband|ohrring|earring|\bsocks?\b|socken|strumpf|krawatte|\bties?\b|wallet|geldbörse|rucksack|backpack|\bbags?\b|tasche|\bpouch\b|\bkeychain\b/i, 'Accessoire'],
]);

/**
 * Rät die Kategorie aus dem Produktnamen. Gibt leeren Text zurück, wenn nichts passt
 * (dann soll die Person die Kategorie selbst wählen).
 * @param {unknown} text
 * @returns {string} „Oberteil“, „Jacke“, „Hose/Rock“, „Schuhe“, „Accessoire“ oder ''
 */
export function guessCategory(text) {
  const t = typeof text === 'string' ? text : '';
  for (const [re, cat] of CATEGORY_RULES) if (re.test(t)) return cat;
  return '';
}

const GENDER = /^(men|man|women|woman|herren|damen|kinder|kids|boys?|girls?|unisex|baby)$/i;

/**
 * Macht aus Seitentiteln einen kurzen Produktnamen:
 * „Zopfpullover … - Dunkelgrün - Men | H&M DE“ → „Zopfpullover … - Dunkelgrün“,
 * „Blank Slub Tee – LIVE FAST DIE YOUNG“ → „Blank Slub Tee“.
 * @param {unknown} title
 * @param {unknown} [siteName] Name des Shops (og:site_name), wenn bekannt
 * @returns {string}
 */
export function cleanTitle(title, siteName = '') {
  const full = sanitizeText(title, 300);
  const site = sanitizeText(siteName, 60).toLowerCase();
  const first = full.split(' | ')[0];                          // „Name | Shop“
  const segs = first.split(/\s+[-–—]\s+/);
  while (segs.length > 1) {
    const last = /** @type {string} */ (segs[segs.length - 1]);
    if (GENDER.test(last) || (site && last.toLowerCase().includes(site))) segs.pop(); else break;
  }
  return (segs.join(' - ').trim() || full).slice(0, LIMITS.title);
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
 * Löst eine (evtl. relative) Bild-Adresse auf und prüft sie wie einen Link.
 * @param {unknown} raw
 * @param {string} base Adresse der Seite
 * @param {{ allowLocal?: boolean }} [opts]
 * @returns {string} sichere http(s)-Adresse oder leerer Text
 */
export function sanitizeImageUrl(raw, base, opts = {}) {
  if (typeof raw !== 'string' || raw.trim() === '' || raw.length > LIMITS.url) return '';
  try {
    const r = validateUrl(new URL(raw.trim(), base).href, opts);
    return r.ok ? r.url : '';
  } catch { return ''; }
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

/** @typedef {{ title: string, image: string, price: number | null, cur: string, priceSource: '' | 'meta' | 'json-ld' | 'itemprop' | 'text' }} ProductInfo */

/** Wörter in Bildbeschreibungen, die auf ein Foto mit Person hindeuten. */
const MODEL_ALT = /\bmodel\b|getragen|\bträgt\b|wird von|\bworn\b|wearing|wears|\bwoman\b|\bman\b|\bfrau\b|\bmann\b/i;

/**
 * Wählt das beste Produktbild. Normal gilt das Open-Graph-Bild. Zeigt dessen Galerie-Eintrag aber
 * laut Bildbeschreibung eine Person („wird vom Model getragen“), nehme ich das erste Galeriebild
 * desselben Servers ohne Person (z. B. das Produkt allein). So wird nur das Kleidungsstück freigestellt.
 * @param {Document} doc
 * @param {string} og Adresse aus og:image
 * @param {string} baseUrl
 * @param {{ allowLocal?: boolean }} opts
 * @returns {string}
 */
function chooseImage(doc, og, baseUrl, opts) {
  const best = sanitizeImageUrl(og, baseUrl, opts);
  if (!best) return '';
  /** @type {URL} */
  let ogUrl;
  try { ogUrl = new URL(best); } catch { return best; }
  const gallery = [...doc.querySelectorAll('img[alt]')].slice(0, 80).map(el => {
    const raw = el.getAttribute('src') || (el.getAttribute('srcset') || '').trim().split(/\s+/)[0] || '';
    return { alt: el.getAttribute('alt') || '', src: sanitizeImageUrl(raw, baseUrl, opts) };
  }).filter(g => g.src);
  const same = (/** @type {string} */ u) => { try { const x = new URL(u); return x.host === ogUrl.host; } catch { return false; } };
  const main = gallery.find(g => { try { return new URL(g.src).pathname === ogUrl.pathname; } catch { return false; } });
  if (!main || !MODEL_ALT.test(main.alt)) return best;
  const flat = gallery.find(g => g.src !== main.src && same(g.src) && g.alt.trim().length > 15 && !MODEL_ALT.test(g.alt));
  return flat ? flat.src : best;
}

/**
 * Letzter Ausweg, wenn die Seite keinen Preis in Meta-Tags oder Produktdaten hat (z. B. H&M):
 * der erste Preis im Text direkt hinter der Hauptüberschrift („Preis: 39,99 €“).
 * @param {Document} doc
 * @returns {{ price: number, cur: string } | null}
 */
function priceFromText(doc) {
  const h1 = doc.querySelector('h1');
  if (!h1 || !doc.body) return null;
  const walker = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */);
  walker.currentNode = h1;
  let text = '';
  for (let n = walker.nextNode(); n && text.length < 500; n = walker.nextNode()) {
    const tag = n.parentElement ? n.parentElement.tagName : '';
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(tag)) continue;
    text += ' ' + (n.nodeValue || '');
  }
  const m = text.match(/(€|EUR|£|GBP|\$|USD|CHF)\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(€|EUR|£|GBP|\$|USD|CHF)/i);
  if (!m) return null;
  const sym = (m[1] || m[4] || '').toUpperCase();
  const price = parsePrice(m[2] || m[3]);
  if (price == null) return null;
  return { price, cur: { '€': 'EUR', '£': 'GBP', '$': 'USD' }[sym] || sym };
}

/**
 * Schneller Check auf rohem HTML: Enthält die Antwort überhaupt Produktdaten?
 * Block- und Fehlerseiten („Access Denied“, Captcha) haben das nicht.
 * @param {unknown} html
 * @returns {boolean}
 */
export function looksLikeProductHtml(html) {
  return typeof html === 'string' && /property=["']og:(title|image)["']|application\/ld\+json|itemprop=["']price["']/i.test(html);
}

/**
 * Liest Name, Bild, Preis und Währung aus einem bereits geparsten Dokument
 * (Open Graph, JSON-LD „Product“, itemprop, zuletzt Preis aus dem Text). Alles wird bereinigt.
 * @param {Document} doc
 * @param {string} baseUrl Adresse der Seite (für relative Bild-Adressen)
 * @param {{ allowLocal?: boolean }} [opts]
 * @returns {ProductInfo}
 */
export function extractProduct(doc, baseUrl, opts = {}) {
  /** @param {string} k */
  const meta = k => doc.querySelector(`meta[property="${k}"],meta[name="${k}"]`)?.getAttribute('content')?.trim() || '';
  let title = meta('og:title'); // Reihenfolge: Open Graph → Name aus den Produktdaten → Seitentitel (oft nur „Shop“)
  let image = meta('og:image:secure_url') || meta('og:image') || meta('twitter:image');
  let price = parsePrice(meta('product:price:amount') || meta('og:price:amount'));
  let cur = meta('product:price:currency') || meta('og:price:currency');
  /** @type {ProductInfo['priceSource']} */
  let priceSource = price != null ? 'meta' : '';

  /** @type {any[]} */
  const products = [];
  /** @param {any} n */
  const walk = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const types = /** @type {unknown[]} */ ([]).concat(n['@type'] || []);
    if (types.includes('Product') || types.includes('ProductGroup')) products.push(n);
    if (n['@graph']) walk(n['@graph']);
  };
  [...doc.querySelectorAll('script[type="application/ld+json"]')].slice(0, LIMITS.jsonLd).forEach(s => {
    const t = s.textContent || '';
    if (t.length > LIMITS.jsonLdChars) return;
    try { walk(JSON.parse(t)); } catch { /* defektes JSON-LD ignorieren */ }
  });
  for (const p of products) {
    if (!title) title = p.name || '';
    if (!image) { const im = /** @type {any[]} */ ([]).concat(p.image || [])[0]; image = typeof im === 'string' ? im : (im && im.url) || ''; }
    if (price == null) {
      const offers = /** @type {any[]} */ ([]).concat(p.offers || []).flatMap(o => (o && o.offers ? /** @type {any[]} */ ([]).concat(o.offers) : [o]));
      for (const o of offers) {
        const v = parsePrice(o?.price ?? o?.lowPrice ?? o?.priceSpecification?.price);
        if (v != null) { price = v; priceSource = 'json-ld'; cur = cur || o.priceCurrency || o.priceSpecification?.priceCurrency || ''; break; }
      }
    }
  }
  if (!title) title = doc.title || '';
  if (price == null) {
    const e = doc.querySelector('[itemprop=price]');
    if (e) { price = parsePrice(e.getAttribute('content') || e.textContent); if (price != null) priceSource = 'itemprop'; }
  }
  if (price == null) {
    const t = priceFromText(doc);
    if (t) { price = t.price; cur = cur || t.cur; priceSource = 'text'; }
  }
  // Bild-Adressen mit http auf einer https-Seite würden blockiert: auf https anheben
  if (/^http:\/\//i.test(image) && /^https:/i.test(baseUrl)) image = image.replace(/^http:/i, 'https:'); // CSP erlaubt nur https-Bilder
  const finalPrice = sanitizePrice(price);
  return {
    title: cleanTitle(title, meta('og:site_name')),
    image: chooseImage(doc, image, baseUrl, opts),
    price: finalPrice,
    cur: normalizeCurrency(cur),
    priceSource: finalPrice == null ? '' : priceSource,
  };
}

/**
 * Parst HTML-Text in ein inaktives Dokument (Skripte laufen nicht, Bilder laden nicht) und liest das Produkt aus.
 * @param {string} html
 * @param {string} baseUrl
 * @param {{ allowLocal?: boolean }} [opts]
 * @returns {ProductInfo}
 */
export function parseProductHtml(html, baseUrl, opts = {}) {
  const doc = new DOMParser().parseFromString(String(html).slice(0, LIMITS.html), 'text/html');
  return extractProduct(doc, baseUrl, opts);
}
