// @ts-check
import { VERSION } from './version.js';

/**
 * Passt die Seite (index.html) zu den Modulen? Beides nennt seine Version: die Seite im meta-Feld „app-version“, die Module in js/version.js.
 * @param {string} pageVersion Version laut Seite (leer, wenn die Seite das Feld nicht kennt, also älter ist)
 * @param {string} codeVersion Version der Module
 */
export const mismatch = (pageVersion, codeVersion) => pageVersion !== codeVersion;

const KEY = 'anprobe-heal', WAIT = 60000;

/**
 * Seite und Module passen nicht zusammen: Die Seite wird frisch geholt (dabei landet sie auch im Cache des Service Workers) und neu geladen.
 * Ein solcher Mischstand entsteht, wenn eine ältere Version mit „Aktualisieren“ nur die Module neu lädt, die Seite aber aus ihrem Cache liefert,
 * etwa weil die App über „/“ statt über „/index.html“ geöffnet war. Höchstens einmal pro Minute, damit nie eine Schleife entsteht.
 */
async function heal() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) < WAIT) return;
    sessionStorage.setItem(KEY, String(Date.now()));
    await fetch(new URL('index.html', location.href), { cache: 'reload', credentials: 'omit' });
    location.reload();
  } catch { /* offline oder kein Speicher: es bleibt beim Mischstand, die nächste Aktualisierung behebt ihn */ }
}

// main.js importiert dieses Modul als Erstes: Es läuft, bevor die übrigen Module die Seite anfassen.
if (typeof document !== 'undefined' && mismatch(document.querySelector('meta[name="app-version"]')?.getAttribute('content') || '', VERSION)) heal();
