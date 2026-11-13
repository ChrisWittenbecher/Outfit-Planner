import test from 'node:test';
import assert from 'node:assert/strict';
import { GRACE_DAYS, IDLE_DAYS, PERIODS, addedDay, idleList, periodKey, periodStart, summarize, wearsIn } from '../../js/stats.js';
import { addDays } from '../../js/wear.js';

const TODAY = '2026-11-13';
const w = (d, ...items) => ({ id: 'w' + d + items.join(''), d, n: 'x', items });
const it = (id, over = {}) => ({ id, name: id, cat: 'Oberteil', status: 'own', ...over });
/** Kennung wie newId(): „i“ + Zeit (Basis 36, 8 Zeichen) + 5 Zeichen Zufall */
const idAt = day => 'i' + new Date(day + 'T12:00:00Z').getTime().toString(36) + 'abcde';

test('Zeiträume: 90 Tage und Jahr zählen einschließlich heute, Gesamt hat keinen Start', () => {
  assert.equal(periodStart(TODAY, '90'), '2026-08-16');
  assert.equal(periodStart('2026-11-13', 'year'), '2025-11-14');
  assert.equal(periodStart(TODAY, 'all'), null);
  assert.equal(periodStart(TODAY, 'unsinn'), '2026-08-16', 'unbekannter Zeitraum fällt auf 90 Tage');
  assert.deepEqual(PERIODS.map(p => p.key), ['90', 'year', 'all']);
  assert.equal(periodKey('year'), 'year'); assert.equal(periodKey(null), '90'); assert.equal(periodKey({}), '90');
});

test('Tagesgrenzen: erster und letzter Tag des Zeitraums zählen, Zukunft und kaputte Tage nicht', () => {
  const wears = [w('2026-08-15', 'a'), w('2026-08-16', 'b'), w(TODAY, 'c'), w('2026-11-14', 'd'), { id: 'x', d: 'kaputt', n: '', items: ['e'] }];
  assert.deepEqual(wearsIn(wears, TODAY, '90').map(x => x.d), ['2026-08-16', TODAY]);
  assert.deepEqual(wearsIn(wears, TODAY, 'all').map(x => x.d), ['2026-08-15', '2026-08-16', TODAY]);
});

test('Jahreswechsel und Schaltjahr', () => {
  assert.equal(periodStart('2028-03-01', '90'), '2027-12-03');
  assert.equal(periodStart('2028-02-29', 'year'), '2027-03-02');
  assert.equal(periodStart('2027-01-01', '90'), '2026-10-04');
});

test('summarize: getragene Teile, Rangliste, häufigste Farbe', () => {
  const items = [it('a', { color: 'Blau', price: 90, cur: 'EUR' }), it('b', { color: 'Schwarz', price: 60 }), it('c', { color: 'Blau' }), it('d'), it('w', { status: 'wish', color: 'Rot' })];
  const wears = [w('2026-11-01', 'a', 'b'), w('2026-11-05', 'a', 'c'), w('2026-11-09', 'a'), w('2026-11-10', 'w')];
  const s = summarize(items, wears, TODAY, '90');
  assert.equal(s.owned, 4); assert.equal(s.worn, 3);
  assert.deepEqual(s.top.map(r => [r.item.id, r.count]), [['a', 3], ['c', 1], ['b', 1]], 'gleiche Anzahl: der zuletzt getragene zuerst');
  assert.equal(s.total, 5);
  assert.deepEqual(s.color, { name: 'Blau', count: 4 });
  assert.deepEqual(s.costs, [{ cur: 'EUR', perWear: (90 + 60) / (3 + 1), items: 2 }]);
});

test('Gleichstand in der Rangliste: der zuletzt getragene zuerst, danach nach Kennung', () => {
  const items = [it('a'), it('b'), it('c')];
  const wears = [w('2026-11-01', 'a'), w('2026-11-05', 'b'), w('2026-11-05', 'c')];
  assert.deepEqual(summarize(items, wears, TODAY, '90').top.map(r => r.item.id), ['b', 'c', 'a']);
});

test('Wunschlisten-Teile zählen nirgends mit', () => {
  const items = [it('w', { status: 'wish', color: 'Rot', price: 10 })];
  const s = summarize(items, [w('2026-11-10', 'w')], TODAY, 'all');
  assert.deepEqual([s.owned, s.worn, s.total, s.top.length, s.color, s.costs.length], [0, 0, 0, 0, null, 0]);
});

