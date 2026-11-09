import test from 'node:test';
import assert from 'node:assert/strict';
import { isDay, dayKey, daysBetween, addDays, shiftMonth, monthGrid, sanitizeWears, sanitizePlans, addWear, withoutItem, withoutOutfit, wearStats, costPerWear, dormant, idleText, WEAR_LIMITS } from '../../js/wear.js';
import { parseBackup, sanitizeText } from '../../js/scraper.js';

const CATS = ['Oberteil', 'Jacke', 'Hose/Rock', 'Schuhe', 'Accessoire'];
const clean = sanitizeText;

test('isDay akzeptiert nur echte Kalendertage', () => {
  for (const ok of ['2026-11-08', '2024-02-29', '2000-01-01', '2100-12-31']) assert.equal(isDay(ok), true, ok);
  for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '1999-12-31', '2101-01-01', '2026-1-1', '20261108', '', null, undefined, 20261108, '2026-11-08T00:00', ' 2026-11-08'])
    assert.equal(isDay(bad), false, String(bad));
});

test('dayKey nutzt den lokalen Tag, auch um Mitternacht und am Jahreswechsel', () => {
  assert.equal(dayKey(new Date(2026, 0, 1, 0, 0, 1)), '2026-01-01');
  assert.equal(dayKey(new Date(2026, 11, 31, 23, 59, 59)), '2026-12-31');
  assert.equal(dayKey(new Date(2026, 10, 8, 12)), '2026-11-08');
});

test('daysBetween und addDays rechnen über Monats-, Jahres- und Schaltgrenzen', () => {
  assert.equal(daysBetween('2026-11-08', '2026-11-08'), 0);
  assert.equal(daysBetween('2026-11-08', '2026-11-09'), 1);
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1);
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2);
  assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1);
  assert.equal(daysBetween('2026-11-10', '2026-11-08'), -2);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-11-08', 90), '2027-02-06');
});

test('daysBetween ist von Zeitumstellungen unabhängig', () => {
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);   // Umstellung auf Sommerzeit am 29.03.2026
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);   // zurück auf Winterzeit am 25.10.2026
});

test('monthGrid: 42 Tage, beginnt am Montag und enthält den ganzen Monat', () => {
  for (const [y, m] of [[2026, 10], [2026, 1], [2024, 1], [2026, 11], [2027, 0], [2025, 8]]) {
    const g = monthGrid(y, m);
    assert.equal(g.length, 42);
    assert.equal(new Date(g[0].key + 'T00:00:00Z').getUTCDay(), 1, `${y}-${m + 1} beginnt am Montag`);
    const inside = g.filter(c => c.inMonth).map(c => c.key);
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    assert.equal(inside.length, last);
    assert.equal(inside[0], `${y}-${String(m + 1).padStart(2, '0')}-01`);
    for (let i = 1; i < g.length; i++) assert.equal(daysBetween(g[i - 1].key, g[i].key), 1);
  }
});

test('monthGrid November 2026: 1. November ist ein Sonntag, Raster beginnt am 26. Oktober', () => {
  const g = monthGrid(2026, 10);
  assert.equal(g[0].key, '2026-10-26');
  assert.equal(g[0].inMonth, false);
  assert.equal(g[6].key, '2026-11-01');
  assert.equal(g[6].inMonth, true);
});

const ids = new Set(['a', 'b', 'c']);

test('sanitizeWears verwirft Unbrauchbares und behält Gültiges', () => {
  const out = sanitizeWears([
    { id: 'w1', d: '2026-11-02', o: 'o1', n: 'Büro', items: ['a', 'b'] },
    { id: 'w2', d: '2026-02-30', n: 'Falsches Datum', items: ['a'] },
    { id: 'w3', d: '2026-11-03', n: 'Nur Unbekanntes', items: ['x', 'y'] },
    { id: 'w4', d: '2026-11-04', n: 'Gemischt', items: ['a', 'x', 'a', 7, null, 'c'] },
    null, 5, 'text', { d: '2026-11-05' }, { d: '2026-11-05', items: 'a' },
  ], ids, clean);
  assert.deepEqual(out.map(w => w.id), ['w1', 'w4']);
  assert.deepEqual(out[1].items, ['a', 'c']);
  assert.equal(out[0].o, 'o1');
  assert.equal('o' in out[1], false);
});

