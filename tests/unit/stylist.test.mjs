import test from 'node:test';
import assert from 'node:assert/strict';
import { colorHarmony, rng, suggest, weatherFit } from '../../js/stylist.js';

const mk = (id, cat, color, extra = {}) => ({ id, name: id, cat, color, tags: [], ...extra });
const closet = [
  mk('t1', 'Oberteil', 'Weiß'), mk('t2', 'Oberteil', 'Schwarz'), mk('t3', 'Oberteil', 'Rot'), mk('t4', 'Oberteil', 'Grün'),
  mk('h1', 'Hose/Rock', 'Blau'), mk('h2', 'Hose/Rock', 'Schwarz'),
  mk('j1', 'Jacke', 'Beige'), mk('j2', 'Jacke', 'Grau'),
  mk('s1', 'Schuhe', 'Weiß'), mk('s2', 'Schuhe', 'Schwarz'),
  mk('a1', 'Accessoire', 'Rot'),
];
const TODAY = '2026-11-08';
const cats = (s, items = closet) => s.ids.map(id => items.find(i => i.id === id).cat);

test('rng ist bei gleichem Startwert gleich und streut sonst', () => {
  const a = rng(5), b = rng(5), c = rng(6);
  const xs = [a(), a(), a()], ys = [b(), b(), b()];
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  assert.ok(xs.every(x => x >= 0 && x < 1));
});

test('colorHarmony: ruhig > ein Akzent > verwandte Akzente > Farbsalat', () => {
  const calm = colorHarmony(['Schwarz', 'Weiß', undefined]).score;
  const one = colorHarmony(['Schwarz', 'Rot']).score;
  const kin = colorHarmony(['Rot', 'Orange']).score;
  const two = colorHarmony(['Rot', 'Grün']).score;
  const three = colorHarmony(['Rot', 'Grün', 'Lila']).score;
  assert.ok(calm > one && one > kin && kin > two && two > three, [calm, one, kin, two, three].join(' '));
  assert.match(colorHarmony(['Schwarz']).note, /Ruhige/);
  assert.match(colorHarmony(['Rot']).note, /Rot/);
  assert.equal(colorHarmony(['Rot', 'Grün']).note, '');
});

test('weatherFit liest Tags ohne Rücksicht auf Groß- und Kleinschreibung', () => {
  assert.equal(weatherFit(mk('x', 'Oberteil', 'Weiß', { tags: ['Winter'] }), 'kalt').score, 2);
  assert.equal(weatherFit(mk('x', 'Oberteil', 'Weiß', { tags: ['Winter'] }), 'warm').score, -3);
  assert.equal(weatherFit(mk('x', 'Oberteil', 'Weiß', { tags: ['SOMMER'] }), 'warm').score, 2);
  assert.equal(weatherFit(mk('x', 'Jacke', 'Weiß', { tags: ['wasserdicht'] }), 'regen').score, 3);
  assert.equal(weatherFit(mk('x', 'Jacke', 'Weiß', { tags: [] }), 'regen').score, 0);
  assert.equal(weatherFit(mk('x', 'Jacke', 'Weiß', {}), 'mild').score, 0);
  assert.equal(weatherFit(mk('x', 'Jacke', 'Weiß', { tags: [5, null, 'Winter'] }), 'kalt').score, 2, 'Nicht-Texte stören nicht');
});

test('Die Begründung nennt das Tag so, wie es geschrieben wurde', () => {
  const items = [mk('w', 'Jacke', 'Grau', { tags: ['Winter'] }), mk('t', 'Oberteil', 'Weiß'), mk('h', 'Hose/Rock', 'Schwarz'), mk('s', 'Schuhe', 'Schwarz')];
  assert.match(suggest(items, [], { weather: 'kalt', today: TODAY, count: 1 }).suggestions[0].reasons.join(' | '), /„w“ ist mit „Winter“ markiert/);
});

