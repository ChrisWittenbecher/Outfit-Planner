import test from 'node:test';
import assert from 'node:assert/strict';
import { cardSub, cardTitle, seedFor } from '../../js/suggestcard.js';
import { suggest } from '../../js/stylist.js';

const P = (cat, color) => ({ cat, color });

test('cardTitle: Wetter, Farben und Jacke bestimmen den Titel', () => {
  assert.equal(cardTitle({ pieces: [P('Oberteil', 'Schwarz')], reasons: [] }, 'regen'), 'Für den Regen');
  assert.equal(cardTitle({ pieces: [P('Oberteil', 'Schwarz')], reasons: [] }, 'kalt'), 'Warm eingepackt');
  assert.equal(cardTitle({ pieces: [], reasons: ['„Mantel“ lange nicht getragen'] }, 'mild'), 'Wiederentdeckt');
  assert.equal(cardTitle({ pieces: [], reasons: ['„Hemd“ noch nie getragen'] }, 'warm'), 'Wiederentdeckt');
});

test('cardTitle: drei Karten heißen nie gleich, auch wenn alles gleich aussieht', () => {
  const s = { pieces: [P('Oberteil', 'Schwarz'), P('Hose/Rock', 'Weiß')], reasons: [] };
  const taken = [];
  for (let i = 0; i < 6; i++) { const t = cardTitle(s, 'mild', taken); assert.ok(!taken.includes(t), t); taken.push(t); }
  assert.equal(new Set(taken).size, 6);
  assert.match(taken[5], /^Vorschlag \d+$/);
});

test('cardTitle: Farbakzent, bunt, Jacke', () => {
  const t = (pieces, taken = ['Ruhiger Alltag']) => cardTitle({ pieces, reasons: [] }, 'mild', taken);
  assert.equal(t([P('Oberteil', 'Rot'), P('Hose/Rock', 'Schwarz')]), 'Mit Farbakzent');
  assert.equal(t([P('Oberteil', 'Rot'), P('Hose/Rock', 'Orange')]), 'Bunt gemischt');
  assert.equal(t([P('Oberteil', 'Schwarz')]), 'Ruhig und klar');
  assert.equal(t([P('Jacke', 'Rot'), P('Oberteil', 'Rot')], ['Ruhiger Alltag', 'Mit Farbakzent']), 'Mit Jacke');
});

test('cardTitle: schräge Eingaben bringen nichts zum Absturz', () => {
  assert.equal(typeof cardTitle({ pieces: [{}], reasons: [] }, /** @type {any} */ ('?')), 'string');
  assert.equal(typeof cardTitle({ pieces: [], reasons: [] }, 'kalt', ['Warm eingepackt']), 'string');
});

test('cardSub: Einzahl, Mehrzahl, Wetter', () => {
  assert.equal(cardSub(1, 'regen'), '1 Teil · Regen');
  assert.equal(cardSub(4, 'kalt'), '4 Teile · Kalt');
});

test('seedFor: stabil pro Tag und Runde, anders an anderen Tagen und in anderen Runden', () => {
  assert.equal(seedFor('2026-11-13', 0), seedFor('2026-11-13', 0));
  assert.notEqual(seedFor('2026-11-13', 0), seedFor('2026-11-14', 0));
  assert.notEqual(seedFor('2026-11-13', 0), seedFor('2026-11-13', 1));
  assert.ok(Number.isInteger(seedFor('', -3)) && seedFor('', -3) >= 0);
});

const mk = (id, cat, color) => ({ id, name: id, cat, color, tags: [] });
const closet = [
  mk('t1', 'Oberteil', 'Weiß'), mk('t2', 'Oberteil', 'Schwarz'), mk('t3', 'Oberteil', 'Grau'), mk('t4', 'Oberteil', 'Beige'),
  mk('h1', 'Hose/Rock', 'Blau'), mk('h2', 'Hose/Rock', 'Schwarz'), mk('h3', 'Hose/Rock', 'Grau'),
  mk('s1', 'Schuhe', 'Weiß'), mk('s2', 'Schuhe', 'Schwarz'), mk('s3', 'Schuhe', 'Braun'),
];

test('suggest: avoid lässt gerade gezeigte Teile zurückstehen', () => {
  let moved = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const a = suggest(closet, [], { weather: 'warm', today: '2026-11-13', seed, count: 3 });
    const shown = [...new Set(a.suggestions.flatMap(s => s.ids))];
    const b = suggest(closet, [], { weather: 'warm', today: '2026-11-13', seed, count: 3, avoid: shown });
    const again = new Set(b.suggestions.flatMap(s => s.ids).filter(id => shown.includes(id)));
    const plain = new Set(suggest(closet, [], { weather: 'warm', today: '2026-11-13', seed, count: 3 }).suggestions.flatMap(s => s.ids).filter(id => shown.includes(id)));
    assert.ok(again.size <= plain.size, 'mit avoid kommen nicht mehr alte Teile vor als ohne');
    if (again.size < plain.size) moved++;
  }
  assert.ok(moved >= 10, 'in den meisten Fällen wirkt avoid spürbar: ' + moved);
});

test('suggest: avoid mit Unsinn wird ignoriert', () => {
  const base = suggest(closet, [], { weather: 'mild', today: '2026-11-13', seed: 3 });
  for (const bad of [null, 'x', 5, {}, [null, 5]]) {
    const r = suggest(closet, [], { weather: 'mild', today: '2026-11-13', seed: 3, avoid: /** @type {any} */ (bad) });
    assert.deepEqual(r.suggestions.map(s => s.ids), base.suggestions.map(s => s.ids));
  }
});
