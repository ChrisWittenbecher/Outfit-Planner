// @ts-check
/**
 * Anprobe – Versionsnummer. Muss mit package.json und version.json übereinstimmen (prüft tests/unit/version.test.mjs).
 * Bei jeder Veröffentlichung hochzählen: sonst erfahren geöffnete Tabs und gespeicherte Startbildschirm-Apps nichts vom Update.
 */
export const VERSION = '1.2.1';
/**
 * Wählt aus den Adressen einer Seite aus, was beim Aktualisieren neu geladen wird: nur eigene Dateien der App
 * (gleicher Ursprung, gleicher Ordner oder darunter, bekannte Endung), ohne Doppelte, höchstens 60.
 * @param {readonly (string | null)[]} hrefs rohe href- und src-Werte
 * @param {string} base Adresse der Seite
 * @returns {string[]}
 */
export function refreshTargets(hrefs, base) {
  let page;
  try { page = new URL(base); } catch { return []; }
  const dir = page.pathname.replace(/[^/]*$/, '');
  const out = new Set();
  for (const h of hrefs) {
    if (typeof h !== 'string' || h.length > 300) continue;
    let u;
    try { u = new URL(h, page); } catch { continue; }
    if (u.origin === page.origin && u.pathname.startsWith(dir) && /\.(js|css|png|json)$/.test(u.pathname)) out.add(u.origin + u.pathname);
  }
  return [...out].slice(0, 60);
}
/** Eine Version aus fremder Quelle (version.json) ist nur gültig, wenn sie genau wie „1.2.0“ aussieht. */
export const isVersion = (/** @type {unknown} */ v) => typeof v === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v);