test('Kälte und Regen verlangen eine Jacke, bei Wärme gibt es keine', () => {
  for (const w of ['kalt', 'regen']) {
    const { suggestions, missing } = suggest(closet, [], { weather: w, today: TODAY, seed: 3 });
    assert.equal(suggestions.length, 3);
    assert.deepEqual(missing, []);
    for (const s of suggestions) for (const c of ['Jacke', 'Oberteil', 'Hose/Rock', 'Schuhe']) assert.ok(cats(s).includes(c), w + ' braucht ' + c);
  }
  const warm = suggest(closet, [], { weather: 'warm', today: TODAY, seed: 3 }).suggestions;
  for (const s of warm) { assert.ok(!cats(s).includes('Jacke')); assert.ok(!cats(s).includes('Accessoire')); }
});

test('Bei mildem Wetter ist die Jacke Zugabe, nicht Pflicht', () => {
  const noJacket = closet.filter(i => i.cat !== 'Jacke');
  const r = suggest(noJacket, [], { weather: 'mild', today: TODAY });
  assert.equal(r.suggestions.length, 3);
  assert.deepEqual(r.missing, []);
});

test('Fehlende Pflichtkategorien werden gemeldet, der Rest wird trotzdem vorgeschlagen', () => {
  const r = suggest(closet.filter(i => i.cat !== 'Schuhe'), [], { weather: 'warm', today: TODAY });
  assert.deepEqual(r.missing, ['Schuhe']);
  assert.ok(r.suggestions.length > 0);
  assert.ok(r.suggestions.every(s => !cats(s).includes('Schuhe')));
});

test('Ohne Teile gibt es nichts vorzuschlagen', () => {
  assert.deepEqual(suggest([], [], { weather: 'mild', today: TODAY }), { suggestions: [], missing: ['Oberteil', 'Hose/Rock', 'Schuhe'] });
});

test('Wunschlisten-Teile kommen nicht vor', () => {
  const wish = [...closet, mk('wish', 'Oberteil', 'Weiß', { status: 'wish', tags: ['Winter'] })];
  for (let seed = 1; seed < 20; seed++) for (const s of suggest(wish, [], { weather: 'kalt', today: TODAY, seed }).suggestions) assert.ok(!s.ids.includes('wish'));
});

test('Gleicher Startwert, gleiche Vorschläge; anderer Startwert, andere Auswahl', () => {
  const a = suggest(closet, [], { weather: 'mild', today: TODAY, seed: 7 });
  const b = suggest(closet, [], { weather: 'mild', today: TODAY, seed: 7 });
  assert.deepEqual(a, b);
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) seen.add(suggest(closet, [], { weather: 'mild', today: TODAY, seed }).suggestions[0].ids.join());
  assert.ok(seen.size > 1, 'die Auswahl wechselt mit dem Startwert');
});

test('Die drei Vorschläge unterscheiden sich spürbar', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const s = suggest(closet, [], { weather: 'kalt', today: TODAY, seed }).suggestions;
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const diff = s[i].ids.filter(id => !s[j].ids.includes(id)).length;
      assert.ok(diff >= 1, 'identische Vorschläge bei seed ' + seed);
    }
  }
});

test('Lange nicht Getragenes wird bevorzugt, gerade Getragenes nicht', () => {
  const items = [mk('neu', 'Oberteil', 'Weiß'), mk('alt', 'Oberteil', 'Weiß'), mk('h', 'Hose/Rock', 'Schwarz'), mk('s', 'Schuhe', 'Schwarz')];
  const wears = [{ d: '2026-11-07', items: ['alt', 'h', 's'] }, { d: '2026-06-01', items: ['neu'] }];
  let neu = 0;
  for (let seed = 1; seed <= 30; seed++) if (suggest(items, wears, { weather: 'warm', today: TODAY, seed, count: 1 }).suggestions[0].ids.includes('neu')) neu++;
  assert.ok(neu >= 28, 'das lange nicht getragene Teil gewinnt fast immer (' + neu + ' von 30)');
  const why = suggest(items, wears, { weather: 'warm', today: TODAY, seed: 1, count: 1 }).suggestions[0].reasons.join(' | ');
  assert.match(why, /„neu“ lange nicht getragen/);
});

