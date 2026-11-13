import test from 'node:test';
import assert from 'node:assert/strict';
import { OCCASIONS, occasionFit, suggest } from '../../js/stylist.js';
import { cardTitle } from '../../js/suggestcard.js';

const mk = (id, cat, color, extra = {}) => ({ id, name: id, cat, color, tags: [], ...extra });
const TODAY = '2026-11-13';
const closet = [
  mk('t1', 'Oberteil', 'Weiß'), mk('t2', 'Oberteil', 'Schwarz'), mk('t3', 'Oberteil', 'Grau'), mk('t4', 'Oberteil', 'Beige'),
  mk('h1', 'Hose/Rock', 'Blau'), mk('h2', 'Hose/Rock', 'Schwarz'), mk('h3', 'Hose/Rock', 'Grau'),
  mk('s1', 'Schuhe', 'Weiß'), mk('s2', 'Schuhe', 'Schwarz'), mk('s3', 'Schuhe', 'Braun'),
];
const run = (items, o = {}) => suggest(items, [], { weather: 'warm', today: TODAY, seed: 4, count: 3, ...o });
const ids = r => new Set(r.suggestions.flatMap(s => s.ids));

test('OCCASIONS: fünf Anlässe wie in der Vorschau', () => {
  assert.deepEqual([...OCCASIONS], ['Büro', 'Alltag', 'Abend', 'Sport', 'Reise']);
});

test('occasionFit: Tags ohne Rücksicht auf Groß- und Kleinschreibung, Sport nur beim Sport', () => {
  assert.deepEqual(occasionFit(mk('a', 'Oberteil', 'Weiß', { tags: ['BÜRO'] }), 'Büro'), { score: 2, tag: 'BÜRO' });
  assert.deepEqual(occasionFit(mk('a', 'Oberteil', 'Weiß', { tags: ['buero'] }), 'Büro'), { score: 2, tag: 'buero' });
  assert.deepEqual(occasionFit(mk('a', 'Oberteil', 'Weiß', { tags: ['Sport'] }), 'Sport'), { score: 3, tag: 'Sport' });
  assert.equal(occasionFit(mk('a', 'Oberteil', 'Weiß', { tags: ['Sport'] }), 'Büro').score, -3);
  assert.equal(occasionFit(mk('a', 'Oberteil', 'Weiß', { tags: ['Sport'] }), undefined).score, -3, 'auch ohne Anlass gehört Sportkleidung nicht in die Tagesvorschläge');
  assert.deepEqual(occasionFit(mk('a', 'Oberteil', 'Weiß'), 'Abend'), { score: 0, tag: '' });
  assert.deepEqual(occasionFit(mk('a', 'Oberteil', 'Weiß', { tags: ['Abend'] }), 'Büro'), { score: 0, tag: '' });
  assert.deepEqual(occasionFit(mk('a', 'Oberteil', 'Weiß', { tags: ['Reise'] }), /** @type {any} */ ('Quatsch')), { score: 0, tag: '' });
  assert.equal(occasionFit(/** @type {any} */ ({ id: 'x', tags: 'Sport' }), 'Büro').score, 0, 'Tags, die keine Liste sind, werden ignoriert');
  assert.equal(occasionFit(/** @type {any} */ ({ id: 'x', tags: [5, null, {}] }), 'Büro').score, 0);
});

test('Anlass: Teile mit passendem Tag werden bevorzugt', () => {
  const items = closet.map(i => (i.id === 't3' ? { ...i, tags: ['Büro'] } : i.id === 'h3' ? { ...i, tags: ['Büro'] } : i.id === 's3' ? { ...i, tags: ['Büro'] } : i));
  let hits = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = run(items, { seed, occasion: 'Büro' });
    assert.equal(r.tagged, 3);
    if (r.suggestions[0].ids.filter(id => ['t3', 'h3', 's3'].includes(id)).length >= 2) hits++;
  }
  assert.ok(hits >= 17, 'das beste Outfit enthält meist die markierten Teile: ' + hits + ' von 20');
});

test('Anlass: die Begründung nennt das Tag', () => {
  const items = closet.map(i => (i.id === 't3' ? { ...i, name: 'Graues Hemd', tags: ['Büro'] } : i));
  let named = 0;
  for (let seed = 1; seed <= 10; seed++) if (run(items, { seed, occasion: 'Büro' }).suggestions.some(s => s.reasons.some(r => r.includes('„Graues Hemd“ ist mit „Büro“ markiert')))) named++;
  assert.ok(named >= 8, String(named));
});

