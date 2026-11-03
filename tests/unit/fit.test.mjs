// Unit-Tests für den Outfit-Fitter (js/fit.js, ohne DOM).  Start:  node --test tests/unit/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fit from '../../js/fit.js';
import { BOARD, LIMITS } from '../../js/geometry.js';

const part = (id, cat, aspect, waist = 0.8, hem = 0.9) => ({ id, cat, aspect, waist, hem });
const TOP = part('t', 'Oberteil', 1.1, 0.7, 0.62);
const PANTS = part('p', 'Hose/Rock', 1.9, 0.72, 0.95);
const SHOES = part('s', 'Schuhe', 0.5, 0.9, 0.9);
const JACKET = part('j', 'Jacke', 1.15, 0.8, 0.8);
const BAG = part('b', 'Accessoire', 1.0, 0.8, 0.8);
const by = slots => Object.fromEntries(slots.map(s => [s.id, s]));
const H = (slot, aspect) => slot.w * aspect;

/* ---------- Messung der Umrisse ---------- */
/** Maske aus einer Funktion (Zeile, Breite) -> Spanne in Pixeln, mittig. */
const mask = (w, h, span) => { const a = new Uint8Array(w * h); for (let y = 0; y < h; y++) { const e = span(y); const lo = Math.round((w - e) / 2); for (let x = lo; x < lo + e; x++) a[y * w + x] = 255; } return a; };

test('bandRatios: Oberteil mit breiten Ärmeln, engerem Saum', () => {
  const m = mask(64, 64, y => (y < 26 ? 64 : 40));
  const r = fit.bandRatios(m, 64, 64);
  assert.ok(Math.abs(r.waist - 1) < 0.02, 'oben volle Breite ' + r.waist);
  assert.ok(Math.abs(r.hem - 40 / 64) < 0.02, 'Saum 40/64 ' + r.hem);
});
test('bandRatios: Hose wird nach unten weiter, Lücke zwischen den Beinen zählt zur Spanne', () => {
  const m = mask(64, 100, y => Math.round(40 + 24 * y / 99));
  const r = fit.bandRatios(m, 64, 100);
  assert.ok(r.waist > 0.62 && r.waist < 0.72, 'Bund ' + r.waist);
  assert.ok(r.hem > 0.93 && r.hem <= 1, 'Saum ' + r.hem);
});
test('bandRatios: leere oder ungültige Maske ergibt Standardwerte, nie NaN', () => {
  for (const [a, w, h] of [[new Uint8Array(64 * 64), 64, 64], [new Uint8Array(10), 64, 64], [[], 0, 0], [new Uint8Array(4), -1, 2]]) {
    assert.deepEqual(fit.bandRatios(a, w, h), { waist: fit.DEFAULTS.waist, hem: fit.DEFAULTS.hem });
  }
});
test('bandRatios: Ränder aus Leerzeilen oben und unten stören nicht', () => {
  const m = mask(64, 80, y => (y < 8 || y >= 72 ? 0 : (y < 30 ? 64 : 40)));
  const r = fit.bandRatios(m, 64, 80);
  assert.ok(Math.abs(r.hem - 40 / 64) < 0.03 && r.waist > 0.95, JSON.stringify(r));
});
test('bandRatios: Werte bleiben im Bereich 0,2 bis 1', () => {
  const m = mask(64, 64, y => (y < 3 ? 2 : 64));
  const r = fit.bandRatios(m, 64, 64);
  assert.ok(r.waist >= 0.2 && r.waist <= 1 && r.hem >= 0.2 && r.hem <= 1);
});