test('sanitizeWears reinigt Namen, vergibt fehlende Kennungen und macht doppelte eindeutig', () => {
  const out = sanitizeWears([
    { d: '2026-11-02', n: '<img src=x onerror=alert(1)>Büro‮', items: ['a'] },
    { id: 'dup', d: '2026-11-03', n: '', items: ['a'] },
    { id: 'dup', d: '2026-11-04', n: 'x', items: ['b'] },
    { id: 'x'.repeat(65), d: '2026-11-05', n: 'lang', items: ['a'] },
  ], ids, clean);
  assert.equal(out.length, 4);
  assert.equal(out[0].n, 'Büro');
  assert.equal(out[1].n, 'Outfit');
  assert.equal(new Set(out.map(w => w.id)).size, 4, 'Kennungen eindeutig');
  for (const w of out) assert.ok(w.id.length > 0 && w.id.length <= WEAR_LIMITS.idLength);
});

test('sanitizeWears sortiert nach Tag und begrenzt Anzahl und Teile je Eintrag', () => {
  const many = Array.from({ length: WEAR_LIMITS.wears + 50 }, (_, i) => ({ id: 'w' + i, d: '2026-11-08', n: 'n', items: ['a'] }));
  assert.equal(sanitizeWears(many, ids, clean).length, WEAR_LIMITS.wears);
  const big = new Set(Array.from({ length: 200 }, (_, i) => 'i' + i));
  const [w] = sanitizeWears([{ id: 'w', d: '2026-11-08', n: 'n', items: [...big] }], big, clean);
  assert.equal(w.items.length, WEAR_LIMITS.itemsPerWear);
  const sorted = sanitizeWears([{ id: '1', d: '2026-11-09', items: ['a'] }, { id: '2', d: '2026-11-01', items: ['a'] }, { id: '3', d: '2026-11-05', items: ['a'] }], ids, clean);
  assert.deepEqual(sorted.map(w => w.d), ['2026-11-01', '2026-11-05', '2026-11-09']);
});

test('sanitizeWears verträgt jede Art Eingabe', () => {
  for (const v of [undefined, null, 0, 'x', {}, [], [[]], [null], {length: 3}]) assert.deepEqual(sanitizeWears(v, ids, clean), []);
});

test('sanitizePlans behält nur echte Tage mit bekannten Outfits', () => {
  const oids = new Set(['o1', 'o2']);
  assert.deepEqual(sanitizePlans({ '2026-11-09': 'o1', '2026-11-10': 'zz', '2026-13-01': 'o1', '2026-11-11': 5, '__proto__': 'o1', 'constructor': 'o2' }, oids), { '2026-11-09': 'o1' });
  for (const v of [null, undefined, [], 'x', 3]) assert.deepEqual(sanitizePlans(v, oids), {});
  assert.equal(Object.getPrototypeOf(sanitizePlans({ '2026-11-09': 'o1' }, oids)), Object.prototype);
});

test('addWear: selbes Outfit am selben Tag zählt nur einmal, anderes Outfit am selben Tag ist erlaubt', () => {
  const e1 = { id: 'w1', d: '2026-11-08', o: 'o1', n: 'Büro', items: ['a', 'b'] };
  const l1 = addWear([], e1);
  assert.equal(l1.length, 1);
  assert.equal(addWear(l1, { ...e1, id: 'w2' }), null);
  assert.equal(addWear(l1, { ...e1, id: 'w3', o: 'o2' }).length, 2);
  assert.equal(addWear(l1, { id: 'w4', d: '2026-11-09', o: 'o1', n: 'Büro', items: ['a'] }).length, 2);
});

