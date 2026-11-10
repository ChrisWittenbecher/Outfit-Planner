// Anprobe-Hilfsdienst für Cloudflare Workers.
// Holt auf Wunsch der App eine Produktseite und gibt nur Name, Preis, Währung, Farbe, Marke, Link und Bildadresse zurück.
// Dazu liefert er das Produktbild aus, weil Browser fremde Bilder nicht direkt lesen dürfen.
// Der Dienst speichert nichts, setzt keine Cookies und leitet keine Anmeldedaten weiter.

/** Webseiten, die den Dienst aufrufen dürfen. Weitere Adressen (z. B. zum Testen) über die Variable EXTRA_ORIGIN. */
const ALLOWED_ORIGINS = ['https://chriswittenbecher.github.io'];
const LIMITS = { html: 1_500_000, image: 8_000_000, redirects: 3, waitMs: 8000, url: 2048 };
const BLOCKED_SUFFIX = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet', '.workers.dev', '.pages.dev'];

/** Prüft eine Zieladresse. Erlaubt sind nur https-Adressen mit Domainnamen auf dem Standardport. */
export function checkTarget(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > LIMITS.url) return { ok: false, error: 'bad_url' };
  let u;
  try { u = new URL(raw); } catch { return { ok: false, error: 'bad_url' }; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return { ok: false, error: 'bad_url' };
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h.startsWith('[') || /^[\d.]+$/.test(h) || /^0x[0-9a-f]+$/i.test(h) || h.endsWith('.') || h === 'localhost') return { ok: false, error: 'bad_url' };
  if (BLOCKED_SUFFIX.some(s => h.endsWith(s))) return { ok: false, error: 'bad_url' };
  if (!/^[a-z0-9.-]+$/.test(h) && !h.startsWith('xn--') && !/[^\x00-\x7f]/.test(raw)) return { ok: false, error: 'bad_url' };
  u.hash = '';
  return { ok: true, url: u.href };
}

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' '; }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const attrs = tag => {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
};

const text = v => v == null ? '' : String(typeof v === 'object' ? (v.name || v['@id'] || '') : v).trim();
const imagesOf = (v, depth = 0) => !v || depth > 3 ? [] : Array.isArray(v) ? v.flatMap(x => imagesOf(x, depth + 1)) : typeof v === 'object' ? imagesOf(v.url || v.contentUrl, depth + 1) : [String(v)];
const isProduct = n => { const t = n && n['@type']; return t === 'Product' || t === 'ProductGroup' || (Array.isArray(t) && (t.includes('Product') || t.includes('ProductGroup'))); };
function findProduct(n, depth = 0) {
  if (!n || typeof n !== 'object' || depth > 6) return null;
  if (Array.isArray(n)) { for (const x of n) { const a = findProduct(x, depth + 1); if (a) return a; } return null; }
  return isProduct(n) ? n : findProduct(n['@graph'], depth + 1) || findProduct(n.mainEntity, depth + 1);
}

/** Liest Produktdaten aus dem HTML einer Seite (JSON-LD zuerst, dann Meta-Angaben). */
export function extractProduct(html, pageUrl) {
  const out = { name: '', price: '', currency: '', url: pageUrl, image: '', color: '', brand: '' };
  const meta = {}, metaAll = {};
  let found = [];
  let canonical = '';
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]), k = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (k && a.content) { if (!(k in meta)) meta[k] = a.content.trim(); (metaAll[k] ||= []).push(a.content.trim()); }
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) { const a = attrs(m[0]); if (!canonical && /(^|\s)canonical(\s|$)/i.test(a.rel || '') && a.href) canonical = a.href; }
  const pick = names => { for (const n of names) if (meta[n]) return meta[n]; return ''; };
  let product = null;
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (product) break;
    try { product = findProduct(JSON.parse(m[1])); } catch { /* kaputter Block: nächsten versuchen */ }
  }
  if (product) {
    const variant = Array.isArray(product.hasVariant) ? product.hasVariant[0] : null;
    let offer = product.offers || (variant && variant.offers);
    if (Array.isArray(offer)) offer = offer[0];
    out.name = text(product.name); out.brand = text(product.brand);
    out.color = text(product.color || (variant && variant.color));
    found = [...imagesOf(product.image), ...imagesOf(variant && variant.image)];
    out.image = found[0] || '';
    if (offer) {
      const spec = Array.isArray(offer.priceSpecification) ? offer.priceSpecification[0] : offer.priceSpecification;
      out.price = text(offer.price != null ? offer.price : offer.lowPrice != null ? offer.lowPrice : spec ? spec.price : '');
      out.currency = text(offer.priceCurrency || (spec && spec.priceCurrency));
    }
  }
  if (!out.name) out.name = pick(['og:title', 'twitter:title']) || decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]).trim();
  const social = ['og:image:secure_url', 'og:image', 'twitter:image'].flatMap(k => metaAll[k] || []);
  if (!out.image) out.image = social[0] || '';
  if (!out.price) out.price = pick(['product:price:amount', 'og:price:amount', 'price']);
  if (!out.currency) out.currency = pick(['product:price:currency', 'og:price:currency', 'pricecurrency']);
  if (!out.brand) out.brand = pick(['product:brand', 'og:brand']);
  if (!out.color) out.color = pick(['product:color', 'og:color']);
  const abs = u => { try { return new URL(u, pageUrl).href; } catch { return ''; } };
  if (canonical) out.url = abs(canonical) || pageUrl;
  out.image = out.image ? abs(out.image) : '';
  const images = [];
  for (const u of [out.image, ...found, ...social]) { const a = u ? abs(u) : ''; if (a.startsWith('https://') && a.length <= LIMITS.url && !images.includes(a)) images.push(a); if (images.length === 8) break; }
  const cut = (v, n) => String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  return { name: cut(out.name, 200), price: cut(out.price, 30), currency: cut(out.currency, 8), url: cut(out.url, LIMITS.url), image: cut(out.image, LIMITS.url), images, color: cut(out.color, 60), brand: cut(out.brand, 60) };
}

