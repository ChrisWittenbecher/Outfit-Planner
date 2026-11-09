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