test('Sport-Teile kommen nur beim Anlass Sport vor', () => {
  const items = [...closet, mk('sp1', 'Oberteil', 'Rot', { tags: ['Sport'] }), mk('sp2', 'Hose/Rock', 'Schwarz', { tags: ['sport'] }), mk('sp3', 'Schuhe', 'Weiß', { tags: ['SPORT'] })];
  for (let seed = 1; seed <= 20; seed++) {
    for (const occasion of [undefined, 'Büro', 'Alltag', 'Abend', 'Reise']) {
      const used = ids(run(items, { seed, occasion }));
      assert.ok(!['sp1', 'sp2', 'sp3'].some(id => used.has(id)), 'Sport-Teil bei ' + occasion + ' (Startwert ' + seed + ')');
    }
  }
  const sport = run(items, { occasion: 'Sport', seed: 2 });
  assert.equal(sport.tagged, 3);
  assert.ok(ids(sport).has('sp1') && ids(sport).has('sp2') && ids(sport).has('sp3'), 'beim Sport sind es die Sport-Teile');
});

test('Anlass ohne passende Tags: gleiche Auswahl wie ohne Anlass, tagged ist 0', () => {
  const a = run(closet, { occasion: 'Reise' }), b = run(closet);
  assert.equal(a.tagged, 0);
  assert.deepEqual(a.suggestions.map(s => s.ids), b.suggestions.map(s => s.ids));
});

test('preferRare aus: lange Nichtgetragenes bekommt keinen Vorsprung mehr', () => {
  const wears = [{ d: '2026-11-12', items: ['t1', 'h1', 's1'] }];
  let withRare = 0, withoutRare = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const a = suggest(closet, wears, { weather: 'warm', today: TODAY, seed, count: 1 });
    const b = suggest(closet, wears, { weather: 'warm', today: TODAY, seed, count: 1, preferRare: false });
    if (a.suggestions[0].reasons.some(r => /nie getragen|lange nicht/.test(r))) withRare++;
    if (b.suggestions[0].reasons.some(r => /nie getragen|lange nicht/.test(r))) withoutRare++;
  }
  assert.ok(withRare > 15, 'mit Vorrang für Seltenes steht es in der Begründung: ' + withRare);
  assert.equal(withoutRare, 0, 'ohne den Vorrang wird nichts als „lange nicht getragen“ hervorgehoben');
});

test('preferRare aus: gerade Getragenes bleibt trotzdem zurückgestellt', () => {
  const wears = [{ d: '2026-11-13', items: ['t1', 't2', 't3', 't4'] }];
  let fresh = 0;
  for (let seed = 1; seed <= 20; seed++) if (suggest(closet, wears, { weather: 'warm', today: TODAY, seed, count: 1, preferRare: false }).suggestions[0].ids.some(id => id.startsWith('t'))) fresh++;
  assert.equal(fresh, 20, 'es gibt nur Oberteile, die heute getragen wurden: eines muss dabei sein');
});

test('Wunschliste: standardmäßig draußen, mit wishlist erlaubt, nie als „lange nicht getragen“ gelobt', () => {
  const items = [...closet, mk('w1', 'Oberteil', 'Rot', { status: 'wish', name: 'Wunschhemd' }), mk('w2', 'Hose/Rock', 'Blau', { status: 'wish', name: 'Wunschhose' }), mk('w3', 'Schuhe', 'Weiß', { status: 'wish', name: 'Wunschschuh' })];
  for (let seed = 1; seed <= 10; seed++) assert.ok(![...ids(suggest(items, [{ d: '2026-11-12', items: closet.map(i => i.id) }], { weather: 'warm', today: TODAY, seed, count: 3 }))].some(id => id.startsWith('w')));
  const worn = [{ d: '2026-11-12', items: closet.map(i => i.id) }];
  let seen = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = suggest(items, worn, { weather: 'warm', today: TODAY, seed, count: 3, wishlist: true });
    if ([...ids(r)].some(id => id.startsWith('w'))) seen++;
    for (const s of r.suggestions) for (const reason of s.reasons) assert.ok(!/„Wunsch\w+“ (noch nie|lange nicht)/.test(reason), reason);
  }
  assert.ok(seen > 5, 'Wunschteile erscheinen, wenn sie erlaubt sind: ' + seen);
});

test('cardTitle: Anlass steht im Titel der ersten passenden Karte', () => {
  const s = { pieces: [{ cat: 'Oberteil', color: 'Schwarz' }], reasons: [] };
  assert.equal(cardTitle(s, 'regen', [], 'Büro'), 'Büro, trocken');
  assert.equal(cardTitle(s, 'kalt', [], 'Abend'), 'Abend, warm');
  assert.equal(cardTitle(s, 'warm', [], 'Reise'), 'Reise, luftig');
  assert.equal(cardTitle(s, 'mild', [], 'Sport'), 'Sport, mild');
  assert.notEqual(cardTitle(s, 'regen', ['Büro, trocken'], 'Büro'), 'Büro, trocken', 'zweite Karte mit gleichem Anlass heißt anders');
  assert.equal(cardTitle(s, 'regen'), 'Für den Regen', 'ohne Anlass wie bisher');
});