test('Farbe: Summe der Tragetage je Farbe, Teile ohne Farbe zählen nicht, Gleichstand alphabetisch', () => {
  const items = [it('a', { color: 'Blau' }), it('b', { color: 'Blau' }), it('c', { color: 'Grün' }), it('d')];
  const wears = [w('2026-11-01', 'a', 'c', 'd'), w('2026-11-02', 'b', 'c'), w('2026-11-03', 'c')];
  assert.deepEqual(summarize(items, wears, TODAY, '90').color, { name: 'Grün', count: 3 });
  assert.deepEqual(summarize([it('a', { color: 'Rot' }), it('b', { color: 'Blau' })], [w('2026-11-01', 'a', 'b')], TODAY, '90').color, { name: 'Blau', count: 1 });
  assert.equal(summarize([it('d')], [w('2026-11-01', 'd')], TODAY, '90').color, null);
});

test('Kosten pro Tragen: Preis durch alle Tragetage, je Währung getrennt, keine Mischrechnung', () => {
  const items = [it('a', { price: 100, cur: 'EUR' }), it('b', { price: 50, cur: 'EUR' }), it('c', { price: 80, cur: 'USD' }), it('d', { price: null }), it('e')];
  // a: 4 Tage insgesamt (3 davon alt), b: 1, c: 2, d und e ohne Preis
  const wears = [w('2025-01-01', 'a'), w('2025-02-01', 'a'), w('2025-03-01', 'a'), w('2026-11-01', 'a', 'b', 'c', 'd', 'e'), w('2026-11-02', 'c')];
  const s = summarize(items, wears, TODAY, '90');
  assert.deepEqual(s.costs, [{ cur: 'EUR', perWear: (100 + 50) / (4 + 1), items: 2 }, { cur: 'USD', perWear: 40, items: 1 }]);
  assert.equal(s.top.find(r => r.item.id === 'a').cost, 25, 'Teil: Preis durch alle Tragetage');
  assert.equal(s.top.find(r => r.item.id === 'd').cost, null);
});

test('Kosten: Preis 0 ist erlaubt, negative und unsinnige Preise zählen nicht', () => {
  const items = [it('a', { price: 0 }), it('b', { price: -5 }), it('c', { price: NaN }), it('d', { price: '20' })];
  const s = summarize(items, [w('2026-11-01', 'a', 'b', 'c', 'd')], TODAY, '90');
  assert.deepEqual(s.costs, [{ cur: 'EUR', perWear: 0, items: 1 }]);
});

test('Zeitraum wirkt auf Anzahl, nicht auf die Teile-Gesamtzahl', () => {
  const items = [it('a'), it('b')];
  const wears = [w('2025-12-01', 'a'), w('2026-11-01', 'b')];
  assert.equal(summarize(items, wears, TODAY, '90').worn, 1);
  assert.equal(summarize(items, wears, TODAY, 'year').worn, 2);
  assert.equal(summarize(items, wears, '2027-12-31', 'year').worn, 0);
  assert.equal(summarize(items, wears, TODAY, 'all').owned, 2);
});

test('Leere Daten und Einträge zu unbekannten Teilen', () => {
  const s = summarize([], [], TODAY, '90');
  assert.deepEqual([s.owned, s.worn, s.total, s.top, s.color, s.costs], [0, 0, 0, [], null, []]);
  assert.equal(summarize([it('a')], [w('2026-11-01', 'fremd')], TODAY, '90').worn, 0);
  assert.equal(summarize([it('a')], [], TODAY, 'all').worn, 0);
});

test('Ein Teil zweimal am selben Tag zählt einmal', () => {
  const s = summarize([it('a')], [w('2026-11-01', 'a'), { ...w('2026-11-01', 'a'), id: 'zweiter' }], TODAY, '90');
  assert.equal(s.top[0].count, 1);
});

