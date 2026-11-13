// @ts-check
// Warteschlange für mehrere Fotos: Zustände, Fortschritt, Beschriftungen. Reine Logik ohne Oberfläche.

/** @typedef {'wait' | 'work' | 'done' | 'fail'} RowState */
/** @typedef {{ state: RowState, cat: string, procCat: string | null }} QRow */
/** @typedef {{ total: number, wait: number, work: number, done: number, fail: number }} Counts */

/** Höchste Textmenge aller fertigen Bilder (Original und Ergebnis als Text) im Arbeitsspeicher. Darüber werden weitere Fotos auf später verschoben. */
export const MAX_QUEUE_CHARS = 80_000_000;

const plural = (/** @type {number} */ n, /** @type {string} */ one, /** @type {string} */ many) => n + ' ' + (n === 1 ? one : many);

/** @param {readonly QRow[]} rows @returns {Counts} */
export function counts(rows) {
  const c = { total: rows.length, wait: 0, work: 0, done: 0, fail: 0 };
  for (const r of rows) c[r.state]++;
  return c;
}

/** Anteil der abgeschlossenen Fotos (fertig oder Fehler) in ganzen Prozent. @param {Counts} c */
export const percent = c => (c.total ? Math.round((c.done + c.fail) * 100 / c.total) : 0);

/** Nächstes Foto, das noch wartet. @template {QRow} R @param {readonly R[]} rows @returns {R | undefined} */
export const nextRow = rows => rows.find(r => r.state === 'wait');

/**
 * Das Ergebnis passt nicht mehr, wenn die Kategorie während der Verarbeitung zwischen „Schuhe“ und etwas anderem gewechselt wurde:
 * Bei Schuhen wird ein einzelner Schuh gespiegelt ergänzt, sonst nicht.
 * @param {QRow} row
 */
export const needsRedo = row => row.procCat !== null && (row.procCat === 'Schuhe') !== (row.cat === 'Schuhe');

/** Passt ein weiteres Ergebnis dieser Größe noch in den Speicher? @param {number} used @param {number} size */
export const inBudget = (used, size) => Number.isFinite(used) && Number.isFinite(size) && used + size <= MAX_QUEUE_CHARS;

/** Zeile unter dem Titel. @param {Counts} c */
export function headText(c) {
  if (!c.total) return '';
  const fails = c.fail ? ', ' + c.fail + ' mit Fehler' : '';
  if (c.wait + c.work > 0) return (c.done + c.fail) + ' von ' + c.total + ' fertig' + fails;
  if (!c.done) return 'Kein Foto konnte verarbeitet werden.';
  return c.done + ' von ' + plural(c.total, 'Foto', 'Fotos') + (c.done === 1 ? ' ist' : ' sind') + ' bereit' + fails;
}

/** Beschriftung des Knopfes „Hinzufügen“. @param {Counts} c */
export function addLabel(c) {
  if (!c.done) return 'Hinzufügen';
  return (c.wait + c.work > 0 ? 'Fertige hinzufügen (' : 'Hinzufügen (') + c.done + ')';
}

/**
 * Meldung nach dem Hinzufügen.
 * @param {{ added: number, cats: readonly string[], wish: boolean, failed: number, stopped: number, notImage: number, tooMany: number, max: number }} r
 */
export function resultText(r) {
  const why = [
    r.failed ? r.failed + ' nicht lesbar' : '',
    r.stopped ? r.stopped + ' nicht mehr verarbeitet' : '',
    r.notImage ? plural(r.notImage, 'Datei', 'Dateien') + ' ohne Bild' : '',
    r.tooMany ? r.tooMany + ' über dem Limit von ' + r.max : '',
  ].filter(Boolean).join(', ');
  const cat = r.cats.length === 1 ? 'Kategorie ' + r.cats[0] : r.cats.length + ' Kategorien';
  return plural(r.added, 'Teil', 'Teile') + ' hinzugefügt (' + cat + (r.wish ? ', Wunschliste' : '') + ')' + (why ? '. Übersprungen: ' + why : '') + '. Namen und Angaben änderst du mit ✎.';
}
