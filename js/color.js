// @ts-check
export const COLOR_NAMES = Object.freeze(['Schwarz', 'Weiß', 'Grau', 'Beige', 'Braun', 'Rot', 'Orange', 'Gelb', 'Grün', 'Blau', 'Lila', 'Rosa']);

/**
 * Nächster Farbname für einen Farbwert (0–255 je Kanal).
 * @param {number} r @param {number} g @param {number} b
 * @returns {typeof COLOR_NAMES[number]}
 */
export function colorName(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, c = max - min;
  const s = c === 0 ? 0 : c / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (c > 0) {
    if (max === R) h = ((G - B) / c) % 6;
    else if (max === G) h = (B - R) / c + 2;
    else h = (R - G) / c + 4;
    h = (h * 60 + 360) % 360;
  }
  if (l < 0.13) return 'Schwarz';
  if (l > 0.92 || (l > 0.88 && s < 0.7)) return 'Weiß';
  if (s < 0.14) return l < 0.26 ? 'Schwarz' : l > 0.82 ? 'Weiß' : 'Grau';
  if (h < 15 || h >= 345) return l > 0.74 ? 'Rosa' : 'Rot';
  if (h < 45) {
    if (l > 0.66 && s < 0.7) return 'Beige';
    if (l < 0.46 || s < 0.45) return 'Braun';
    return 'Orange';
  }
  if (h < 70) return s < 0.5 && l > 0.58 ? 'Beige' : l < 0.36 ? 'Braun' : 'Gelb';
  if (h < 170) return 'Grün';
  if (h < 255) return 'Blau';
  if (h < 300) return 'Lila';
  return l >= 0.55 ? 'Rosa' : 'Lila';
}

/**
 * Häufigste Farbe eines Bildes. Durchsichtige Pixel zählen nicht. Bei Bildern ohne Freistellung zählt nur die Mitte, damit der Hintergrund nicht gewinnt.
 * @param {ArrayLike<number>} data RGBA-Pixel
 * @param {number} width
 * @param {number} height
 * @param {{ center?: boolean }} [opts]
 * @returns {typeof COLOR_NAMES[number] | null} null, wenn nichts Sichtbares da ist
 */
export function dominantColor(data, width, height, opts = {}) {
  if (!(width > 0 && height > 0) || data.length < width * height * 4) return null;
  const x0 = opts.center ? Math.floor(width * 0.25) : 0, x1 = opts.center ? Math.ceil(width * 0.75) : width;
  const y0 = opts.center ? Math.floor(height * 0.25) : 0, y1 = opts.center ? Math.ceil(height * 0.75) : height;
  /** @type {Record<string, number>} */
  const count = {};
  let seen = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const n = colorName(data[i], data[i + 1], data[i + 2]);
      count[n] = (count[n] || 0) + 1; seen++;
    }
  }
  if (!seen) return null;
  return COLOR_NAMES.reduce((best, n) => ((count[n] || 0) > (count[best] || 0) ? n : best), COLOR_NAMES[0]);
}