test('addedDay liest den Zeitpunkt aus der Kennung', () => {
  assert.equal(addedDay(idAt('2026-05-04')), '2026-05-04');
  assert.equal(addedDay('i' + Date.now().toString(36) + 'xyz12'), new Date().toISOString().slice(0, 10).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1-$2-$3'), 'jetzt angelegt = heute (UTC)');
  assert.equal(addedDay('i' + (Date.now() + 5 * 86400000).toString(36) + 'xyz12'), null, 'Zukunft ist unbekannt');
  assert.equal(addedDay(idAt('2030-01-01'), Date.UTC(2026, 10, 13)), null);
  for (const bad of ['', 'a', 'i123', 'abc', 'i' + 'z'.repeat(13), 'x' + idAt('2026-05-04').slice(1), 'i00000000abcde', idAt('2026-05-04') + 'x', 'I' + idAt('2026-05-04').slice(1)])
    assert.equal(addedDay(bad), null, bad);
});

test('Aussortieren: Pause ab 90 Tage, genau 89 nicht, nie Getragene am Ende', () => {
  const items = [it('alt1'), it('alt2'), it('knapp'), it('grenz'), it('nie', { price: 50 }), it('nie2', { price: 90 }), it('neu', { price: 30 })];
  const wears = [w(addDays(TODAY, -120), 'alt1'), w(addDays(TODAY, -200), 'alt2'), w(addDays(TODAY, -89), 'knapp'), w(addDays(TODAY, -90), 'grenz')];
  const r = idleList(items, wears, TODAY);
  assert.deepEqual(r.map(x => x.item.id), ['alt2', 'alt1', 'grenz', 'nie2', 'nie', 'neu']);
  assert.equal(r[0].idle, 200); assert.equal(r[3].idle, null); assert.equal(r[3].last, null);
});

test('Aussortieren: neue Teile ohne Tragen bekommen 30 Tage Schonfrist', () => {
  const items = [it(idAt(addDays(TODAY, -10))), it(idAt(addDays(TODAY, -29))), it(idAt(addDays(TODAY, -30))), it(idAt(addDays(TODAY, -400))), it('altes-format')];
  const ids = idleList(items, [], TODAY).map(x => x.item.id);
  assert.deepEqual(ids.sort(), [items[2].id, items[3].id, 'altes-format'].sort());
  assert.equal(GRACE_DAYS, 30); assert.equal(IDLE_DAYS, 90);
});

test('Aussortieren: „Behalten“ ruht 90 Tage, danach wieder dabei; ungültiges Datum wirkt nicht', () => {
  const items = [it('a', { keep: addDays(TODAY, -10) }), it('b', { keep: addDays(TODAY, -89) }), it('c', { keep: addDays(TODAY, -90) }), it('d', { keep: 'kaputt' }), it('e', { keep: addDays(TODAY, 5) }), it('f')];
  assert.deepEqual(idleList(items, [], TODAY).map(x => x.item.id).sort(), ['c', 'd', 'e', 'f']);
  // Tragen nach „Behalten“ ändert die Lage nicht: das Teil ist ohnehin nicht mehr ruhend
  assert.deepEqual(idleList([it('a', { keep: addDays(TODAY, -10) })], [w(addDays(TODAY, -5), 'a')], TODAY), []);
});

test('Aussortieren: Wunschteile und Einträge aus der Zukunft', () => {
  const items = [it('w', { status: 'wish' }), it('a')];
  const wears = [w(addDays(TODAY, 3), 'a')];
  assert.deepEqual(idleList(items, wears, TODAY).map(x => x.item.id), ['a'], 'Zukunft zählt nicht als getragen, Wunschteil nie');
});

test('Aussortieren: gleicher Abstand sortiert nach Preis, dann Kennung', () => {
  const items = [it('b', { price: 10 }), it('a', { price: 10 }), it('c', { price: 99 })];
  const wears = [w(addDays(TODAY, -100), 'a', 'b', 'c')];
  assert.deepEqual(idleList(items, wears, TODAY).map(x => x.item.id), ['c', 'a', 'b']);
});

test('Große Bestände bleiben schnell', () => {
  const items = Array.from({ length: 2000 }, (_, i) => it('i' + i, { price: i, color: 'Blau' }));
  const wears = Array.from({ length: 20000 }, (_, i) => w(addDays('2025-01-01', i % 600), 'i' + (i % 2000), 'i' + ((i * 7) % 2000)));
  const t = performance.now();
  summarize(items, wears, TODAY, 'all'); summarize(items, wears, TODAY, '90'); idleList(items, wears, TODAY);
  assert.ok(performance.now() - t < 1500, 'zu langsam: ' + Math.round(performance.now() - t) + ' ms');
});

test('Farbpunkte: jede Farbe der App hat einen gültigen Farbwert, sonst nichts', async () => {
  const { SWATCH } = await import('../../js/stats.js');
  const { COLOR_NAMES } = await import('../../js/color.js');
  assert.deepEqual(Object.keys(SWATCH).sort(), [...COLOR_NAMES].sort());
  for (const v of Object.values(SWATCH)) assert.match(v, /^#[0-9a-f]{6}$/);
});
