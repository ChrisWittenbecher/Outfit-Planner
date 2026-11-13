// @ts-check
export const MAX_BATCH = 30;

const GENERIC = /^(?:img|image|bild|foto|photo|picture|screenshot|bildschirmfoto|dsc|pxl|scan|download|unbenannt|untitled)(?:[\d\s._:-]|\b(?:at|um|am|pm)\b)*$/i;

/**
 * Vorschlag für den Namen eines Teils aus dem Dateinamen. Kamera- und Screenshot-Namen („IMG_1234“) sind kein Name.
 * @param {unknown} filename
 * @param {(v: unknown) => string} clean Textreiniger (sanitizeText aus scraper.js)
 * @returns {string}
 */
export function nameFromFile(filename, clean) {
  const stem = clean(String(filename ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_]+/g, ' ').replace(/\s*-\s*/g, ' - '));
  if (!stem || /^[\d\s._-]+$/.test(stem) || GENERIC.test(stem)) return 'Neues Teil';
  return stem;
}

/**
 * Prüft eine Auswahl von Dateien: nur Bilder, höchstens `max`.
 * @template {{ type?: unknown }} F
 * @param {readonly F[]} files
 * @param {number} [max]
 * @returns {{ list: F[], notImage: number, tooMany: number }} list: die Bilder, die verarbeitet werden. notImage: keine Bilder. tooMany: Bilder über dem Limit.
 */
export function planFiles(files, max = MAX_BATCH) {
  const images = files.filter(f => !!f && typeof f.type === 'string' && f.type.startsWith('image/'));
  const list = images.slice(0, max);
  return { list, notImage: files.length - images.length, tooMany: images.length - list.length };
}