test('addWear lehnt ungültige Einträge ab, dedupliziert Teile und hält die Liste sortiert', () => {
  assert.equal(addWear([], { id: 'w', d: 'heute', n: 'x', items: ['a'] }), null);
  assert.equal(addWear([], { id: 'w', d: '2026-11-08', n: 'x', items: [] }), null);
  const l = addWear(addWear([], { id: 'w1', d: '2026-11-09', n: 'x', items: ['a', 'a', 'b'] }), { id: 'w2', d: '2026-11-01', n: 'y', items: ['a'] });
  assert.deepEqual(l.map(w => w.id), ['w2', 'w1']);
  assert.deepEqual(l[1].items, ['a', 'b']);
});

test('addWear ändert die übergebene Liste nicht', () => {
  const l = [];
  addWear(l, { id: 'w', d: '2026-11-08', n: 'x', items: ['a'] });
  assert.equal(l.length, 0);
});

test('withoutItem entfernt das Teil überall; leere Einträge fallen weg', () => {
  const w = [{ id: '1', d: '2026-11-01', n: 'a', items: ['a'] }, { id: '2', d: '2026-11-02', n: 'b', items: ['a', 'b'] }, { id: '3', d: '2026-11-03', n: 'c', items: ['b'] }];
  const r = withoutItem(w, 'a');
  assert.deepEqual(r.map(x => x.id), ['2', '3']);
  assert.deepEqual(r[0].items, ['b']);
  assert.deepEqual(w[1].items, ['a', 'b'], 'Original unverändert');
});

test('withoutOutfit entfernt Pläne für das Outfit', () => {
  assert.deepEqual(withoutOutfit({ '2026-11-09': 'o1', '2026-11-10': 'o2', '2026-11-11': 'o1' }, 'o1'), { '2026-11-10': 'o2' });
});

test('wearStats zählt verschiedene Tage, nicht Einträge', () => {
  const w = [
    { id: '1', d: '2026-11-01', n: 'a', items: ['a', 'b'] },
    { id: '2', d: '2026-11-01', n: 'b', items: ['a'] },
    { id: '3', d: '2026-11-05', n: 'c', items: ['a'] },
  ];
  const s = wearStats(w);
  assert.deepEqual(s.get('a'), { count: 2, last: '2026-11-05' });
  assert.deepEqual(s.get('b'), { count: 1, last: '2026-11-01' });
  assert.equal(s.has('c'), false);
});

test('wearStats mit Stichtag ignoriert spätere Einträge', () => {
  const w = [{ id: '1', d: '2026-11-01', n: 'a', items: ['a'] }, { id: '2', d: '2026-11-20', n: 'b', items: ['a'] }];
  assert.deepEqual(wearStats(w, '2026-11-10').get('a'), { count: 1, last: '2026-11-01' });
});

test('costPerWear', () => {
  assert.equal(costPerWear(100, 4), 25);
  assert.equal(costPerWear(0, 3), 0);
  assert.equal(costPerWear(59.9, 1), 59.9);
  for (const [p, c] of [[null, 3], [undefined, 3], [100, 0], [-5, 2], [NaN, 2], [Infinity, 2], ['100', 2]]) assert.equal(costPerWear(p, c), null, `${p}/${c}`);
});

test('dormant: nur besessene Teile, längste Pause zuerst, nie getragene zuletzt (teuerste zuerst)', () => {
  const items = [
    { id: 'a', price: 50 }, { id: 'b', price: 10 }, { id: 'c', price: 200 }, { id: 'd', price: 80, status: 'wish' },
    { id: 'e', price: 30, status: 'own' }, { id: 'f', price: null },
  ];
  const w = [
    { id: '1', d: '2026-05-01', n: 'x', items: ['a'] },     // 191 Tage
    { id: '2', d: '2026-11-01', n: 'x', items: ['b'] },     // 7 Tage → nicht ruhend
    { id: '3', d: '2026-07-01', n: 'x', items: ['e'] },     // 130 Tage
  ];
  const r = dormant(items, w, '2026-11-08', 90);
  assert.deepEqual(r.map(x => x.item.id), ['a', 'e', 'c', 'f']);
  assert.equal(r[0].idle, 191);
  assert.equal(r[2].idle, null);
  assert.equal(r[2].last, null);
});

