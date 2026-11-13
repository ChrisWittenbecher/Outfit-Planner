// @ts-check
// Teilen als Bild: Dateiname, Unterstützung des Geräts und Art eines Fehlers. Reine Logik ohne Oberfläche.

const MAX_SLUG = 40;
/** @type {Record<string, string>} */
const FOLD = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };

/**
 * Dateiname aus dem Namen des Outfits: nur a–z, 0–9 und Bindestriche, Umlaute ausgeschrieben, höchstens 40 Zeichen im Namensteil.
 * Ohne brauchbaren Namen (leer, nur Sonderzeichen oder Emojis) heißt die Datei „outfit.png“.
 * @param {unknown} name
 * @returns {string}
 */
export function shareFileName(name) {
  const slug = (typeof name === 'string' ? name : '')
    .toLowerCase()
    .replace(/[äöüß]/g, c => FOLD[c])
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '');
  if (!slug) return 'outfit.png';
  return (slug.startsWith('outfit') ? slug : 'outfit-' + slug) + '.png';
}

/**
 * Kann dieses Gerät die Datei über das Teilen-Menü des Systems senden?
 * @param {{ share?: unknown, canShare?: unknown } | null | undefined} nav meist `navigator`
 * @param {File} file
 */
export function canShareImage(nav, file) {
  try {
    if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    return nav.canShare.call(nav, { files: [file] }) === true;
  } catch { return false; }
}

/**
 * Was ein gescheitertes Teilen bedeutet.
 * abort: Die Person hat das Menü geschlossen (keine Fehlermeldung). denied: Der Browser verlangt eine frische Berührung. other: sonst.
 * @param {unknown} err
 * @returns {'abort' | 'denied' | 'other'}
 */
export function classifyShareError(err) {
  const n = err && typeof err === 'object' ? /** @type {{ name?: unknown }} */ (err).name : '';
  return n === 'AbortError' ? 'abort' : n === 'NotAllowedError' ? 'denied' : 'other';
}
