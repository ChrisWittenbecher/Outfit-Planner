import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DAYS, capsule, packText, targets } from '../../js/packing.js';
import { NEUTRAL } from '../../js/stylist.js';

const mk = (id, cat, color, extra = {}) => ({ id, name: id, cat, color, tags: [], ...extra });
const closet = [
  ...['Weiß', 'Schwarz', 'Rot', 'Blau', 'Grün', 'Gelb', 'Rosa', 'Lila', 'Grau'].map((c, i) => mk('t' + i, 'Oberteil', c)),
  mk('h1', 'Hose/Rock', 'Blau'), mk('h2', 'Hose/Rock', 'Schwarz'), mk('h3', 'Hose/Rock', 'Beige'),
  mk('j1', 'Jacke', 'Beige'), mk('j2', 'Jacke', 'Rot'),
  mk('s1', 'Schuhe', 'Weiß'), mk('s2', 'Schuhe', 'Schwarz'), mk('s3', 'Schuhe', 'Rot'),
  mk('a1', 'Accessoire', 'Grau'), mk('a2', 'Accessoire', 'Rot'),
];
const T = '2026-11-08';
const names = r => r.groups.flatMap(g => g.items);

test('Mengen wachsen mit den Tagen', () => {
  assert.deepEqual(targets(1, 'mild'), { 'Jacke': 1, 'Oberteil': 2, 'Hose/Rock': 1, 'Schuhe': 1, 'Accessoire': 1 });
  assert.equal(targets(7, 'mild')['Oberteil'], 5);
  assert.equal(targets(30, 'mild')['Oberteil'], 8, 'gedeckelt');
  assert.equal(targets(7, 'mild')['Hose/Rock'], 2);
  assert.equal(targets(14, 'mild')['Hose/Rock'], 3);
  assert.equal(targets(7, 'warm')['Jacke'], 0);
  assert.equal(targets(7, 'kalt')['Accessoire'], 2);
});

test('Packliste hat genau so viele Teile wie gewünscht, wenn genug da sind', () => {
  const r = capsule(closet, [], { days: 7, weather: 'kalt', today: T });
  assert.equal(r.days, 7);
  assert.deepEqual(r.short, []);
  const by = Object.fromEntries(r.groups.map(g => [g.cat, g.items.length]));
  assert.deepEqual(by, { 'Jacke': 1, 'Oberteil': 5, 'Hose/Rock': 2, 'Schuhe': 2, 'Accessoire': 2 });
  assert.equal(new Set(names(r).map(i => i.id)).size, names(r).length, 'kein Teil doppelt');
});

test('Bei Wärme keine Jacke, bei einem Tag nur das Nötigste', () => {
  const r = capsule(closet, [], { days: 1, weather: 'warm', today: T });
  assert.ok(!r.groups.some(g => g.cat === 'Jacke'));
  assert.equal(r.groups.find(g => g.cat === 'Schuhe').items.length, 1);
});

test('Möglichst höchstens zwei Farbakzente: alles lässt sich kombinieren', () => {
  for (const days of [3, 7]) for (const weather of ['kalt', 'mild', 'warm', 'regen']) {
    const accents = new Set(names(capsule(closet, [], { days, weather, today: T })).map(i => i.color).filter(c => c && !NEUTRAL.has(c)));
    assert.ok(accents.size <= 2, `${days} Tage, ${weather}: ${[...accents]}`);
  }
});

test('Reicht das Neutrale nicht, wird trotzdem aufgefüllt (lieber vollständig als streng)', () => {
  const r = capsule(closet, [], { days: 14, weather: 'mild', today: T });
  assert.equal(r.groups.find(g => g.cat === 'Oberteil').items.length, 8);
  assert.deepEqual(r.short, []);
});

test('Neutrale Teile gehen vor', () => {
  const r = capsule(closet, [], { days: 3, weather: 'mild', today: T });
  const shoes = r.groups.find(g => g.cat === 'Schuhe').items;
  assert.equal(shoes[0].color === 'Rot', false);
  assert.ok(NEUTRAL.has(r.groups.find(g => g.cat === 'Jacke').items[0].color));
});

test('Kombinationen: Oberteile × Hosen × Jacken', () => {
  const r = capsule(closet, [], { days: 7, weather: 'kalt', today: T });
  assert.equal(r.combos, 5 * 2 * 1);
  assert.equal(capsule(closet, [], { days: 7, weather: 'warm', today: T }).combos, 5 * 2);
  assert.equal(capsule([], [], { days: 7, weather: 'warm', today: T }).combos, 0);
});

test('Zu wenige Teile werden benannt', () => {
  const small = closet.filter(i => i.cat !== 'Schuhe' && !(i.cat === 'Oberteil' && i.id !== 't0'));
  const r = capsule(small, [], { days: 7, weather: 'mild', today: T });
  const shoes = r.short.find(s => s.cat === 'Schuhe');
  assert.deepEqual(shoes, { cat: 'Schuhe', want: 2, have: 0 });
  assert.deepEqual(r.short.find(s => s.cat === 'Oberteil'), { cat: 'Oberteil', want: 5, have: 1 });
});

test('Wunschlisten-Teile werden nicht eingepackt', () => {
  const r = capsule([...closet, mk('w', 'Schuhe', 'Weiß', { status: 'wish', tags: ['Winter'] })], [], { days: 7, weather: 'kalt', today: T });
  assert.ok(!names(r).some(i => i.id === 'w'));
});

test('Oft Getragenes ist bewährt und gewinnt bei Gleichstand', () => {
  const items = [mk('a', 'Oberteil', 'Weiß'), mk('b', 'Oberteil', 'Weiß'), mk('h', 'Hose/Rock', 'Schwarz'), mk('s', 'Schuhe', 'Schwarz')];
  const wears = Array.from({ length: 5 }, (_, i) => ({ d: `2026-10-0${i + 1}`, items: ['b'] }));
  const r = capsule(items, wears, { days: 2, weather: 'warm', today: T });
  assert.equal(r.groups.find(g => g.cat === 'Oberteil').items[0].id, 'b');
});

test('Tage werden begrenzt und gerundet; Unsinn wird zu einem Tag', () => {
  assert.equal(capsule(closet, [], { days: 99, weather: 'mild', today: T }).days, MAX_DAYS);
  assert.equal(capsule(closet, [], { days: 0, weather: 'mild', today: T }).days, 1);
  assert.equal(capsule(closet, [], { days: 2.9, weather: 'mild', today: T }).days, 2);
  assert.equal(capsule(closet, [], { days: NaN, weather: 'mild', today: T }).days, 1);
});

test('Ergebnis ist bei gleicher Eingabe immer gleich', () => {
  const a = capsule(closet, [], { days: 5, weather: 'regen', today: T });
  assert.deepEqual(a, capsule([...closet].reverse(), [], { days: 5, weather: 'regen', today: T }));
});

test('Text zum Kopieren', () => {
  const r = capsule(closet, [], { days: 1, weather: 'warm', today: T });
  const text = packText(r, 'warm');
  const lines = text.split('\n');
  assert.equal(lines[0], 'Packliste für 1 Tag (Warm)');
  assert.ok(lines.includes('Oberteil') && lines.includes('Schuhe'));
  assert.ok(lines.filter(l => l.startsWith('☐ ')).length === names(r).length);
  assert.match(packText({ ...r, days: 3 }, 'kalt'), /^Packliste für 3 Tage \(Kalt\)/);
});