/** Erkennt Bildformate an den ersten Bytes. SVG und alles andere wird abgelehnt. */
export function sniffImage(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'image/avif';
  return '';
}

class Refuse extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }

/** Liest höchstens `max` Bytes; bei mehr wird abgebrochen, statt alles zu laden. */
async function readLimited(res, max) {
  const declared = Number(res.headers.get('content-length'));
  if (declared > max) throw new Refuse('too_large', 413);
  const reader = res.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { try { await reader.cancel(); } catch { /* egal */ } throw new Refuse('too_large', 413); }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return all;
}

/** Ruft die Adresse ab und folgt Weiterleitungen von Hand, damit jedes Ziel erneut geprüft wird. */
async function get(url, accept, fetcher) {
  let current = url;
  for (let hop = 0; hop <= LIMITS.redirects; hop++) {
    const t = checkTarget(current);
    if (!t.ok) throw new Refuse('bad_url', 400);
    let res;
    try {
      res = await fetcher(t.url, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(LIMITS.waitMs),
        headers: { accept, 'accept-language': 'de-DE,de;q=0.9,en;q=0.5', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
      });
    } catch { throw new Refuse('unreachable', 502); }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Refuse('unreachable', 502);
      try { current = new URL(loc, t.url).href; } catch { throw new Refuse('bad_url', 400); }
      continue;
    }
    if (!res.ok) throw new Refuse(res.status === 404 ? 'not_found' : 'blocked', 502);
    return { res, url: t.url };
  }
  throw new Refuse('too_many_redirects', 502);
}

export async function loadProduct(url, fetcher = fetch) {
  const { res, url: final } = await get(url, 'text/html,application/xhtml+xml', fetcher);
  if (!/^(text\/html|application\/xhtml\+xml)/i.test(res.headers.get('content-type') || '')) throw new Refuse('not_html', 415);
  const bytes = await readLimited(res, LIMITS.html);
  const charset = ((res.headers.get('content-type') || '').match(/charset=([\w-]+)/i) || [, 'utf-8'])[1];
  let html;
  try { html = new TextDecoder(charset).decode(bytes); } catch { html = new TextDecoder('utf-8').decode(bytes); }
  return extractProduct(html, final);
}

export async function loadImage(url, fetcher = fetch) {
  const { res } = await get(url, 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5', fetcher);
  const bytes = await readLimited(res, LIMITS.image);
  const mime = sniffImage(bytes);
  if (!mime) throw new Refuse('not_image', 415);
  return { bytes, mime };
}

const base = origin => ({
  'access-control-allow-origin': origin, vary: 'origin', 'cache-control': 'no-store',
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cross-origin-resource-policy': 'cross-origin',
});
const json = (body, status, origin) => new Response(JSON.stringify(body), { status, headers: { ...base(origin), 'content-type': 'application/json; charset=utf-8' } });

export async function handle(request, env = {}, fetcher = fetch) {
  const allowed = [...ALLOWED_ORIGINS, ...(env.EXTRA_ORIGIN ? [env.EXTRA_ORIGIN] : [])];
  const origin = request.headers.get('origin') || '';
  if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...base(origin), 'access-control-allow-methods': 'GET', 'access-control-max-age': '600' } });
  if (request.method !== 'GET') return json({ error: 'method' }, 405, origin);
  const route = new URL(request.url);
  if (env.LIMITER && typeof env.LIMITER.limit === 'function') {
    const { success } = await env.LIMITER.limit({ key: request.headers.get('cf-connecting-ip') || 'anon' });
    if (!success) return json({ error: 'rate' }, 429, origin);
  }
  const target = route.searchParams.get('u') || '';
  try {
    if (route.pathname === '/product') return json(await loadProduct(target, fetcher), 200, origin);
    if (route.pathname === '/image') {
      const { bytes, mime } = await loadImage(target, fetcher);
      return new Response(bytes, { status: 200, headers: { ...base(origin), 'content-type': mime } });
    }
    return json({ error: 'not_found' }, 404, origin);
  } catch (e) {
    if (e instanceof Refuse) return json({ error: e.code }, e.status, origin);
    return json({ error: 'failed' }, 500, origin);
  }
}

export default { fetch: (request, env) => handle(request, env) };