test('Teile, die noch nie getragen wurden, werden als solche benannt', () => {
  const items = [mk('a', 'Oberteil', 'Weiß'), mk('h', 'Hose/Rock', 'Schwarz'), mk('s', 'Schuhe', 'Schwarz')];
  const why = suggest(items, [], { weather: 'warm', today: TODAY, count: 1 }).suggestions[0].reasons.join(' | ');
  assert.match(why, /noch nie getragen/);
});

test('Tags beeinflussen die Wahl: im Winter gewinnt das Winter-Teil', () => {
  const items = [mk('w', 'Jacke', 'Grau', { tags: ['Winter'] }), mk('s', 'Jacke', 'Grau', { tags: ['Sommer'] }), mk('t', 'Oberteil', 'Weiß'), mk('h', 'Hose/Rock', 'Schwarz'), mk('sh', 'Schuhe', 'Schwarz')];
  for (let seed = 1; seed <= 20; seed++) assert.ok(suggest(items, [], { weather: 'kalt', today: TODAY, seed, count: 1 }).suggestions[0].ids.includes('w'));
});

test('Regen: die wasserdichte Jacke gewinnt', () => {
  const items = [mk('dicht', 'Jacke', 'Grau', { tags: ['wasserdicht'] }), mk('plain', 'Jacke', 'Grau'), mk('t', 'Oberteil', 'Weiß'), mk('h', 'Hose/Rock', 'Schwarz'), mk('s', 'Schuhe', 'Schwarz')];
  for (let seed = 1; seed <= 20; seed++) assert.ok(suggest(items, [], { weather: 'regen', today: TODAY, seed, count: 1 }).suggestions[0].ids.includes('dicht'));
});

test('Farben: bei sonst gleichen Teilen gewinnt das ruhigere Outfit', () => {
  const items = [mk('rot', 'Oberteil', 'Rot'), mk('weiss', 'Oberteil', 'Weiß'), mk('h', 'Hose/Rock', 'Grün'), mk('s', 'Schuhe', 'Lila')];
  const best = suggest(items, [], { weather: 'warm', today: TODAY, count: 1 }).suggestions[0];
  assert.ok(best.ids.includes('weiss') && !best.ids.includes('rot'));
});

test('Reihenfolge der Teile: Jacke, Oberteil, Hose, Schuhe, Accessoire', () => {
  const s = suggest(closet, [], { weather: 'kalt', today: TODAY, seed: 2 }).suggestions[0];
  const order = ['Jacke', 'Oberteil', 'Hose/Rock', 'Schuhe', 'Accessoire'];
  const idx = cats(s).map(c => order.indexOf(c));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
});

test('Begründungen sind kurz, höchstens drei, und nie leer', () => {
  for (const w of ['kalt', 'mild', 'warm', 'regen']) for (let seed = 1; seed <= 5; seed++) for (const s of suggest(closet, [], { weather: w, today: TODAY, seed }).suggestions) {
    assert.ok(s.reasons.length <= 3);
    assert.ok(s.reasons.every(r => typeof r === 'string' && r.length > 0));
  }
});

test('Schräge Eingaben bringen nichts zum Absturz', () => {
  const odd = [mk('a', 'Oberteil', undefined, { tags: 'kein Array' }), mk('h', 'Hose/Rock', 5), mk('s', 'Schuhe', null, { tags: null }), null, { id: 'x' }];
  assert.doesNotThrow(() => suggest(odd.filter(Boolean), [{ d: 'kaputt', items: [] }], { weather: 'kalt', today: TODAY }));
  assert.doesNotThrow(() => suggest(closet, [], { weather: 'unbekannt', today: TODAY }));
});
