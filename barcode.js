// @ts-check
/**
 * Anprobe – Barcode-Prüfung (Schritt 3). Reine Funktionen, ohne Kamera und ohne DOM.
 * Unterstützt EAN-8, UPC-A (12), EAN-13 und GTIN-14 mit Prüfziffer (Modulo 10).
 */

/** @typedef {{ ok: true, code: string, kind: 'EAN-8' | 'UPC-A' | 'EAN-13' | 'GTIN-14' } | { ok: false, error: string }} GtinResult */

/**
 * Entfernt Leerzeichen und Bindestriche. Gibt nur Ziffern zurück, sonst leeren Text.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeCode(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  const s = String(raw).trim().replace(/[\s-]/g, '');
  return /^\d+$/.test(s) ? s : '';
}

/**
 * Berechnet die GTIN-Prüfziffer für den Ziffernblock OHNE Prüfziffer.
 * Von rechts mit 3, 1, 3, 1 … gewichten.
 * @param {string} body
 * @returns {number}
 */
export function checkDigit(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/**
 * Prüft Länge und Prüfziffer.
 * @param {unknown} raw Eingabe oder Scan-Ergebnis
 * @returns {GtinResult}
 */
export function parseGtin(raw) {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, error: 'Bitte nur Ziffern eingeben (Leerzeichen und Bindestriche sind erlaubt).' };
  const kinds = /** @type {const} */ ({ 8: 'EAN-8', 12: 'UPC-A', 13: 'EAN-13', 14: 'GTIN-14' });
  const kind = /** @type {Record<number, 'EAN-8' | 'UPC-A' | 'EAN-13' | 'GTIN-14'>} */ (kinds)[code.length];
  if (!kind) return { ok: false, error: 'Ein Barcode hat 8, 12, 13 oder 14 Ziffern. Hier sind es ' + code.length + '.' };
  if (/^0+$/.test(code)) return { ok: false, error: 'Diese Nummer ist kein gültiger Barcode.' };
  if (checkDigit(code.slice(0, -1)) !== Number(code[code.length - 1])) {
    return { ok: false, error: 'Die Prüfziffer stimmt nicht. Bitte die Nummer noch einmal prüfen.' };
  }
  return { ok: true, code, kind };
}

/**
 * Schlüssel für die Produktsuche: UPC-A (12) wird zu EAN-13 mit führender Null.
 * @param {string} code gültiger Code
 * @returns {string}
 */
export function lookupKey(code) {
  return code.length === 12 ? '0' + code : code;
}