test('dormant: Grenze liegt genau bei idleDays; Einträge nach dem Stichtag zählen nicht', () => {
  const items = [{ id: 'a' }];
  assert.equal(dormant(items, [{ id: '1', d: '2026-08-10', n: 'x', items: ['a'] }], '2026-11-08', 90).length, 1);   // 90 Tage
  assert.equal(dormant(items, [{ id: '1', d: '2026-08-11', n: 'x', items: ['a'] }], '2026-11-08', 90).length, 0);   // 89 Tage
  assert.equal(dormant(items, [{ id: '1', d: '2026-12-01', n: 'x', items: ['a'] }], '2026-11-08', 90)[0].idle, null);
});

test('idleText', () => {
  assert.equal(idleText(0), 'heute');
  assert.equal(idleText(1), 'gestern');
  assert.equal(idleText(12), 'vor 12 Tagen');
  assert.equal(idleText(59), 'vor 59 Tagen');
  assert.equal(idleText(91), 'vor 3 Monaten');
  assert.equal(idleText(365), 'vor 12 Monaten');
});

const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const backup = extra => JSON.stringify({ items: [{ id: 'a', name: 'Hemd', cat: 'Oberteil', img: IMG, price: 40, cur: 'EUR' }, { id: 'b', name: 'Hose', cat: 'Hose/Rock', img: IMG }], outfits: [{ id: 'o1', name: 'Büro', pieces: [] }], ...extra });

test('parseBackup liest Tragen-Protokoll und Pläne, prüft sie aber gegen Teile und Outfits', () => {
  const r = parseBackup(backup({
    wears: [{ id: 'w1', d: '2026-11-02', o: 'o1', n: 'Büro', items: ['a', 'b', 'gone'] }, { id: 'w2', d: '2026-11-03', n: 'Fremd', items: ['gone'] }],
    plans: { '2026-11-12': 'o1', '2026-11-13': 'unbekannt' },
  }), CATS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.wears.map(w => [w.id, w.items]), [['w1', ['a', 'b']]]);
  assert.deepEqual(r.plans, { '2026-11-12': 'o1' });
});

test('parseBackup: ältere Backups ohne Protokoll bleiben gültig', () => {
  const r = parseBackup(backup({}), CATS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.wears, []);
  assert.deepEqual(r.plans, {});
});

test('parseBackup: kaputte Protokolldaten machen das Backup nicht ungültig', () => {
  for (const bad of [{ wears: 'x', plans: 5 }, { wears: { a: 1 }, plans: [] }, { wears: [null, 3, {}], plans: { x: 1 } }]) {
    const r = parseBackup(backup(bad), CATS);
    assert.equal(r.ok, true);
    assert.deepEqual(r.wears, []);
    assert.deepEqual(r.plans, {});
  }
});

test('shiftMonth bleibt im Nachbarmonat und kürzt auf den Monatsletzten', () => {
  assert.equal(shiftMonth('2026-11-08', 1), '2026-12-08');
  assert.equal(shiftMonth('2026-12-15', 1), '2027-01-15');
  assert.equal(shiftMonth('2026-01-31', 1), '2026-02-28');
  assert.equal(shiftMonth('2024-01-31', 1), '2024-02-29');
  assert.equal(shiftMonth('2026-03-31', -1), '2026-02-28');
  assert.equal(shiftMonth('2026-01-10', -1), '2025-12-10');
  assert.equal(shiftMonth('2026-05-31', 13), '2027-06-30');
});