/* ---------- Anordnung ---------- */
test('layout: Saum des Oberteils ist so breit wie der Bund der Hose', () => {
  const s = by(fit.layout([TOP, PANTS]));
  const hemPx = s.t.w * TOP.hem, waistPx = s.p.w * PANTS.waist;
  assert.ok(Math.abs(hemPx - waistPx) / waistPx < 0.02, `Saum ${hemPx.toFixed(1)} px, Bund ${waistPx.toFixed(1)} px`);
});
test('layout: Hose beginnt knapp über dem Saum des Oberteils und ist mittig darunter', () => {
  const s = by(fit.layout([TOP, PANTS]));
  const overlap = (s.t.y + H(s.t, TOP.aspect)) - s.p.y;
  assert.ok(Math.abs(overlap / H(s.t, TOP.aspect) - fit.RULES.topOverlap) < 0.01, 'Überlappung ' + overlap);
  assert.ok(Math.abs((s.t.x + s.t.w / 2) - (s.p.x + s.p.w / 2)) < 0.2, 'gleiche Mitte');
});
test('layout: Schuhe stehen unter dem Hosensaum, nur wenig überlappend', () => {
  const s = by(fit.layout([TOP, PANTS, SHOES]));
  const pantsEnd = s.p.y + H(s.p, PANTS.aspect), sh = H(s.s, SHOES.aspect);
  assert.ok(s.s.y < pantsEnd && s.s.y > pantsEnd - 0.1 * sh - 0.2, `Schuhe ab ${s.s.y}, Saum ${pantsEnd}`);
  assert.ok(s.s.w < s.p.w, 'Schuhe schmaler als die Hose');
});
test('layout: Jacke ist breiter als das Oberteil, gleiche Mitte, beginnt etwas höher', () => {
  const s = by(fit.layout([TOP, JACKET, PANTS]));
  assert.ok(Math.abs(s.j.w / s.t.w - fit.RULES.jacketWidth) < 0.01);
  assert.ok(s.j.y <= s.t.y && Math.abs((s.j.x + s.j.w / 2) - (s.t.x + s.t.w / 2)) < 0.2);
});
test('layout: Accessoire steht rechts neben dem Körper, ohne ihn zu verdecken', () => {
  const s = by(fit.layout([TOP, PANTS, SHOES, BAG]));
  const bodyRight = Math.max(s.t.x + s.t.w, s.p.x + s.p.w, s.s.x + s.s.w);
  assert.ok(s.b.x >= bodyRight - 0.2, `Tasche ab ${s.b.x}, Körper bis ${bodyRight}`);
});
test('layout: ein einzelnes Teil wird mittig gesetzt und größer gezogen', () => {
  const [a] = fit.layout([TOP]);
  assert.ok(Math.abs(a.x + a.w / 2 - BOARD.w / 2) < 0.2 && Math.abs(a.y + H(a, TOP.aspect) / 2 - BOARD.h / 2) < 0.2);
  assert.equal(a.w, fit.RULES.maxTopWidth);
});
test('layout: Hose und Schuhe ohne Oberteil, Jacke ohne Oberteil, Schuhe allein: alles gültig', () => {
  for (const set of [[PANTS, SHOES], [JACKET, PANTS], [SHOES], [BAG], [JACKET]]) {
    const slots = fit.layout(set);
    assert.equal(slots.length, set.length);
    for (const s of slots) assert.ok([s.x, s.y, s.w].every(Number.isFinite) && s.w >= LIMITS.minW, JSON.stringify(s));
  }
});
test('layout: leere Liste und ungültige Teile', () => {
  assert.deepEqual(fit.layout([]), []);
  const slots = fit.layout([TOP, part('x', 'Hose/Rock', 0), part('y', 'Schuhe', NaN), PANTS]);
  assert.deepEqual(slots.map(s => s.id), ['t', 'p']);
});
test('layout: Reihenfolge der Eingabe ändert das Ergebnis nicht, Wiederholung ergibt dasselbe', () => {
  const a = by(fit.layout([TOP, PANTS, SHOES, JACKET, BAG])), b = by(fit.layout([BAG, JACKET, SHOES, PANTS, TOP]));
  assert.deepEqual(a, b);
  assert.deepEqual(fit.layout([TOP, PANTS]), fit.layout([TOP, PANTS]));
});
test('layout: sehr schmale oder sehr hohe Hose bleibt im erlaubten Verhältnis zum Oberteil', () => {
  for (const waist of [0.2, 0.3, 1]) {
    const s = by(fit.layout([TOP, part('p', 'Hose/Rock', 1.9, waist, 0.9)]));
    const r = s.p.w / s.t.w;
    assert.ok(r >= 0.55 - 0.02 && r <= 1.5 + 0.02, `Waist ${waist}: Verhältnis ${r.toFixed(2)}`);
  }
});
test('layout: Zufallsprüfung – alles liegt im Board, Breiten im erlaubten Bereich, nichts ist NaN', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const cats = ['Oberteil', 'Jacke', 'Hose/Rock', 'Schuhe', 'Accessoire'];
  for (let n = 0; n < 600; n++) {
    const parts = cats.filter(() => rnd() < 0.7).map((c, i) => part('id' + i, c, 0.25 + rnd() * 3, 0.2 + rnd() * 0.8, 0.2 + rnd() * 0.8));
    if (rnd() < 0.2) parts.push(part('extra', 'Accessoire', 0.3 + rnd() * 2));
    const slots = fit.layout(parts);
    assert.equal(slots.length, parts.length);
    slots.forEach((s, i) => {
      const asp = parts[i].aspect;
      assert.ok([s.x, s.y, s.w].every(Number.isFinite), 'Zahl');
      assert.ok(s.w >= LIMITS.minW && s.w <= LIMITS.maxW, 'Breite ' + s.w);
      assert.ok(s.x >= 0 && s.x + s.w <= BOARD.w + 0.1, `x ${s.x} + ${s.w}`);
      assert.ok(s.y >= 0 && s.y + s.w * asp <= BOARD.h + 0.2, `y ${s.y} + ${(s.w * asp).toFixed(1)}`);
    });
  }
});
test('layout: ein hohes Outfit passt in die Höhe und füllt das Board gut', () => {
  const s = fit.layout([TOP, PANTS, SHOES]);
  const top = Math.min(...s.map(k => k.y)), bottom = Math.max(...s.map((k, i) => k.y + k.w * [TOP, PANTS, SHOES][i].aspect));
  assert.ok(top >= fit.RULES.margin - 0.5 && bottom <= BOARD.h - fit.RULES.margin + 0.5, `${top}..${bottom}`);
  assert.ok(bottom - top > 0.85 * (BOARD.h - 2 * fit.RULES.margin), 'füllt die Höhe');
});
