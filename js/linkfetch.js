// @ts-check
import { WORKER_URL } from './config.js';
import { normalizeShop } from './shopdata.js';
import { IMAGE_LIMITS, validateUrl } from './scraper.js';

const MESSAGES = /** @type {Record<string, string>} */ ({
  bad_url: 'Der Link ist ungültig. Er muss mit https:// beginnen.',
  not_found: 'Diese Seite gibt es nicht (mehr).',
  blocked: 'Der Shop lässt das automatische Auslesen nicht zu.',
  unreachable: 'Der Shop antwortet nicht.',
  too_large: 'Die Seite ist zu groß.',
  not_html: 'Das ist keine normale Webseite.',
  too_many_redirects: 'Der Link leitet zu oft weiter.',
  rate: 'Zu viele Anfragen. Bitte kurz warten.',
});
const WAIT = 20000;

/** @param {string} path @param {string} target @param {string} accept */
async function call(path, target, accept) {
  const res = await fetch(`${WORKER_URL}${path}?u=${encodeURIComponent(target)}`, {
    method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', headers: { accept }, signal: AbortSignal.timeout(WAIT),
  });
  return res;
}
/** @param {Response} res */
async function failure(res) {
  let code = '';
  try { code = String((await res.json()).error || ''); } catch { /* keine Fehlerangabe */ }
  return new Error(MESSAGES[code] || 'Der Dienst konnte die Seite nicht lesen.');
}

export const linkFetchEnabled = () => WORKER_URL.startsWith('https://');

/**
 * Holt Produktdaten zu einem Shop-Link über den Hilfsdienst und prüft die Antwort wie fremde Eingabe.
 * @param {string} link
 */
export async function fetchProduct(link) {
  const v = validateUrl(link);
  if (!v.ok || !v.url.startsWith('https://')) throw new Error(MESSAGES.bad_url);
  let res;
  try { res = await call('/product', v.url, 'application/json'); } catch { throw new Error('Der Hilfsdienst ist nicht erreichbar. Bitte später noch einmal versuchen.'); }
  if (!res.ok) throw await failure(res);
  const text = await res.text();
  if (text.length > 20_000) throw new Error('Die Antwort ist zu groß.');
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('Die Antwort ist nicht lesbar.'); }
  const d = normalizeShop(raw);
  if (!d.ok) throw new Error(d.error);
  if (!d.link) d.link = v.url;
  return { ...d, outdated: !Array.isArray(raw.images) };   // ältere Dienst-Versionen kennen keine Bildauswahl
}

/** Holt das Produktbild über den Hilfsdienst; null, wenn es sich nicht laden lässt. @param {string} imageUrl */
export async function fetchImage(imageUrl) {
  try {
    const res = await call('/image', imageUrl, 'image/*');
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size || blob.size > IMAGE_LIMITS.bytes || !/^image\/(jpeg|png|webp|gif|avif)$/.test(blob.type)) return null;
    return new File([blob], 'shop', { type: blob.type });
  } catch { return null; }
}
