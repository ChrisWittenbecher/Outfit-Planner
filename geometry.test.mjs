// Unit-Tests für js/geometry.js.  Start:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../js/geometry.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('normalizeAngle: Wertebereich, negative Werte, Müll', () => {
  assert.equal(g.normalizeAngle(0), 0);
  assert.equal(g.normalizeAngle(360), 0);
  assert.equal(g.normalizeAngle(-90), 270);
  assert.equal(g.normalizeAngle(725), 5);
  assert.equal(g.normalizeAngle(12.345), 12.35);
  assert.equal(g.normalizeAngle(-1e-20), 0);
  for (const bad of [NaN, Infinity, '45', null, undefined, {}]) assert.equal(g.normalizeAngle(bad), 0);
});

test('angleFromCenter: 0° oben, im Uhrzeigersinn', () => {
  assert.equal(g.angleFromCenter(100, 100, 100, 50), 0);
  assert.equal(g.angleFromCenter(100, 100, 150, 100), 90);
  assert.equal(g.angleFromCenter(100, 100, 100, 150), 180);
  assert.equal(g.angleFromCenter(100, 100, 50, 100), 270);
  near(g.angleFromCenter(0, 0, 10, -10), 45, 0.01);
  assert.equal(g.angleFromCenter(5, 5, 5, 5), null);
});

test('shortestDelta: kürzester Weg über 0°/360°', () => {
  assert.equal(g.shortestDelta(350, 10), 20);
  assert.equal(g.shortestDelta(10, 350), -20);
  assert.equal(g.shortestDelta(0, 180), 180);
  assert.equal(g.shortestDelta(90, 90), 0);
});

test('snapAngle: rastet auf Vielfache ein', () => {
  assert.equal(g.snapAngle(7), 0);
  assert.equal(g.snapAngle(8), 15);
  assert.equal(g.snapAngle(359), 0);
  assert.equal(g.snapAngle(100, 45), 90);
  assert.equal(g.snapAngle(33, 0), 33); // ungültige Schrittweite → unverändert
});

test('rotatedBounds: Rechteck 100×50', () => {
  const b0 = g.rotatedBounds(100, 50, 0); near(b0.w, 100); near(b0.h, 50);
  const b90 = g.rotatedBounds(100, 50, 90); near(b90.w, 50); near(b90.h, 100);
  const b45 = g.rotatedBounds(100, 50, 45); near(b45.w, (100 + 50) * Math.SQRT1_2); near(b45.h, b45.w);
});

test('clampCenter: ein Rest bleibt immer sichtbar', () => {
  const far = g.clampCenter(9999, -9999, 100, 100);
  near(far.x, g.BOARD.w - g.LIMITS.minVisible + 50);
  near(far.y, g.LIMITS.minVisible - 50);
  const inside = g.clampCenter(200, 300, 100, 100);
  assert.deepEqual(inside, { x: 200, y: 300 });
});

test('parseAngle / formatAngle / angleAria', () => {
  assert.equal(g.parseAngle('45'), 45);
  assert.equal(g.parseAngle(' 12,5° '), 12.5);
  assert.equal(g.parseAngle('-90'), 270);
  for (const bad of ['', 'abc', '1e3', '1.2.3', '45 Grad']) assert.equal(g.parseAngle(bad), null);
  assert.equal(g.formatAngle(45), '45°');
  assert.equal(g.formatAngle(12.5), '12,5°');
  assert.equal(g.angleAria(90), '90 Grad');
});

test('sanitizePiece: akzeptiert Gültiges, begrenzt Werte, verwirft Müll', () => {
  const ok = g.sanitizePiece({ id: 'a', x: 10, y: 20, w: 100, r: 400, evil: '<script>' });
  assert.deepEqual(ok, { id: 'a', x: 10, y: 20, w: 100, r: 40 });
  assert.equal(g.sanitizePiece({ id: 'a', x: 0, y: 0, w: 1 }).w, g.LIMITS.minW);
  assert.equal(g.sanitizePiece({ id: 'a', x: 0, y: 0, w: 99999 }).w, g.LIMITS.maxW);
  assert.equal(g.sanitizePiece({ id: 'a', x: 1e9, y: -1e9, w: 50 }).x, 2000);
  assert.equal(g.sanitizePiece({ id: 'a', x: 0, y: 0, w: 50 }).r, 0); // ältere Daten ohne Drehung
  assert.equal(g.sanitizePiece({ id: 'a', x: 0, y: 0, w: 50, z: 3 }).z, 3);
  for (const bad of [null, 5, 'x', [], {}, { id: '', x: 0, y: 0, w: 50 }, { id: 'a', x: '1', y: 0, w: 50 },
    { id: 'a', x: NaN, y: 0, w: 50 }, { id: 'a', x: 0, y: Infinity, w: 50 }, { id: 'x'.repeat(65), x: 0, y: 0, w: 50 }]) {
    assert.equal(g.sanitizePiece(bad), null);
  }
});

test('sanitizePieces: filtert Listen, ignoriert Nicht-Listen', () => {
  const list = g.sanitizePieces([{ id: 'a', x: 0, y: 0, w: 50 }, null, { id: 'b' }, { id: 'c', x: 1, y: 2, w: 60, r: 90 }]);
  assert.deepEqual(list.map(p => p.id), ['a', 'c']);
  assert.deepEqual(g.sanitizePieces('nope'), []);
  assert.deepEqual(g.sanitizePieces(undefined), []);
});
