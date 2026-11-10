import test from 'node:test';
import assert from 'node:assert/strict';
import { COLOR_NAMES, colorName, dominantColor } from '../../js/color.js';

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const name = h => colorName(...hex(h));

test('typische Kleidungsfarben bekommen den erwarteten Namen', () => {
  const cases = {
    '#000000': 'Schwarz', '#111111': 'Schwarz', '#1c1c1c': 'Schwarz', '#243b82': 'Blau', '#1f2a44': 'Blau',
    '#ffffff': 'Weiß', '#f5f5f5': 'Weiß', '#808080': 'Grau', '#b0b0b0': 'Grau', '#444444': 'Grau',
    '#d8c3a5': 'Beige', '#c3b091': 'Beige', '#f5f5dc': 'Weiß', '#c19a6b': 'Braun', '#8b4513': 'Braun', '#5c4033': 'Braun',
    '#ff0000': 'Rot', '#b22222': 'Rot', '#800020': 'Rot', '#ff8c00': 'Orange', '#ffd700': 'Gelb', '#ffeb3b': 'Gelb',
    '#228b22': 'Grün', '#556b2f': 'Grün', '#0000ff': 'Blau', '#4a6fa5': 'Blau', '#87ceeb': 'Blau', '#800080': 'Lila', '#9370db': 'Lila',
    '#ffc0cb': 'Rosa', '#ff69b4': 'Rosa', '#ffb6c1': 'Rosa',
  };
  for (const [h, want] of Object.entries(cases)) assert.equal(name(h), want, `${h} → ${name(h)}, erwartet ${want}`);
});

test('colorName liefert immer einen bekannten Namen (Stichprobe über den Farbraum)', () => {
  for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) assert.ok(COLOR_NAMES.includes(colorName(r, g, b)), `${r},${g},${b}`);
});

const solid = (w, h, rgba) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set(rgba, i * 4); return d; };

test('dominantColor: einfarbiges Bild', () => {
  assert.equal(dominantColor(solid(8, 8, [36, 59, 130, 255]), 8, 8), 'Blau');
  assert.equal(dominantColor(solid(4, 4, [255, 255, 255, 255]), 4, 4), 'Weiß');
});

test('dominantColor: durchsichtige Pixel zählen nicht', () => {
  const d = solid(10, 10, [0, 0, 0, 0]);
  for (let i = 0; i < 20; i++) d.set([200, 30, 30, 255], i * 4);   // 20 rote Pixel
  assert.equal(dominantColor(d, 10, 10), 'Rot');
  assert.equal(dominantColor(solid(5, 5, [255, 0, 0, 100]), 5, 5), null, 'halb durchsichtig = unsichtbar');
  assert.equal(dominantColor(solid(5, 5, [255, 0, 0, 0]), 5, 5), null);
});

test('dominantColor: die größte Fläche gewinnt, nicht der hellste oder grellste Pixel', () => {
  const w = 10, h = 10, d = solid(w, h, [30, 30, 30, 255]);
  for (let i = 0; i < 20; i++) d.set([255, 255, 0, 255], i * 4);   // 20 % gelb
  assert.equal(dominantColor(d, w, h), 'Schwarz');
});

test('dominantColor: bei Bildern ohne Freistellung zählt die Mitte', () => {
  const w = 20, h = 20, d = solid(w, h, [255, 255, 255, 255]);   // weißer Hintergrund
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) d.set([200, 20, 20, 255], (y * w + x) * 4);   // rotes Teil in der Mitte (25 % der Fläche)
  assert.equal(dominantColor(d, w, h), 'Weiß');
  assert.equal(dominantColor(d, w, h, { center: true }), 'Rot');
});

test('dominantColor verträgt ungültige Größen und zu kurze Daten', () => {
  assert.equal(dominantColor([], 0, 0), null);
  assert.equal(dominantColor(new Uint8ClampedArray(4), 4, 4), null);
  assert.equal(dominantColor(new Uint8ClampedArray(16), -1, 2), null);
});
